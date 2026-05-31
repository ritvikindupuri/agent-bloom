import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { searchEvents, chaffIndex } from "./es-chaff.server";
import type { EsAuth } from "./es.server";
import { generateBlockRule, TARGETS, type Target } from "./block-rules";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function getConn(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("es_connections")
    .select("endpoint,api_key,is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function geminiText(
  messages: any[],
  model = "google/gemini-3-flash-preview",
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? "";
}

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("bot_campaigns")
      .select("*")
      .eq("user_id", userId)
      .order("last_seen", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { campaigns: data ?? [] };
  });

export const getCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("bot_campaigns")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { campaign: null, samples: [] };

    // Pull sample events for this signature
    const conn = await getConn(supabase, userId);
    let samples: any[] = [];
    if (conn) {
      const auth: EsAuth = { endpoint: conn.endpoint, apiKey: conn.api_key };
      try {
        const res: any = await searchEvents(auth, userId, {
          size: 20,
          query: { term: { signature_hash: row.signature_hash } },
          sort: [{ "@timestamp": "desc" }],
        });
        samples = (res?.hits?.hits ?? []).map((h: any) => h._source);
      } catch {}
    }
    return { campaign: row, samples };
  });

export const updateCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ id: z.string().uuid(), status: z.enum(["active", "resolved", "monitoring"]) }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("bot_campaigns")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clusterCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      windowMinutes: z
        .number()
        .int()
        .min(5)
        .max(60 * 24 * 14)
        .default(1440),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const conn = await getConn(supabase, userId);
    if (!conn) throw new Error("Connect Elasticsearch first.");
    const auth: EsAuth = { endpoint: conn.endpoint, apiKey: conn.api_key };

    const body = {
      size: 0,
      query: {
        bool: {
          filter: [
            { range: { "@timestamp": { gte: `now-${data.windowMinutes}m`, lte: "now" } } },
            { terms: { verdict: ["bot", "certified_bot", "suspect"] } },
          ],
        },
      },
      aggs: {
        by_sig: {
          terms: { field: "signature_hash", size: 30, order: { _count: "desc" } },
          aggs: {
            ip_count: { cardinality: { field: "ip_str" } },
            ua_family: { terms: { field: "ua_family", size: 1 } },
            renderer: { terms: { field: "webgl_renderer", size: 1, missing: "-" } },
            canvas: { terms: { field: "canvas_hash", size: 1, missing: "-" } },
            top_ip: { terms: { field: "ip_str", size: 1 } },
            top_reason: { terms: { field: "reasons", size: 3 } },
            first: { min: { field: "@timestamp" } },
            last: { max: { field: "@timestamp" } },
            avg_score: { avg: { field: "score" } },
          },
        },
      },
    };

    let res: any;
    try {
      res = await searchEvents(auth, userId, body);
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (/index_not_found/.test(msg) || /no such index/i.test(msg)) {
        return { clusters: 0, message: `No honeypot events yet in ${chaffIndex(userId)}.` };
      }
      throw e;
    }

    const buckets: any[] = res?.aggregations?.by_sig?.buckets ?? [];
    let upserted = 0;

    for (const b of buckets) {
      const sig: string = b.key;
      const fingerprint = {
        ua_family: b.ua_family?.buckets?.[0]?.key ?? "unknown",
        webgl_renderer: b.renderer?.buckets?.[0]?.key ?? "-",
        canvas_hash: b.canvas?.buckets?.[0]?.key ?? "-",
        top_ip: b.top_ip?.buckets?.[0]?.key ?? null,
        avg_score: Math.round(b.avg_score?.value ?? 0),
        top_reasons: (b.top_reason?.buckets ?? []).map((x: any) => x.key),
      };
      const eventCount: number = b.doc_count;
      const ipCount: number = b.ip_count?.value ?? 0;
      const firstSeen = b.first?.value ? new Date(b.first.value).toISOString() : null;
      const lastSeen = b.last?.value ? new Date(b.last.value).toISOString() : null;

      // Check existing
      const { data: existing } = await supabase
        .from("bot_campaigns")
        .select("id,name,kill_rule")
        .eq("user_id", userId)
        .eq("signature_hash", sig)
        .maybeSingle();

      let name = existing?.name;
      let killRule = existing?.kill_rule;
      if (!existing) {
        try {
          name =
            (
              await geminiText([
                {
                  role: "system",
                  content:
                    "You name bot campaigns. Reply with ONE short codename, 1-3 words, snake-case allowed, no quotes, no punctuation except hyphen. Examples: ScraperFleet-Aurora, HeadlessHorde, GhostBrowser-7.",
                },
                {
                  role: "user",
                  content: `Fingerprint:\n${JSON.stringify(fingerprint, null, 2)}\nEvents: ${eventCount}, IPs: ${ipCount}.`,
                },
              ])
            )
              .trim()
              .split("\n")[0]
              .replace(/["'`]/g, "")
              .slice(0, 60) || `Cluster-${sig}`;
        } catch {
          name = `Cluster-${sig}`;
        }
        try {
          killRule = await geminiText([
            {
              role: "system",
              content:
                "You produce a deployable Cloudflare WAF custom rule expression (single line) to block this bot cluster. Use ONLY fields available in Cloudflare: ip.src, http.user_agent, http.request.uri.path, cf.client.bot. Output ONLY the expression, no prose, no code fences.",
            },
            { role: "user", content: `Block fingerprint: ${JSON.stringify(fingerprint)}` },
          ]);
          killRule = killRule
            .replace(/```[\s\S]*?\n|```/g, "")
            .trim()
            .slice(0, 800);
        } catch {
          killRule = null;
        }
      }

      const upsert = {
        user_id: userId,
        signature_hash: sig,
        name: name ?? `Cluster-${sig}`,
        fingerprint,
        ip_count: ipCount,
        event_count: eventCount,
        first_seen: firstSeen,
        last_seen: lastSeen,
        kill_rule: killRule ?? null,
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        await supabase.from("bot_campaigns").update(upsert).eq("id", existing.id);
      } else {
        await supabase.from("bot_campaigns").insert(upsert);
      }
      upserted++;
    }

    return { clusters: upserted };
  });

