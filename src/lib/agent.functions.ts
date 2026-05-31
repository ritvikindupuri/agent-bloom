import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { esSearch, type EsAuth } from "./es.server";
import { classifyUA } from "./bot-detect";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const SYSTEM_PROMPT = `You are Chaff, an autonomous bot-traffic analyst. You have access to the user's Elasticsearch logs through tools.

Your job:
1. When a user asks a question, plan which tools to call.
2. Use tools to investigate REAL log data — never invent numbers.
3. Identify bot activity (scrapers, credential stuffing, scanners, fake browsers, abnormal request bursts).
4. When you find a real threat, call \`record_threat\` to save it.
5. Present findings concisely with concrete evidence (IPs, UAs, paths, counts).

Format answers in tight Markdown. Use code blocks for IPs and UAs. Lead with the conclusion. Cite specific numbers from tool results.

You are pragmatic and skeptical: not every odd pattern is malicious. Distinguish good bots (Googlebot, Bingbot) from suspicious ones.`;

const tools: any[] = [
  {
    type: "function",
    function: {
      name: "search_logs",
      description:
        "Run an Elasticsearch DSL query against the user's log index. Returns aggregations and a sample of hits.",
      parameters: {
        type: "object",
        properties: {
          range_minutes: {
            type: "number",
            description: "Time window in minutes, e.g. 60 for last hour. Max 43200 (30 days).",
            default: 60,
          },
          query_filter: {
            type: "object",
            description:
              "Optional ES bool/query clauses to add (e.g. { term: { 'client.ip': '1.2.3.4' } })",
            additionalProperties: true,
          },
          aggregation: {
            type: "string",
            enum: [
              "top_user_agents",
              "top_ips",
              "top_paths",
              "status_codes",
              "requests_per_minute",
              "ip_user_agents",
            ],
            description: "Which aggregation to compute.",
          },
          size: {
            type: "number",
            description: "How many buckets to return (default 15, max 50).",
            default: 15,
          },
          focus_ip: {
            type: "string",
            description: "Required when aggregation=ip_user_agents — which IP to break down.",
          },
        },
        required: ["aggregation"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sample_requests",
      description:
        "Fetch a small sample of raw log documents matching a filter, to inspect details.",
      parameters: {
        type: "object",
        properties: {
          range_minutes: { type: "number", default: 60 },
          query_filter: { type: "object", additionalProperties: true },
          size: { type: "number", default: 10 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_threat",
      description: "Record a detected threat finding so it appears on the threats page.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            description: "e.g. 'scraper', 'credential-stuffing', 'scanner', 'fake-browser'",
          },
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          title: { type: "string" },
          summary: { type: "string" },
          ip: { type: "string" },
          user_agent: { type: "string" },
          request_count: { type: "number" },
          evidence: { type: "object", additionalProperties: true },
        },
        required: ["kind", "severity", "title", "summary"],
      },
    },
  },
];

async function loadConn(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("es_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function runTool(
  name: string,
  args: any,
  ctx: { supabase: any; userId: string; conn: any; connectionId: string },
) {
  const { supabase, userId, conn } = ctx;
  const auth: EsAuth = { endpoint: conn.endpoint, apiKey: conn.api_key };
  const tsField = conn.timestamp_field;
  const uaField = conn.user_agent_field;
  const ipField = conn.ip_field;
  const urlField = conn.url_field;
  const statusField = conn.status_field;

  if (name === "search_logs") {
    const range = Math.min(Math.max(Number(args.range_minutes ?? 60), 1), 60 * 24 * 30);
    const size = Math.min(Math.max(Number(args.size ?? 15), 1), 50);
    const filters: any[] = [{ range: { [tsField]: { gte: `now-${range}m`, lte: "now" } } }];
    if (args.query_filter && typeof args.query_filter === "object") filters.push(args.query_filter);

    const aggMap: Record<string, any> = {
      top_user_agents: { terms: { field: `${uaField}.keyword`, size, missing: "-" } },
      top_ips: { terms: { field: `${ipField}.keyword`, size } },
      top_paths: { terms: { field: `${urlField}.keyword`, size } },
      status_codes: { terms: { field: statusField, size } },
      requests_per_minute: {
        date_histogram: { field: tsField, fixed_interval: "1m", min_doc_count: 0 },
      },
      ip_user_agents: {
        terms: { field: `${ipField}.keyword`, size },
        aggs: { uas: { terms: { field: `${uaField}.keyword`, size: 5, missing: "-" } } },
      },
    };
    if (args.aggregation === "ip_user_agents" && args.focus_ip) {
      filters.push({ term: { [`${ipField}.keyword`]: args.focus_ip } });
    }
    const body = {
      size: 0,
      query: { bool: { filter: filters } },
      aggs: { result: aggMap[args.aggregation] },
    };
    const res: any = await esSearch(auth, conn.index_pattern, body).catch((e: Error) => ({
      __error: e.message,
    }));
    if (res.__error) return { error: res.__error };
    const buckets = res?.aggregations?.result?.buckets ?? [];
    // Annotate bot classification
    const annotated = buckets.map((b: any) => {
      const out: any = { key: b.key_as_string ?? b.key, count: b.doc_count };
      if (args.aggregation === "top_user_agents") {
        const c = classifyUA(b.key);
        out.bot = c.isBot;
        out.category = c.category;
        out.reason = c.reason;
      }
      if (args.aggregation === "ip_user_agents") {
        out.user_agents = (b.uas?.buckets ?? []).map((u: any) => ({
          ua: u.key,
          count: u.doc_count,
          ...classifyUA(u.key),
        }));
      }
      return out;
    });
    return {
      aggregation: args.aggregation,
      total_hits: res?.hits?.total?.value ?? 0,
      buckets: annotated,
    };
  }

  if (name === "sample_requests") {
    const range = Math.min(Math.max(Number(args.range_minutes ?? 60), 1), 60 * 24 * 30);
    const size = Math.min(Math.max(Number(args.size ?? 10), 1), 25);
    const filters: any[] = [{ range: { [tsField]: { gte: `now-${range}m`, lte: "now" } } }];
    if (args.query_filter) filters.push(args.query_filter);
    const body = { size, query: { bool: { filter: filters } }, sort: [{ [tsField]: "desc" }] };
    const res: any = await esSearch(auth, conn.index_pattern, body).catch((e: Error) => ({
      __error: e.message,
    }));
    if (res.__error) return { error: res.__error };
    const hits = (res?.hits?.hits ?? []).map((h: any) => h._source);
    return { count: hits.length, samples: hits };
  }

  if (name === "record_threat") {
    const { error } = await supabase.from("threat_findings").insert({
      user_id: userId,
      connection_id: ctx.connectionId,
      kind: args.kind,
      severity: args.severity,
      title: args.title,
      summary: args.summary,
      ip: args.ip ?? null,
      user_agent: args.user_agent ?? null,
      request_count: args.request_count ?? null,
      evidence: args.evidence ?? null,
      last_seen: new Date().toISOString(),
    });
    if (error) return { error: error.message };
    return { recorded: true };
  }
  return { error: `Unknown tool: ${name}` };
}

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("agent_conversations")
      .select("id,title,updated_at,created_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { conversations: data ?? [] };
  });

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: msgs, error } = await supabase
      .from("agent_messages")
      .select("*")
      .eq("conversation_id", data.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { messages: msgs ?? [] };
  });

