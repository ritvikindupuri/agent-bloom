// IP enrichment: reverse-DNS verified-bot detection + heuristic confidence scoring.
// Worker-safe: uses Cloudflare DNS-over-HTTPS, no Node `dns` module.

export type VerifiedBotKind = "googlebot" | "bingbot" | "applebot" | "duckduckbot" | "yandexbot" | "facebookbot" | "twitterbot" | "linkedinbot" | "ahrefsbot" | "semrushbot" | null;

export type IpEnrichment = {
  ip: string;
  rdns: string | null;
  verifiedBot: VerifiedBotKind;
  isDatacenter: boolean;
  isTor: boolean;
  confidence: number;       // 0-100 — likelihood this IP is a malicious bot
  classification: "verified_bot" | "malicious" | "suspicious" | "benign" | "unknown";
  reasons: string[];
};

const VERIFIED_BOT_SUFFIXES: { suffix: string; kind: NonNullable<VerifiedBotKind> }[] = [
  { suffix: ".googlebot.com", kind: "googlebot" },
  { suffix: ".google.com", kind: "googlebot" },
  { suffix: ".search.msn.com", kind: "bingbot" },
  { suffix: ".applebot.apple.com", kind: "applebot" },
  { suffix: ".duckduckgo.com", kind: "duckduckbot" },
  { suffix: ".yandex.com", kind: "yandexbot" },
  { suffix: ".yandex.net", kind: "yandexbot" },
  { suffix: ".yandex.ru", kind: "yandexbot" },
  { suffix: ".crawl.facebook.com", kind: "facebookbot" },
  { suffix: ".fbsv.net", kind: "facebookbot" },
  { suffix: ".twttr.com", kind: "twitterbot" },
  { suffix: ".linkedin.com", kind: "linkedinbot" },
  { suffix: ".ahrefs.com", kind: "ahrefsbot" },
  { suffix: ".semrush.com", kind: "semrushbot" },
];

// Common datacenter / hosting-provider rDNS patterns. Heuristic — not exhaustive.
const DATACENTER_PATTERNS = [
  /\.amazonaws\.com$/i, /\.compute\.amazonaws\.com$/i,
  /\.googleusercontent\.com$/i, /\.bc\.googleusercontent\.com$/i,
  /\.azure\.com$/i, /\.cloudapp\.net$/i,
  /\.digitalocean\.com$/i, /\.do-user\..*/i,
  /\.linode\.com$/i, /\.members\.linode\.com$/i,
  /\.vultr\.com$/i, /\.vultrusercontent\.com$/i,
  /\.hetzner\.de$/i, /\.your-server\.de$/i,
  /\.ovh\.net$/i, /\.ovh\.ca$/i, /\.kimsufi\.com$/i,
  /\.contabo\.net$/i, /\.contabo\.host$/i,
  /\.scaleway\.com$/i,
  /\.oraclecloud\.com$/i,
];

const TOR_PATTERNS = [/\.tor-exit\./i, /tor-exit/i, /\.torservers\.net$/i];

function ipToReverseArpa(ip: string): string | null {
  // IPv4
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) return `${v4[4]}.${v4[3]}.${v4[2]}.${v4[1]}.in-addr.arpa`;
  // Minimal IPv6 support — skip exotic formats
  if (ip.includes(":")) {
    try {
      const expanded = expandIpv6(ip);
      const nibbles = expanded.replace(/:/g, "").split("").reverse().join(".");
      return `${nibbles}.ip6.arpa`;
    } catch {
      return null;
    }
  }
  return null;
}

function expandIpv6(ip: string): string {
  const [head, tail] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const fillCount = 8 - headParts.length - tailParts.length;
  const parts = [
    ...headParts,
    ...Array(Math.max(fillCount, 0)).fill("0"),
    ...tailParts,
  ];
  return parts.map((p) => p.padStart(4, "0")).join(":");
}

