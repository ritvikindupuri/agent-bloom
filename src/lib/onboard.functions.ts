import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { scanUrl } from "./onboard.server";

export const scanSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      url: z.string().min(3).max(2048),
      expectedSlug: z.string().min(1).max(64).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    try {
      const res = await scanUrl(data.url, data.expectedSlug);
      return res;
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Scan failed" };
    }
  });