export const sendAgentMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      conversationId: z.string().uuid().optional(),
      message: z.string().min(1).max(4000),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured.");
    const conn = await loadConn(supabase, userId);
    if (!conn) throw new Error("Connect Elasticsearch first.");

    // Ensure conversation
    let conversationId = data.conversationId;
    if (!conversationId) {
      const { data: c, error } = await supabase
        .from("agent_conversations")
        .insert({ user_id: userId, title: data.message.slice(0, 60) })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      conversationId = c.id;
    } else {
      await supabase
        .from("agent_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    }

    // Save user message
    await supabase.from("agent_messages").insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "user",
      content: data.message,
    });

    // Load prior messages
    const { data: prior } = await supabase
      .from("agent_messages")
      .select("role,content,tool_calls,tool_name,tool_result")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const chatMessages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];
    for (const m of prior ?? []) {
      if (m.role === "user" || m.role === "assistant") {
        const msg: any = { role: m.role, content: m.content ?? "" };
        if (m.role === "assistant" && m.tool_calls) msg.tool_calls = m.tool_calls;
        chatMessages.push(msg);
      } else if (m.role === "tool") {
        chatMessages.push({
          role: "tool",
          name: m.tool_name,
          content: JSON.stringify(m.tool_result ?? {}),
          tool_call_id: (m.tool_calls as any)?.id ?? "t",
        });
      }
    }

    // Agent loop — up to 6 tool rounds
    const traces: any[] = [];
    for (let round = 0; round < 6; round++) {
      const res = await fetch(AI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: MODEL, messages: chatMessages, tools, tool_choice: "auto" }),
      });
      if (!res.ok) {
        const txt = await res.text();
        if (res.status === 429)
          throw new Error("Rate limit reached on Lovable AI. Try again in a minute.");
        if (res.status === 402)
          throw new Error(
            "Lovable AI credits exhausted. Add credits in Settings → Workspace → Usage.",
          );
        throw new Error(`AI error ${res.status}: ${txt.slice(0, 300)}`);
      }
      const j = await res.json();
      const choice = j.choices?.[0];
      const msg = choice?.message;
      if (!msg) throw new Error("No assistant message returned.");

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        // Final answer
        const finalContent = msg.content ?? "";
        await supabase.from("agent_messages").insert({
          conversation_id: conversationId,
          user_id: userId,
          role: "assistant",
          content: finalContent,
        });
        return { conversationId, content: finalContent, traces };
      }

      // Save assistant intent
      await supabase.from("agent_messages").insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: toolCalls,
      });
      chatMessages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });

      // Run each tool
      for (const call of toolCalls) {
        let args: any = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        const result = await runTool(call.function.name, args, {
          supabase,
          userId,
          conn,
          connectionId: conn.id,
        });
        traces.push({ tool: call.function.name, args, result });
        await supabase.from("agent_messages").insert({
          conversation_id: conversationId,
          user_id: userId,
          role: "tool",
          tool_name: call.function.name,
          tool_calls: { id: call.id },
          tool_result: result,
          content: null,
        });
        chatMessages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result).slice(0, 18000),
        });
      }
    }
    throw new Error("Agent exceeded reasoning steps without producing an answer.");
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("agent_conversations")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
