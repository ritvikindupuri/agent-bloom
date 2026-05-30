import { createFileRoute } from "@tanstack/react-router";
import { rescanAll } from "@/lib/rescan.server";

export const Route = createFileRoute("/api/public/hooks/rescan")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const result = await rescanAll();
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          return new Response(JSON.stringify({ ok: false, error: e?.message ?? "rescan failed" }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST to trigger a rescan" }),
    },
  },
});
