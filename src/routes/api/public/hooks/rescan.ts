import { createFileRoute } from "@tanstack/react-router";
import { rescanAll } from "@/lib/rescan.server";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.RESCAN_WEBHOOK_SECRET;
  if (!secret) return false; // fail closed if not configured
  const header = request.headers.get("authorization") || "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const alt = request.headers.get("x-webhook-secret")?.trim() || "";
  const provided = bearer || alt;
  if (!provided) return false;
  return timingSafeEqualStr(provided, secret);
}

export const Route = createFileRoute("/api/public/hooks/rescan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const result = await rescanAll();
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error("[rescan] failed:", e?.message ?? e);
          return new Response(JSON.stringify({ ok: false, error: "rescan_failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json({ ok: true, hint: "POST to trigger a rescan" });
      },
    },
  },
});
