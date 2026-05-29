// Traffic Harvester: given a target URL, the server probes it with a curated
// mix of real bot/browser user-agents, captures real HTTP responses, and ships
// each as an access-log document into the user's Elasticsearch index.
//
// Gemini is used to (a) suggest a realistic probe plan (paths to hit, mix of
// UAs) and (b) summarize what was harvested. All HTTP requests are REAL.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureChaffIndex, indexEvent } from "./es-chaff.server";
import { classifyUA } from "./bot-detect";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const UA_POOL: { ua: string; family: string; kind: "human" | "good-bot" | "bad-bot" }[] = [
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", family: "Chrome/124", kind: "human" },
  { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15", family: "Safari", kind: "human" },
  { ua: "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0", family: "Firefox/125", kind: "human" },
  { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1", family: "Mobile Safari", kind: "human" },
  { ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", family: "Googlebot", kind: "good-bot" },
  { ua: "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", family: "Bingbot", kind: "good-bot" },
  { ua: "python-requests/2.31.0", family: "python-requests", kind: "bad-bot" },
  { ua: "curl/8.4.0", family: "curl", kind: "bad-bot" },
  { ua: "Go-http-client/1.1", family: "go-http", kind: "bad-bot" },
  { ua: "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/124.0.0.0 Safari/537.36", family: "HeadlessChrome", kind: "bad-bot" },
  { ua: "Scrapy/2.11.0 (+https://scrapy.org)", family: "Scrapy", kind: "bad-bot" },
  { ua: "GPTBot/1.0 (+https://openai.com/gptbot)", family: "GPTBot", kind: "good-bot" },
  { ua: "ClaudeBot/1.0 (+claudebot@anthropic.com)", family: "ClaudeBot", kind: "good-bot" },
  { ua: "facebookexternalhit/1.1", family: "facebookexternalhit", kind: "good-bot" },
  { ua: "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", family: "AhrefsBot", kind: "bad-bot" },
];


async function planPaths(target: URL, count: number): Promise<string[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  const fallback = ["/", "/robots.txt", "/sitemap.xml", "/favicon.ico"];
  if (!apiKey) return fallback;
  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You generate realistic crawl paths a mix of browsers and bots would hit on a given website. Return ONLY a JSON array of url paths starting with /. No prose." },
          { role: "user", content: `Target: ${target.href}\nReturn ~${Math.min(count, 12)} varied paths (mix of /, common pages, /api/*, /admin, /wp-login.php style probes that scanners try). JSON array only.` },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const json: any = await res.json();
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return fallback;
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return fallback;
    const cleaned = arr.map((s) => String(s)).filter((s) => s.startsWith("/")).slice(0, count);
    return cleaned.length ? cleaned : fallback;
  } catch {
    return fallback;
  }
}

export const harvestTraffic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { target: string; count?: number }) =>
    z.object({
      target: z.string().url().max(2048),
      count: z.number().int().min(1).max(40).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const count = data.count ?? 20;
    let target: URL;
    try { target = new URL(data.target); } catch { throw new Error("Invalid URL"); }
    if (!/^https?:$/.test(target.protocol)) throw new Error("Only http(s) targets allowed");

    // Block private/loopback hosts (basic SSRF guard)
    const host = target.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === "0.0.0.0"
    ) {
      throw new Error("Refusing to probe private/loopback host");
    }

    // Need user's ES connection
    const { data: conn } = await supabaseAdmin
      .from("es_connections")
      .select("endpoint,api_key,is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (!conn) throw new Error("No active Elasticsearch connection. Add one in Connection first.");
    const auth = { endpoint: conn.endpoint as string, apiKey: conn.api_key as string };

    await ensureChaffIndex(auth, userId);

    const paths = await planPaths(target, count);
    const probes: { path: string; ua: typeof UA_POOL[number] }[] = [];
    for (let i = 0; i < count; i++) {
      probes.push({ path: paths[i % paths.length], ua: UA_POOL[i % UA_POOL.length] });
    }

    let indexed = 0;
    const samples: any[] = [];
    let errors = 0;

    for (const p of probes) {
      const url = new URL(p.path, target.origin).href;
      const started = Date.now();
      let status = 0;
      let bytes = 0;
      let err: string | null = null;
      try {
        const r = await fetch(url, {
          method: "GET",
          headers: { "User-Agent": p.ua.ua, Accept: "*/*" },
          redirect: "manual",
          signal: AbortSignal.timeout(8000),
        });
        status = r.status;
        const buf = await r.arrayBuffer().catch(() => new ArrayBuffer(0));
        bytes = buf.byteLength;
      } catch (e: any) {
        err = String(e?.message ?? e).slice(0, 200);
      }
      const latency = Date.now() - started;
      const cls = classifyUA(p.ua.ua);
      const ip = pseudoIp(p.ua.family + ":" + target.hostname);
      const doc = {
        "@timestamp": new Date().toISOString(),
        verdict: p.ua.kind === "bad-bot" ? "bot" : p.ua.kind === "good-bot" ? "suspect" : "human",
        score: p.ua.kind === "bad-bot" ? 75 : p.ua.kind === "good-bot" ? 35 : 5,
        reasons: [
          `harvested probe`,
          cls.reason ? `ua: ${cls.reason}` : `ua_family: ${p.ua.family}`,
          err ? `transport_error: ${err}` : `http ${status} · ${bytes}b · ${latency}ms`,
        ],
        signature_hash: p.ua.family.toLowerCase().replace(/\W+/g, "_"),
        ua_family: p.ua.family,
        slug: null,
        is_honeypot_hit: false,
        ip,
        ip_str: ip,
        country: null,
        path: p.path,
        origin: target.origin,
        referrer: null,
        dwell_ms: latency,
        ua: p.ua.ua,
        canvas_hash: null,
        webgl_vendor: null,
        webgl_renderer: null,
        raw: { harvested: true, target: target.href, status, bytes, latency_ms: latency, error: err },
      };
      try {
        await indexEvent(auth, userId, doc);
        indexed++;
        if (samples.length < 5) samples.push({ path: p.path, ua_family: p.ua.family, status, latency, verdict: doc.verdict });
      } catch {
        errors++;
      }
    }

    return { indexed, errors, target: target.href, samples, plannedPaths: paths };
  });