export const liveEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ limit: z.number().int().min(1).max(100).default(40) }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const conn = await getConn(supabase, userId);
    if (!conn) return { events: [], totals: null as any, error: "no_connection" };
    const auth: EsAuth = { endpoint: conn.endpoint, apiKey: conn.api_key };
    try {
      const res: any = await searchEvents(auth, userId, {
        size: data.limit,
        sort: [{ "@timestamp": "desc" }],
        query: { match_all: {} },
        aggs: {
          last15: {
            filter: { range: { "@timestamp": { gte: "now-15m" } } },
            aggs: { by_verdict: { terms: { field: "verdict", size: 5 } } },
          },
          today: {
            filter: { range: { "@timestamp": { gte: "now-24h" } } },
          },
        },
      });
      const events = (res?.hits?.hits ?? []).map((h: any) => ({ id: h._id, ...h._source }));
      const verdicts: Record<string, number> = {};
      for (const b of res?.aggregations?.last15?.by_verdict?.buckets ?? [])
        verdicts[b.key] = b.doc_count;
      return {
        events,
        totals: {
          last15_total: res?.aggregations?.last15?.doc_count ?? 0,
          last15_verdicts: verdicts,
          last24h: res?.aggregations?.today?.doc_count ?? 0,
        },
      };
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (/index_not_found/.test(msg) || /no such index/i.test(msg)) {
        return {
          events: [],
          totals: { last15_total: 0, last15_verdicts: {}, last24h: 0 },
          error: "no_events",
        };
      }
      return { events: [], totals: null, error: msg };
    }
  });

// === Block-rule export ===
export const exportBlockRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      target: z.enum([
        "cloudflare",
        "nginx",
        "caddy",
        "haproxy",
        "aws_waf",
        "iptables",
        "fastly_vcl",
      ]),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("bot_campaigns")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Campaign not found");
    const rule = generateBlockRule(row as any, data.target as Target);
    return { rule, target: data.target, targets: TARGETS };
  });

// === IP reputation enrichment (free ip-api.com, no key, 45 req/min) ===
export const enrichTopIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("bot_campaigns")
      .select("id,fingerprint")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) throw new Error("Campaign not found");
    const ip = (row.fingerprint as any)?.top_ip;
    if (!ip || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return { intel: null, reason: "no_ip" };

    // Use ipwho.is — free HTTPS endpoint. Avoids MitM tampering of reputation
    // data that drives blocking decisions. (ip-api.com free tier is HTTP-only.)
    const url = `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,message,ip,country,country_code,region,city,connection`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`ip-intel ${res.status}`);
    const j: any = await res.json();
    if (j.success === false) return { intel: null, reason: j.message || "lookup_failed" };

    const intel = {
      ip: j.ip,
      country: j.country,
      country_code: j.country_code,
      region: j.region,
      city: j.city,
      isp: j.connection?.isp,
      org: j.connection?.org,
      asn: j.connection?.asn ? `AS${j.connection.asn}` : null,
      asn_name: j.connection?.org,
      flags: {
        proxy: false,
        hosting: false,
        mobile: false,
      },
      checked_at: new Date().toISOString(),
    };
    // Persist on the campaign so the next view doesn't re-fetch
    const merged = { ...(row.fingerprint as any), ip_intel: intel };
    await supabase
      .from("bot_campaigns")
      .update({ fingerprint: merged, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    return { intel };
  });

// === Block & log: marks campaign resolved + records an audit finding ===
export const recordBlockAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      target: z.enum([
        "cloudflare",
        "nginx",
        "caddy",
        "haproxy",
        "aws_waf",
        "iptables",
        "fastly_vcl",
      ]),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("bot_campaigns")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) throw new Error("Campaign not found");
    const rule = generateBlockRule(row as any, data.target as Target);

    await supabase
      .from("bot_campaigns")
      .update({ status: "resolved", kill_rule: rule, updated_at: new Date().toISOString() })
      .eq("id", data.id);

    await supabase.from("threat_findings").insert({
      user_id: userId,
      kind: "campaign_blocked",
      severity: (row.fingerprint as any)?.avg_score >= 80 ? "critical" : "high",
      title: `Blocked campaign: ${row.name}`,
      summary: `Operator marked campaign as blocked. Rule generated for ${data.target}. ${row.event_count} events / ${row.ip_count} IPs.`,
      ip: (row.fingerprint as any)?.top_ip ?? null,
      user_agent: (row.fingerprint as any)?.ua_family ?? null,
      request_count: row.event_count,
      first_seen: row.first_seen,
      last_seen: row.last_seen,
      status: "blocked",
      evidence: {
        signature_hash: row.signature_hash,
        target: data.target,
        rule,
        fingerprint: row.fingerprint,
      },
    });

    return { ok: true };
  });
