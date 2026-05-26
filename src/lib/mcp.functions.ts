import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  const b64 = btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `chaff_mcp_${b64}`;
}

export const listMcpTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("mcp_tokens")
      .select("id,label,created_at,revoked_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { tokens: data ?? [] };
  });

export const createMcpToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ label: z.string().min(1).max(60) }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const token = randomToken();
    const hash = await sha256Hex(token);
    const { error } = await supabase.from("mcp_tokens").insert({ user_id: userId, label: data.label, token_hash: hash });
    if (error) throw new Error(error.message);
    return { token }; // shown once
  });

export const revokeMcpToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("mcp_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
