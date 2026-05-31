import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function makeSlug() {
  const alpha = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  const arr = new Uint8Array(10);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 10; i++) s += alpha[arr[i] % alpha.length];
  return s;
}

export const listHoneypots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("honeypot_keys")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { honeypots: data ?? [] };
  });

export const createHoneypot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ label: z.string().min(1).max(80) }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const slug = makeSlug();
    const { data: row, error } = await supabase
      .from("honeypot_keys")
      .insert({ user_id: userId, label: data.label, slug })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { honeypot: row };
  });

export const deleteHoneypot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("honeypot_keys")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
