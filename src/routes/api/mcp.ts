import { createFileRoute } from "@tanstack/react-router";
import { createMcpServer, defineTool, withMcpAuth } from "mcp-tanstack-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { searchEvents } from "@/lib/es-chaff.server";
import type { EsAuth } from "@/lib/es.server";

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authToUser(token: string): Promise<string | null> {
  const hash = await sha256Hex(token);
  const { data } = await supabaseAdmin.from("mcp_tokens").select("user_id,revoked_at").eq("token_hash", hash).maybeSingle();
  if (!data || data.revoked_at) return null;
  return data.user_id as string;
}

async function getConn(userId: string): Promise<EsAuth | null> {
  const { data } = await supabaseAdmin
    .from("es_connections")
    .select("endpoint,api_key,is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { endpoint: data.endpoint as string, apiKey: data.api_key as string };
}

const isKnownBot = defineTool({
  name: "is_known_bot",
  description: "Check whether an IP has been observed hitting Chaff honeypots or has been classified as a bot.",
  parameters: z.object({ ip: z.string().min(3).max(64) }),
  execute: async ({ ip }, ctx: any) => {
    const userId = ctx?.auth?.userId;
    if (!userId) return "Unauthorized";
    const auth = await getConn(userId);
    if (!auth) return "No Elasticsearch connection configured for this workspace.";
    try {
      const res: any = await searchEvents(auth, userId, {
        size: 5,
        query: { term: { ip_str: ip } },
        sort: [{ "@timestamp": "desc" }],
        aggs: {
          verdicts: { terms: { field: "verdict", size: 5 } },
          honeypot: { filter: { term: { is_honeypot_hit: true } } },
        },
      });
      const total = res?.hits?.total?.value ?? 0;
      const verdicts: Record<string, number> = {};
      for (const b of res?.aggregations?.verdicts?.buckets ?? []) verdicts[b.key] = b.doc_count;
      const honeypotHits = res?.aggregations?.honeypot?.doc_count ?? 0;
      const samples = (res?.hits?.hits ?? []).map((h: any) => ({
        ts: h._source["@timestamp"], verdict: h._source.verdict, score: h._source.score, ua: h._source.ua, slug: h._source.slug,
      }));
      return JSON.stringify({ ip, total_events: total, verdicts, honeypot_hits: honeypotHits, samples }, null, 2);
    } catch (e: any) {
      return `Error: ${e?.message ?? String(e)}`;
    }
  },
});

const getCampaign = defineTool({
  name: "get_campaign",
  description: "Get details of a bot campaign by id or signature hash.",
  parameters: z.object({ id_or_hash: z.string().min(3).max(64) }),
  execute: async ({ id_or_hash }, ctx: any) => {
    const userId = ctx?.auth?.userId;
    if (!userId) return "Unauthorized";
    const filter = id_or_hash.includes("-") ? { id: id_or_hash } : { signature_hash: id_or_hash };
    const { data } = await supabaseAdmin
      .from("bot_campaigns")
      .select("*")
      .eq("user_id", userId)
      .match(filter)
      .maybeSingle();
    if (!data) return "Campaign not found.";
    return JSON.stringify(data, null, 2);
  },
});

const listRecentCampaigns = defineTool({
  name: "list_recent_campaigns",
  description: "List recently active bot campaigns observed in your traffic.",
  parameters: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
  execute: async ({ limit }, ctx: any) => {
    const userId = ctx?.auth?.userId;
    if (!userId) return "Unauthorized";
    const { data } = await supabaseAdmin
      .from("bot_campaigns")
      .select("id,name,signature_hash,ip_count,event_count,last_seen,status,fingerprint")
      .eq("user_id", userId)
      .order("last_seen", { ascending: false, nullsFirst: false })
      .limit(limit);
    return JSON.stringify(data ?? [], null, 2);
  },
});

const lookupFingerprint = defineTool({
  name: "lookup_fingerprint",
  description: "Look up events matching a fingerprint signature hash.",
  parameters: z.object({ signature_hash: z.string().min(4).max(32), limit: z.number().int().min(1).max(50).default(10) }),
  execute: async ({ signature_hash, limit }, ctx: any) => {
    const userId = ctx?.auth?.userId;
    if (!userId) return "Unauthorized";
    const auth = await getConn(userId);
    if (!auth) return "No Elasticsearch connection.";
    const res: any = await searchEvents(auth, userId, {
      size: limit,
      query: { term: { signature_hash } },
      sort: [{ "@timestamp": "desc" }],
    });
    return JSON.stringify((res?.hits?.hits ?? []).map((h: any) => h._source), null, 2);
  },
});

const mcp = createMcpServer({
  name: "chaff",
  version: "1.0.0",
  instructions: "Chaff exposes bot intelligence collected from honeypots. Use is_known_bot to check an IP, list_recent_campaigns for active threats, get_campaign for details, lookup_fingerprint to inspect cluster behavior.",
  tools: [isKnownBot, getCampaign, listRecentCampaigns, lookupFingerprint],
});

const handler = withMcpAuth(
  async (request, auth) => mcp.handleRequest(request, { auth }),
  async (request) => {
    const h = request.headers.get("Authorization") || "";
    const token = h.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    const userId = await authToUser(token);
    return userId ? { userId, token } : null;
  }
);

const methodNotAllowed = () =>
  new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }), {
    status: 405, headers: { "Content-Type": "application/json", Allow: "POST, OPTIONS" },
  });

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => handler(request),
      GET: async () => methodNotAllowed(),
      DELETE: async () => methodNotAllowed(),
      OPTIONS: async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } }),
    },
  },
});
