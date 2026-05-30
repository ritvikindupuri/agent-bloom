// Deterministic block-rule synthesis from a campaign fingerprint.
// No AI tax — these are real, copy-pasteable rules for major edge stacks.

export type CampaignLike = {
  name: string;
  signature_hash: string;
  fingerprint: {
    ua_family?: string;
    webgl_renderer?: string;
    canvas_hash?: string;
    top_ip?: string | null;
    top_reasons?: string[];
    avg_score?: number;
  };
  ip_count: number;
  event_count: number;
};

export type Target =
  | "cloudflare"
  | "nginx"
  | "caddy"
  | "haproxy"
  | "aws_waf"
  | "iptables"
  | "fastly_vcl";

// Best-effort UA substring → expression value. Falls back to the family token.
function uaPattern(family: string | undefined): string {
  if (!family) return "bot";
  const map: Record<string, string> = {
    HeadlessChrome: "HeadlessChrome",
    "python-requests": "python-requests",
    curl: "curl/",
    "go-http": "Go-http-client",
    "node-fetch": "node-fetch",
    Scrapy: "Scrapy",
    Bingbot: "bingbot",
    Googlebot: "Googlebot",
    GPTBot: "GPTBot",
    ClaudeBot: "ClaudeBot",
    AhrefsBot: "AhrefsBot",
  };
  return map[family] ?? family.split("/")[0];
}

function sigTag(c: CampaignLike) {
  return c.signature_hash.replace(/[^a-z0-9]/gi, "").slice(0, 8);
}

export function generateBlockRule(c: CampaignLike, target: Target): string {
  const ua = uaPattern(c.fingerprint.ua_family);
  const ip = c.fingerprint.top_ip || null;
  const tag = sigTag(c);
  const name = c.name.replace(/[^a-z0-9_-]/gi, "_").slice(0, 40);
  const header = `# Chaff campaign: ${c.name} (sig ${c.signature_hash}) · ${c.event_count} events / ${c.ip_count} IPs`;

  switch (target) {
    case "cloudflare":
      return [
        header,
        `# Paste into: Security → WAF → Custom rules → Edit expression`,
        `(http.user_agent contains "${ua}")${ip ? ` or (ip.src eq ${ip})` : ""}`,
        `# Action: Block`,
      ].join("\n");

    case "nginx":
      return [
        header,
        ip ? `deny ${ip};` : `# (no single top IP — UA filter only)`,
        ``,
        `# In http {} block:`,
        `map $http_user_agent $chaff_${tag} {`,
        `    default 0;`,
        `    "~*${ua}" 1;`,
        `}`,
        ``,
        `# In server {} block:`,
        `if ($chaff_${tag}) { return 403; }`,
      ].join("\n");

    case "caddy":
      return [
        header,
        `@chaff_${tag} {`,
        `  header User-Agent *${ua}*`,
        ip ? `  remote_ip ${ip}` : `  # remote_ip <add IP if needed>`,
        `}`,
        `respond @chaff_${tag} "Forbidden" 403`,
      ].join("\n");

    case "haproxy":
      return [
        header,
        `acl chaff_${tag}_ua hdr_sub(user-agent) -i ${ua}`,
        ip ? `acl chaff_${tag}_ip src ${ip}` : `# acl chaff_${tag}_ip src <ip>`,
        `http-request deny if chaff_${tag}_ua${ip ? ` || chaff_${tag}_ip` : ""}`,
      ].join("\n");

    case "aws_waf":
      return JSON.stringify(
        {
          Name: `chaff-${name}-${tag}`,
          Priority: 100,
          Action: { Block: {} },
          Statement: {
            OrStatement: {
              Statements: [
                {
                  ByteMatchStatement: {
                    SearchString: ua,
                    FieldToMatch: { SingleHeader: { Name: "user-agent" } },
                    TextTransformations: [{ Priority: 0, Type: "LOWERCASE" }],
                    PositionalConstraint: "CONTAINS",
                  },
                },
                ...(ip
                  ? [
                      {
                        IPSetReferenceStatement: {
                          ARN: "<arn-of-ipset-containing-" + ip + ">",
                        },
                      },
                    ]
                  : []),
              ],
            },
          },
          VisibilityConfig: {
            SampledRequestsEnabled: true,
            CloudWatchMetricsEnabled: true,
            MetricName: `chaff_${tag}`,
          },
        },
        null,
        2
      );

    case "fastly_vcl":
      return [
        header,
        `# In vcl_recv:`,
        `if (req.http.User-Agent ~ "(?i)${ua}"${ip ? ` || client.ip == "${ip}"` : ""}) {`,
        `  error 403 "Blocked by Chaff";`,
        `}`,
      ].join("\n");

    case "iptables":
      return [
        header,
        ip
          ? `iptables -A INPUT -s ${ip} -j DROP`
          : `# No single top IP — iptables only useful with a concrete address.`,
        `# (UA filtering is L7 — use nginx/caddy/haproxy upstream.)`,
      ].join("\n");
  }
}

export const TARGETS: { id: Target; label: string }[] = [
  { id: "cloudflare", label: "Cloudflare" },
  { id: "nginx", label: "nginx" },
  { id: "caddy", label: "Caddy" },
  { id: "haproxy", label: "HAProxy" },
  { id: "aws_waf", label: "AWS WAF" },
  { id: "fastly_vcl", label: "Fastly VCL" },
  { id: "iptables", label: "iptables" },
];
