// Continuous re-scan worker. Iterates all active es_connections, re-runs each
// connection's existing detector pack against the last 24h of logs, and writes
// fresh match counts + enriched offenders back to the row. Called by pg_cron.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { esRequest, type EsAuth } from "./es.server";
import { enrichIps, type IpEnrichment } from "./ip-intel.server";

type Offender = IpEnrichment & { eventCount: number; sampleUserAgent: string | null };
type Detector = {
  id: string;
  name: string;
  rationale: string;
  severity: "low" | "medium" | "high" | "critical";
  target_path?: string;
  es_query: any;
  match_count?: number;
  match_count_clean?: number;
  offenders?: Offender[];
};

async function runDetector(
  auth: EsAuth,
  indexPattern: string,
  schema: { timestamp_field: string; ip_field: string; user_agent_field: string },
  d: Detector,
): Promise<Detector> {
  try {
    const inner = d.es_query?.bool ?? d.es_query;
    const filters = Array.isArray(inner?.filter)
      ? [...inner.filter]
      : inner?.filter
        ? [inner.filter]
        : [];
    filters.push({ range: { [schema.timestamp_field]: { gte: "now-24h", lte: "now" } } });
    const ipKw = `${schema.ip_field}.keyword`;
    const body = {
      size: 0,
      query: { bool: { ...inner, filter: filters } },
      track_total_hits: true,
      aggs: {
        top_ips: {
          terms: { field: ipKw, size: 10, missing: "unknown" },
          aggs: { sample: { top_hits: { size: 1, _source: [schema.user_agent_field] } } },
        },
        top_ips_raw: { terms: { field: schema.ip_field, size: 10, missing: "unknown" } },
      },
    };
    const r: any = await esRequest(auth, `/${encodeURIComponent(indexPattern)}/_search`, {
      method: "POST",
      body,
    });
    const total = r?.hits?.total?.value ?? r?.hits?.total ?? 0;
    const buckets: any[] = r?.aggregations?.top_ips?.buckets?.length
      ? r.aggregations.top_ips.buckets
      : (r?.aggregations?.top_ips_raw?.buckets ?? []);
    const inputs = buckets
      .filter((b) => b.key && b.key !== "unknown")
      .map((b) => {
        const hit = b.sample?.hits?.hits?.[0]?._source;
        const ua = hit
          ? (schema.user_agent_field.split(".").reduce((acc: any, k) => acc?.[k], hit) ?? null)
          : null;
        return { ip: String(b.key), eventCount: b.doc_count as number, sampleUserAgent: ua };
      });
    const enriched = await enrichIps(inputs);
    const offenders: Offender[] = enriched
      .map((e) => {
        const m = inputs.find((i) => i.ip === e.ip)!;
        return { ...e, eventCount: m.eventCount, sampleUserAgent: m.sampleUserAgent };
      })
      .sort((a, b) => b.confidence - a.confidence || b.eventCount - a.eventCount);
    const verified = offenders
      .filter((o) => o.classification === "verified_bot")
      .reduce((s, o) => s + o.eventCount, 0);
    return {
      ...d,
      match_count: total,
      match_count_clean: Math.max(0, total - verified),
      offenders,
    };
  } catch {
    return { ...d, match_count: 0, match_count_clean: 0, offenders: [] };
  }
}

export async function rescanAll(): Promise<{
  scanned: number;
  failed: number;
  newFindings: number;
  perConnection: { id: string; ok: boolean; threats: number; error?: string }[];
}> {
  const { data: connections, error } = await supabaseAdmin
    .from("es_connections")
    .select(
      "id,user_id,endpoint,api_key,index_pattern,timestamp_field,ip_field,user_agent_field,detector_pack",
    )
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const perConnection: { id: string; ok: boolean; threats: number; error?: string }[] = [];
  let scanned = 0,
    failed = 0,
    newFindings = 0;

  for (const conn of connections ?? []) {
    const detectors: Detector[] = ((conn.detector_pack as any)?.detectors ?? []) as Detector[];
    if (!detectors.length) {
      perConnection.push({ id: conn.id, ok: true, threats: 0 });
      continue;
    }
    const auth: EsAuth = { endpoint: conn.endpoint, apiKey: conn.api_key };
    const schema = {
      timestamp_field: conn.timestamp_field,
      ip_field: conn.ip_field,
      user_agent_field: conn.user_agent_field,
    };
    try {
      const refreshed: Detector[] = [];
      for (const d of detectors)
        refreshed.push(await runDetector(auth, conn.index_pattern, schema, d));
      const threats = refreshed.reduce((s, d) => s + (d.match_count_clean ?? 0), 0);

      // Persist refreshed detector pack
      const pack = {
        ...(conn.detector_pack as any),
        detectors: refreshed,
        last_rescan_at: new Date().toISOString(),
      };
      await supabaseAdmin
        .from("es_connections")
        .update({ detector_pack: pack, updated_at: new Date().toISOString() })
        .eq("id", conn.id);

      // Emit threat_findings for high-confidence offenders so the UI shows new alerts
      for (const d of refreshed) {
        for (const o of d.offenders ?? []) {
          if (o.confidence < 60 || o.classification === "verified_bot") continue;
          const findingTitle = `${d.name} — ${o.ip}`;
          // upsert-like: skip if an open finding with same title already exists
          const { data: existing } = await supabaseAdmin
            .from("threat_findings")
            .select("id")
            .eq("user_id", conn.user_id)
            .eq("connection_id", conn.id)
            .eq("title", findingTitle)
            .eq("status", "open")
            .maybeSingle();
          if (existing) {
            await supabaseAdmin
              .from("threat_findings")
              .update({ last_seen: new Date().toISOString(), request_count: o.eventCount })
              .eq("id", existing.id);
            continue;
          }
          await supabaseAdmin.from("threat_findings").insert({
            user_id: conn.user_id,
            connection_id: conn.id,
            kind: d.id,
            severity: d.severity,
            title: findingTitle,
            summary: `${o.classification} • confidence ${o.confidence}/100 — ${o.reasons.slice(0, 2).join("; ")}`,
            ip: o.ip,
            user_agent: o.sampleUserAgent,
            evidence: {
              reasons: o.reasons,
              rdns: o.rdns,
              abuseScore: o.abuseScore,
              usageType: o.usageType,
              country: o.countryCode,
              rule: d.name,
            },
            request_count: o.eventCount,
            first_seen: new Date().toISOString(),
            last_seen: new Date().toISOString(),
            status: "open",
          });
          newFindings++;
        }
      }
      perConnection.push({ id: conn.id, ok: true, threats });
      scanned++;
    } catch (e: any) {
      perConnection.push({
        id: conn.id,
        ok: false,
        threats: 0,
        error: e?.message ?? "scan failed",
      });
      failed++;
    }
  }
  return { scanned, failed, newFindings, perConnection };
}
