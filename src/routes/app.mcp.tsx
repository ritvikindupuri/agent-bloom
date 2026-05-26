import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMcpTokens, createMcpToken, revokeMcpToken } from "@/lib/mcp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/mcp")({ component: McpPage });

function McpPage() {
  const fnList = useServerFn(listMcpTokens);
  const fnCreate = useServerFn(createMcpToken);
  const fnRevoke = useServerFn(revokeMcpToken);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mcpTokens"], queryFn: () => fnList() });
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => fnCreate({ data: { label: label || "Default" } }),
    onSuccess: (d) => { setFresh(d.token); setLabel(""); qc.invalidateQueries({ queryKey: ["mcpTokens"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const r = useMutation({
    mutationFn: (id: string) => fnRevoke({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcpTokens"] }),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const mcpUrl = `${origin}/api/mcp`;

  return (
    <div className="p-10 max-w-4xl">
      <h1 className="font-display text-4xl tracking-tight">MCP Server</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Give Claude, Cursor, ChatGPT — any MCP-aware agent — secure access to your Chaff bot intelligence.
      </p>

      <div className="mt-6 rounded-lg border border-border bg-surface/40 p-5">
        <div className="text-sm font-medium text-muted-foreground mb-2">Endpoint</div>
        <div className="flex gap-2">
          <code className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono">{mcpUrl}</code>
          <button onClick={() => { navigator.clipboard.writeText(mcpUrl); toast.success("Copied"); }} className="rounded-md border border-border px-2 hover:bg-accent"><Copy className="h-3.5 w-3.5" /></button>
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          Tools exposed: <code className="text-foreground">is_known_bot</code> · <code className="text-foreground">list_recent_campaigns</code> · <code className="text-foreground">get_campaign</code> · <code className="text-foreground">lookup_fingerprint</code>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <Input placeholder="Token label (e.g. claude-desktop)" value={label} onChange={(e) => setLabel(e.target.value)} className="max-w-xs" />
        <Button onClick={() => m.mutate()} disabled={m.isPending}><Plus className="h-4 w-4 mr-1" />Issue token</Button>
      </div>

      {fresh && (
        <div className="mt-4 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="text-xs uppercase tracking-wider text-primary mb-1">Copy this token now — it won't be shown again</div>
          <div className="flex gap-2">
            <code className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono break-all">{fresh}</code>
            <button onClick={() => { navigator.clipboard.writeText(fresh); toast.success("Copied"); }} className="rounded-md border border-border px-2 hover:bg-accent"><Copy className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      )}

      <div className="mt-8 rounded-lg border border-border bg-surface/40 divide-y divide-border">
        {q.data?.tokens?.length ? q.data.tokens.map((t: any) => (
          <div key={t.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{t.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Created {new Date(t.created_at).toLocaleString()}{t.revoked_at ? ` · revoked ${new Date(t.revoked_at).toLocaleString()}` : ""}</div>
            </div>
            {!t.revoked_at && <button onClick={() => r.mutate(t.id)} className="text-xs text-destructive hover:underline">Revoke</button>}
          </div>
        )) : (
          <div className="p-8 text-center text-sm text-muted-foreground">No tokens yet.</div>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-border bg-surface/40 p-5">
        <div className="text-sm font-medium text-muted-foreground mb-2">Claude Desktop config</div>
        <pre className="text-[11px] font-mono whitespace-pre rounded-md border border-border bg-background p-3 overflow-auto">{`{
  "mcpServers": {
    "chaff": {
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}`}</pre>
      </div>
    </div>
  );
}
