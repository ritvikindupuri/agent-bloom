// One-shot "Activate Chaff" pipeline. Takes a site URL + ES credentials
// and does everything: site recon, schema auto-detect, custom detector pack.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { scanUrl } from "./onboard.server";
import { esPing, esRequest, esSearch, type EsAuth } from "./es.server";
import { enrichIps, type IpEnrichment } from "./ip-intel.server";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

type DetectedSchema = {
  timestamp_field: string;
  ip_field: string;
  user_agent_field: string;
  url_field: string;
  status_field: string;
  notes?: string;
};

type Offender = IpEnrichment & { eventCount: number; sampleUserAgent: string | null };

type Detector = {
  id: string;
  name: string;
  rationale: string; // why this rule exists FOR THIS SITE
  severity: "low" | "medium" | "high" | "critical";
  target_path?: string;
  es_query: any; // ES bool query body
  match_count?: number;             // total raw matches
  match_count_clean?: number;       // excluding verified bots
  offenders?: Offender[];           // top enriched IPs
};

async function callAI(messages: any[], responseSchema?: any): Promise<any> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const body: any = { model: MODEL, messages };
  if (responseSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "out", strict: true, schema: responseSchema },
    };
  }
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 429) throw new Error("AI rate-limited. Try again in a minute.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace → Usage.");
    throw new Error(`AI ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(content); } catch { return content; }
}

async function sampleOneDoc(auth: EsAuth, indexPattern: string): Promise<any | null> {
  try {
    const res: any = await esSearch(auth, indexPattern, { size: 1, query: { match_all: {} } });
    return res?.hits?.hits?.[0]?._source ?? null;
  } catch {
    return null;
  }
}

function flattenKeys(obj: any, prefix = "", out: string[] = []): string[] {
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flattenKeys(v, path, out);
    else out.push(path);
  }
  return out;
}

async function detectSchemaFromSample(sample: any): Promise<DetectedSchema> {
  const fields = flattenKeys(sample).slice(0, 80);
  const SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["timestamp_field", "ip_field", "user_agent_field", "url_field", "status_field"],
    properties: {
      timestamp_field: { type: "string" },
      ip_field: { type: "string" },
      user_agent_field: { type: "string" },
      url_field: { type: "string" },
      status_field: { type: "string" },
      notes: { type: "string" },
    },
  };
  const out = await callAI(
    [
      { role: "system", content: "You map Elasticsearch document fields to standard web-access-log roles. Pick the BEST matching field name from the provided list for each role. Use exact field names from the list. If a role has no good match, pick the closest available." },
      { role: "user", content: `Sample document fields:\n${JSON.stringify(fields, null, 2)}\n\nSample values (truncated):\n${JSON.stringify(sample, null, 2).slice(0, 2500)}\n\nReturn the field mapping.` },
    ],
    SCHEMA,
  );
  return out as DetectedSchema;
}

async function generateDetectorPack(args: {
  siteUrl: string;
  stackId: string;
  stackLabel: string;
  suspectedSurface: { path: string; reason: string }[];
  baitPaths: string[];
  title: string | null;
  schema: DetectedSchema;
}): Promise<Detector[]> {
  const SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["detectors"],
    properties: {
      detectors: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "name", "rationale", "severity", "es_query"],
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            rationale: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
            target_path: { type: "string" },
            es_query: {
              type: "object",
              additionalProperties: true,
            },
          },
        },
      },
    },
  };

  const sys = `You are a senior bot-detection engineer at a security company. Given a recon report of a customer's website, you write a custom pack of Elasticsearch detection rules TAILORED TO THAT SPECIFIC SITE — not generic ones.

Output 4 to 6 detectors. Each detector's es_query MUST be a valid Elasticsearch query DSL "bool" query object (just the bool body, e.g. { "bool": { "filter": [...], "must": [...] } }) that will be wrapped inside a search request that adds a time range filter. Use the schema's field names verbatim.

Each detector must:
- Reference SPECIFIC paths from the recon (e.g. the actual /wp-login.php or /api/products we found), not placeholders.
- Have a "rationale" explaining why THIS rule matters for THIS site.
- Use realistic ES patterns: wildcards, terms, range, regexp on user-agent, etc.
- Prefer .keyword subfields for term/wildcard on text fields.

Detector types to consider based on what's in the recon:
- Credential stuffing on actual login paths
- API scraping with abnormal rate or missing common headers (e.g. UA matches "python-requests|curl|Go-http-client|libwww|scrapy" via regexp)
- Admin/sensitive-path probing (using the bait paths)
- 4xx burst from single IP (status >= 400)
- Headless browser fingerprints (UA containing "HeadlessChrome", "PhantomJS")
- High-volume single-IP enumeration

Be SPECIFIC. Generic rules are not acceptable.`;

  const user = `Site: ${args.siteUrl} (${args.title ?? "no title"})
Detected stack: ${args.stackLabel} (${args.stackId})

Exposed surface from HTML scan:
${args.suspectedSurface.map((s) => `- ${s.path} — ${s.reason}`).join("\n") || "  (none found in HTML)"}

Common bait paths for this stack that bots probe:
${args.baitPaths.map((p) => `- ${p}`).join("\n")}

Elasticsearch field mapping for this customer:
- timestamp: ${args.schema.timestamp_field}
- client ip: ${args.schema.ip_field}
- user agent: ${args.schema.user_agent_field}
- url path: ${args.schema.url_field}
- response status: ${args.schema.status_field}

Generate the detector pack.`;

  const out = await callAI(
    [{ role: "system", content: sys }, { role: "user", content: user }],
    SCHEMA,
  );
  return (out?.detectors ?? []) as Detector[];
}

async function dryRunAndEnrichDetectors(
  auth: EsAuth,
  indexPattern: string,
  schema: DetectedSchema,
  detectors: Detector[],
): Promise<Detector[]> {
  const tsField = schema.timestamp_field;
  const ipField = schema.ip_field;
  const uaField = schema.user_agent_field;
  const ipKw = `${ipField}.keyword`;
  const out: Detector[] = [];
  for (const d of detectors) {
    try {
      const inner = d.es_query?.bool ?? d.es_query;
      const filters = Array.isArray(inner?.filter) ? [...inner.filter] : (inner?.filter ? [inner.filter] : []);
      filters.push({ range: { [tsField]: { gte: "now-24h", lte: "now" } } });
      // Search + terms agg on IP to get top offenders, with a top_hits sub-agg for sample UA.
      const body = {
        size: 0,
        query: { bool: { ...inner, filter: filters } },
        track_total_hits: true,
        aggs: {
          top_ips: {
            terms: { field: ipKw, size: 10, missing: "unknown" },
            aggs: {
              sample: { top_hits: { size: 1, _source: [uaField] } },
            },
          },
          // Fallback to non-keyword IP if .keyword isn't mapped.
          top_ips_raw: {
            terms: { field: ipField, size: 10, missing: "unknown" },
          },
        },
      };
      const r: any = await esRequest(auth, `/${encodeURIComponent(indexPattern)}/_search`, { method: "POST", body });
      const total = r?.hits?.total?.value ?? r?.hits?.total ?? 0;
      const buckets: any[] = r?.aggregations?.top_ips?.buckets?.length
        ? r.aggregations.top_ips.buckets
        : (r?.aggregations?.top_ips_raw?.buckets ?? []);
      const inputs = buckets
        .filter((b) => b.key && b.key !== "unknown")
        .map((b) => {
          const hit = b.sample?.hits?.hits?.[0]?._source;
          let ua: string | null = null;
          if (hit) {
            // walk nested path for UA
            ua = uaField.split(".").reduce((acc: any, k) => acc?.[k], hit) ?? null;
          }
          return { ip: String(b.key), eventCount: b.doc_count as number, sampleUserAgent: ua };
        });
      const enriched = await enrichIps(inputs);
      const offenders: Offender[] = enriched.map((e) => {
        const m = inputs.find((i) => i.ip === e.ip)!;
        return { ...e, eventCount: m.eventCount, sampleUserAgent: m.sampleUserAgent };
      }).sort((a, b) => b.confidence - a.confidence || b.eventCount - a.eventCount);

      const verifiedEvents = offenders
        .filter((o) => o.classification === "verified_bot")
        .reduce((s, o) => s + o.eventCount, 0);
      const cleanMatches = Math.max(0, total - verifiedEvents);

      out.push({ ...d, match_count: total, match_count_clean: cleanMatches, offenders });
    } catch {
      out.push({ ...d, match_count: 0, match_count_clean: 0, offenders: [] });
    }
  }
  return out;
}

export const activate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      siteUrl: z.string().min(3).max(2048),
      esEndpoint: z.string().url(),
      esApiKey: z.string().min(8).max(2048),
      indexPattern: z.string().min(1).max(200).default("logs-*"),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const steps: { name: string; ok: boolean; detail?: string }[] = [];

    // 1. Verify ES
    const auth: EsAuth = { endpoint: data.esEndpoint, apiKey: data.esApiKey };
    let esVersion = "";
    try {
      const ping = await esPing(auth);
      esVersion = ping.version?.number ?? "";
      steps.push({ name: "Connect Elasticsearch", ok: true, detail: esVersion ? `v${esVersion}` : "ok" });
    } catch (e: any) {
      return { ok: false as const, error: `Elasticsearch: ${e?.message ?? "unreachable"}`, steps };
    }

    // 2. Firecrawl recon
    let recon;
    try {
      recon = await scanUrl(data.siteUrl);
      steps.push({ name: "Scan site with Firecrawl", ok: true, detail: `${recon.stack.label} • ${recon.pageCount} links` });
    } catch (e: any) {
      return { ok: false as const, error: `Site scan: ${e?.message ?? "failed"}`, steps };
    }

    // 3. Sample one doc + AI schema detect
    const sample = await sampleOneDoc(auth, data.indexPattern);
    let schema: DetectedSchema;
    if (!sample) {
      // No logs yet — fall back to ECS defaults
      schema = {
        timestamp_field: "@timestamp",
        ip_field: "client.ip",
        user_agent_field: "user_agent.original",
        url_field: "url.path",
        status_field: "http.response.status_code",
        notes: "No documents found yet — using Elastic Common Schema defaults.",
      };
      steps.push({ name: "Auto-detect log schema", ok: true, detail: "no logs yet — using ECS defaults" });
    } else {
      try {
        schema = await detectSchemaFromSample(sample);
        steps.push({ name: "Auto-detect log schema", ok: true, detail: `ts=${schema.timestamp_field} • ip=${schema.ip_field}` });
      } catch (e: any) {
        return { ok: false as const, error: `Schema detection: ${e?.message ?? "failed"}`, steps, recon };
      }
    }

    // 4. Generate detector pack
    let detectors: Detector[];
    try {
      detectors = await generateDetectorPack({
        siteUrl: recon.url,
        stackId: recon.stack.id,
        stackLabel: recon.stack.label,
        suspectedSurface: recon.suspectedSurface,
        baitPaths: recon.stack.baitPaths,
        title: recon.title,
        schema,
      });
      steps.push({ name: "Generate site-specific detectors", ok: true, detail: `${detectors.length} rules tailored to your site` });
    } catch (e: any) {
      return { ok: false as const, error: `Detector generation: ${e?.message ?? "failed"}`, steps, recon };
    }

    // 5. Dry-run + IP enrichment (rDNS, verified-bot allowlist, confidence scoring)
    let withCounts = detectors;
    if (sample) {
      withCounts = await dryRunAndEnrichDetectors(auth, data.indexPattern, schema, detectors);
      const totalClean = withCounts.reduce((s, d) => s + (d.match_count_clean ?? d.match_count ?? 0), 0);
      const verifiedExcluded = withCounts.reduce((s, d) => s + ((d.match_count ?? 0) - (d.match_count_clean ?? d.match_count ?? 0)), 0);
      const malicious = withCounts.reduce((s, d) => s + (d.offenders?.filter((o) => o.classification === "malicious").length ?? 0), 0);
      steps.push({
        name: "Enrich offenders + verify bots",
        ok: true,
        detail: `${totalClean.toLocaleString()} confirmed threats • ${verifiedExcluded.toLocaleString()} verified-bot events excluded • ${malicious} high-confidence malicious IPs`,
      });
    }

    // 6. Save everything to es_connections (deactivate others first)
    await supabase.from("es_connections").update({ is_active: false }).eq("user_id", userId);
    const now = new Date().toISOString();
    const row = {
      user_id: userId,
      label: new URL(recon.url).hostname,
      endpoint: data.esEndpoint,
      api_key: data.esApiKey,
      index_pattern: data.indexPattern,
      timestamp_field: schema.timestamp_field,
      ip_field: schema.ip_field,
      user_agent_field: schema.user_agent_field,
      url_field: schema.url_field,
      status_field: schema.status_field,
      is_active: true,
      last_tested_at: now,
      last_test_ok: true,
      schema_detected_at: now,
      detectors_generated_at: now,
      site_url: recon.url,
      site_recon: {
        stack: recon.stack,
        title: recon.title,
        description: recon.description,
        pageCount: recon.pageCount,
        suspectedSurface: recon.suspectedSurface,
      },
      detector_pack: { detectors: withCounts, schema_notes: schema.notes ?? null, es_version: esVersion },
      updated_at: now,
    };
    const { data: inserted, error } = await supabase.from("es_connections").insert(row).select("id").single();
    if (error) return { ok: false as const, error: error.message, steps };

    return {
      ok: true as const,
      connectionId: inserted.id,
      steps,
      recon,
      schema,
      detectors: withCounts,
    };
  });

export const getActivation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("es_connections")
      .select("id,label,site_url,site_recon,detector_pack,schema_detected_at,detectors_generated_at,index_pattern,timestamp_field,ip_field,user_agent_field,url_field,status_field")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { connection: data };
  });
