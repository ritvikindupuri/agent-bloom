import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { esPing, esSearch, type EsAuth } from "./es.server";
import { classifyUA } from "./bot-detect";
import type { Metrics, TrafficPoint } from "./types";

async function getActiveConnection(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("es_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export const saveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid().optional(),
      label: z.string().min(1).max(80),
      endpoint: z.string().url(),
      apiKey: z.string().min(8).max(2048),
      indexPattern: z.string().min(1).max(200),
      timestampField: z.string().min(1).max(120).default("@timestamp"),
      ipField: z.string().min(1).max(120).default("client.ip"),
      userAgentField: z.string().min(1).max(120).default("user_agent.original"),
      urlField: z.string().min(1).max(120).default("url.path"),
      statusField: z.string().min(1).max(120).default("http.response.status_code"),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Test the connection first
    let testOk = false;
    let testMessage = "";
    try {
      const info = await esPing({ endpoint: data.endpoint, apiKey: data.apiKey });
      testOk = true;
      testMessage = `Connected${info.version?.number ? ` (v${info.version.number})` : ""}`;
    } catch (e) {
      testOk = false;
      testMessage = e instanceof Error ? e.message : String(e);
    }

    const row = {
      user_id: userId,
      label: data.label,
      endpoint: data.endpoint,
      api_key: data.apiKey,
      index_pattern: data.indexPattern,
      timestamp_field: data.timestampField,
      ip_field: data.ipField,
      user_agent_field: data.userAgentField,
      url_field: data.urlField,
      status_field: data.statusField,
      is_active: true,
      last_tested_at: new Date().toISOString(),
      last_test_ok: testOk,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await supabase
        .from("es_connections")
        .update(row)
        .eq("id", data.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    } else {
      // Mark others inactive
      await supabase.from("es_connections").update({ is_active: false }).eq("user_id", userId);
      const { error } = await supabase.from("es_connections").insert(row);
      if (error) throw new Error(error.message);
    }
    return { ok: testOk, message: testMessage };
  });

export const listConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("es_connections")
      .select(
        "id,label,endpoint,index_pattern,timestamp_field,ip_field,user_agent_field,url_field,status_field,is_active,last_tested_at,last_test_ok",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { connections: data ?? [] };
  });

export const deleteConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("es_connections")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      rangeMinutes: z
        .number()
        .int()
        .min(5)
        .max(60 * 24 * 30)
        .default(60),
    }).parse,
  )
  .handler(async ({ data, context }): Promise<{ metrics: Metrics | null; error?: string }> => {
    const { supabase, userId } = context;
    const conn = await getActiveConnection(supabase, userId);
    if (!conn) return { metrics: null, error: "No active Elasticsearch connection." };
    const auth: EsAuth = { endpoint: conn.endpoint, apiKey: conn.api_key };
    const tsField = conn.timestamp_field;
    const uaField = conn.user_agent_field;
    const ipField = conn.ip_field;
    const urlField = conn.url_field;
    const statusField = conn.status_field;

    const intervalMin = Math.max(1, Math.floor(data.rangeMinutes / 60));
    const intervalUnit =
      data.rangeMinutes <= 120 ? "1m" : data.rangeMinutes <= 60 * 24 ? "5m" : `${intervalMin}m`;

    const body = {
      size: 0,
      query: {
        bool: {
          filter: [{ range: { [tsField]: { gte: `now-${data.rangeMinutes}m`, lte: "now" } } }],
        },
      },
      aggs: {
        timeline: {
          date_histogram: { field: tsField, fixed_interval: intervalUnit, min_doc_count: 0 },
          aggs: { ua: { terms: { field: `${uaField}.keyword`, size: 25, missing: "-" } } },
        },
        unique_ips: { cardinality: { field: `${ipField}.keyword` } },
        top_ua: { terms: { field: `${uaField}.keyword`, size: 20, missing: "-" } },
        top_ip: { terms: { field: `${ipField}.keyword`, size: 20 } },
        top_paths: { terms: { field: `${urlField}.keyword`, size: 15 } },
        statuses: { terms: { field: statusField, size: 10 } },
      },
    };

    let res: any;
    try {
      res = await esSearch(auth, conn.index_pattern, body);
    } catch (e) {
      // Retry without .keyword for fields that may already be keyword type
      try {
        const fallback = JSON.parse(
          JSON.stringify(body)
            .replace(new RegExp(`${uaField}\\.keyword`, "g"), uaField)
            .replace(new RegExp(`${ipField}\\.keyword`, "g"), ipField)
            .replace(new RegExp(`${urlField}\\.keyword`, "g"), urlField),
        );
        res = await esSearch(auth, conn.index_pattern, fallback);
      } catch (e2) {
        return { metrics: null, error: e2 instanceof Error ? e2.message : String(e2) };
      }
    }

    const total = res?.hits?.total?.value ?? 0;
    const topUaBuckets = res?.aggregations?.top_ua?.buckets ?? [];
    const topIpBuckets = res?.aggregations?.top_ip?.buckets ?? [];
    const topPathsBuckets = res?.aggregations?.top_paths?.buckets ?? [];
    const statusesBuckets = res?.aggregations?.statuses?.buckets ?? [];
    const timelineBuckets = res?.aggregations?.timeline?.buckets ?? [];

    let botRequests = 0;
    const topUserAgents = topUaBuckets.map((b: any) => {
      const c = classifyUA(b.key);
      if (c.isBot) botRequests += b.doc_count;
      return { key: String(b.key), count: b.doc_count as number, isBot: c.isBot };
    });

    // For top IPs, mark as bot if their top UA is a bot
    const topIps = topIpBuckets.map((b: any) => ({
      key: String(b.key),
      count: b.doc_count as number,
      isBot: false, // refined below if we cross-reference
    }));

    const timeline: TrafficPoint[] = timelineBuckets.map((b: any) => {
      let bots = 0;
      let humans = 0;
      for (const ub of b.ua?.buckets ?? []) {
        const c = classifyUA(ub.key);
        if (c.isBot) bots += ub.doc_count;
        else humans += ub.doc_count;
      }
      const sampled = bots + humans;
      const total = b.doc_count as number;
      // Scale to actual bucket count
      const botRatio = sampled > 0 ? bots / sampled : 0;
      return {
        ts: b.key_as_string ?? new Date(b.key).toISOString(),
        bots: Math.round(total * botRatio),
        humans: total - Math.round(total * botRatio),
      };
    });

    const botTotal = timeline.reduce((s, p) => s + p.bots, 0);
    const humanTotal = timeline.reduce((s, p) => s + p.humans, 0);

    const metrics: Metrics = {
      totalRequests: total,
      botRequests: botTotal,
      humanRequests: humanTotal,
      uniqueIps: res?.aggregations?.unique_ips?.value ?? 0,
      topUserAgents,
      topIps,
      topPaths: topPathsBuckets.map((b: any) => ({ key: String(b.key), count: b.doc_count })),
      statusCodes: statusesBuckets.map((b: any) => ({ key: String(b.key), count: b.doc_count })),
      timeline,
    };
    return { metrics };
  });

export const listThreats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("threat_findings")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { threats: data ?? [] };
  });

export const updateThreatStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      status: z.enum(["open", "blocked", "dismissed", "investigating"]),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("threat_findings")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