async function reverseDns(ip: string): Promise<string | null> {
  const arpa = ipToReverseArpa(ip);
  if (!arpa) return null;
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${arpa}&type=PTR`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const ans = (j.Answer ?? []).find((a: any) => a.type === 12);
    if (!ans?.data) return null;
    return String(ans.data).replace(/\.$/, "").toLowerCase();
  } catch {
    return null;
  }
}

// Forward-confirm the verified-bot claim. RFC: a real Googlebot reverse-resolves
// to *.googlebot.com AND that hostname forward-resolves back to the same IP.
async function forwardLookup(host: string): Promise<string[]> {
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j.Answer ?? []).filter((a: any) => a.type === 1).map((a: any) => a.data);
  } catch {
    return [];
  }
}

function matchVerifiedBot(host: string): VerifiedBotKind {
  const h = host.toLowerCase();
  for (const { suffix, kind } of VERIFIED_BOT_SUFFIXES) {
    if (h.endsWith(suffix)) return kind;
  }
  return null;
}

function isDatacenter(host: string): boolean {
  return DATACENTER_PATTERNS.some((re) => re.test(host));
}

function isTor(host: string): boolean {
  return TOR_PATTERNS.some((re) => re.test(host));
}

const SUSPICIOUS_UA_PATTERNS = [
  /python-requests/i, /\bcurl\//i, /Go-http-client/i, /libwww/i,
  /scrapy/i, /HeadlessChrome/i, /PhantomJS/i, /node-fetch/i, /axios/i,
  /\bwget\b/i, /Java\//i, /okhttp/i, /aiohttp/i, /httpx/i, /selenium/i,
];

export function scoreUserAgent(ua: string | null | undefined): { score: number; reason?: string } {
  if (!ua) return { score: 25, reason: "missing user-agent" };
  for (const re of SUSPICIOUS_UA_PATTERNS) {
    if (re.test(ua)) return { score: 40, reason: `automation UA: ${re.source.replace(/\\/g, "")}` };
  }
  if (ua.length < 20) return { score: 15, reason: "abnormally short user-agent" };
  return { score: 0 };
}

export async function enrichIp(
  ip: string,
  context: { eventCount?: number; sampleUserAgent?: string | null } = {},
): Promise<IpEnrichment> {
  const reasons: string[] = [];
  let confidence = 20; // base suspicion if it surfaced in a detector at all
  if (context.eventCount && context.eventCount > 0) {
    reasons.push(`${context.eventCount.toLocaleString()} matching events in 24h`);
    if (context.eventCount > 1000) confidence += 25;
    else if (context.eventCount > 100) confidence += 15;
    else if (context.eventCount > 10) confidence += 5;
  }

  const rdns = await reverseDns(ip);
  if (!rdns) {
    reasons.push("no reverse-DNS record (often residential proxy or fresh allocation)");
    confidence += 10;
    const uaScore = scoreUserAgent(context.sampleUserAgent);
    if (uaScore.reason) reasons.push(uaScore.reason);
    confidence += uaScore.score;
    return {
      ip, rdns: null, verifiedBot: null, isDatacenter: false, isTor: false,
      confidence: Math.min(100, confidence),
      classification: confidence >= 60 ? "malicious" : confidence >= 35 ? "suspicious" : "unknown",
      reasons,
    };
  }

  // Forward-confirmation: if rDNS claims to be a verified bot, verify the IP comes back.
  const claimedBot = matchVerifiedBot(rdns);
  if (claimedBot) {
    const forwardIps = await forwardLookup(rdns);
    if (forwardIps.includes(ip)) {
      return {
        ip, rdns, verifiedBot: claimedBot,
        isDatacenter: false, isTor: false,
        confidence: 0,
        classification: "verified_bot",
        reasons: [`forward-confirmed ${claimedBot} (${rdns})`],
      };
    }
    // Spoofed PTR — VERY suspicious.
    reasons.push(`spoofed PTR claiming ${claimedBot} (${rdns}) — forward lookup did NOT return ${ip}`);
    confidence += 40;
  }

  const dc = isDatacenter(rdns);
  const tor = isTor(rdns);
  if (dc) {
    reasons.push(`datacenter origin (${rdns})`);
    confidence += 20;
  }
  if (tor) {
    reasons.push(`Tor exit node (${rdns})`);
    confidence += 35;
  }
  if (!dc && !tor && !claimedBot) {
    reasons.push(`residential/ISP origin (${rdns})`);
  }

  const uaScore = scoreUserAgent(context.sampleUserAgent);
  if (uaScore.reason) reasons.push(uaScore.reason);
  confidence += uaScore.score;

  confidence = Math.max(0, Math.min(100, confidence));
  const classification: IpEnrichment["classification"] =
    confidence >= 70 ? "malicious" :
    confidence >= 40 ? "suspicious" :
    confidence >= 15 ? "unknown" : "benign";

  return { ip, rdns, verifiedBot: null, isDatacenter: dc, isTor: tor, confidence, classification, reasons };
}

export async function enrichIps(
  inputs: { ip: string; eventCount?: number; sampleUserAgent?: string | null }[],
  concurrency = 6,
): Promise<IpEnrichment[]> {
  const out: IpEnrichment[] = [];
  const queue = [...inputs];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()!;
      out.push(await enrichIp(item.ip, { eventCount: item.eventCount, sampleUserAgent: item.sampleUserAgent }));
    }
  });
  await Promise.all(workers);
  return out;
}
