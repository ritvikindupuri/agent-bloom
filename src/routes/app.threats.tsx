import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listThreats, updateThreatStatus } from "@/lib/es.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShieldAlert, ShieldOff, Eye, EyeOff, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Hint } from "@/components/Hint";

export const Route = createFileRoute("/app/threats")({
  component: ThreatsPage,
});

const SEVERITY: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-[color:var(--warn)]/15 text-[color:var(--warn)]",
  high: "bg-[color:var(--bot)]/15 text-[color:var(--bot)]",
  critical: "bg-destructive/20 text-destructive",
};

function ThreatsPage() {
  const qc = useQueryClient();
  const fnList = useServerFn(listThreats);
  const fnUpdate = useServerFn(updateThreatStatus);
  const q = useQuery({ queryKey: ["threats"], queryFn: () => fnList(), refetchInterval: 15_000 });

  const upd = useMutation({
    mutationFn: ({ id, status }: { id: string; status: any }) => fnUpdate({ data: { id, status } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["threats"] }); toast.success("Updated"); },
  });

  const threats = q.data?.threats ?? [];

  return (
    <div className="p-10 max-w-5xl">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Threats</h1>
        <p className="mt-1 text-sm text-muted-foreground">Findings recorded by the agent. Triage, dismiss, or mark blocked.</p>
      </div>

      <div className="mt-8 space-y-3">
        {q.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        )}
        {!q.isLoading && threats.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-surface/30 p-16 text-center">
            <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
            <h3 className="mt-4 font-display text-2xl">No threats recorded yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Ask the agent to investigate your traffic — it will record findings here.</p>
          </div>
        )}

        {threats.map((t: any) => (
          <Card key={t.id} className="bg-surface/40 border-border p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`uppercase text-[10px] tracking-wider ${SEVERITY[t.severity] ?? ""}`} variant="secondary">{t.severity}</Badge>
                  <Badge variant="outline" className="text-[10px]">{t.kind}</Badge>
                  <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(t.created_at).toLocaleString()}</span>
                </div>
                <h3 className="mt-2 font-display text-xl">{t.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t.summary}</p>
                <div className="mt-3 flex gap-4 text-xs font-mono text-muted-foreground flex-wrap">
                  {t.ip && <span>IP: <span className="text-foreground">{t.ip}</span></span>}
                  {t.user_agent && <span className="truncate max-w-md">UA: <span className="text-foreground">{t.user_agent}</span></span>}
                  {t.request_count != null && <span>Requests: <span className="text-foreground">{Number(t.request_count).toLocaleString()}</span></span>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <Button size="sm" variant="outline" onClick={() => upd.mutate({ id: t.id, status: "blocked" })}>
                  <Lock className="h-3.5 w-3.5 mr-1" /> Mark blocked
                </Button>
                <Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: t.id, status: "investigating" })}>
                  <Eye className="h-3.5 w-3.5 mr-1" /> Investigating
                </Button>
                <Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: t.id, status: "dismissed" })}>
                  <EyeOff className="h-3.5 w-3.5 mr-1" /> Dismiss
                </Button>
              </div>
            </div>
            {t.evidence && Object.keys(t.evidence).length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Evidence</summary>
                <pre className="mt-2 overflow-auto rounded bg-background/60 p-3 font-mono text-[11px] text-muted-foreground max-h-64">
                  {JSON.stringify(t.evidence, null, 2)}
                </pre>
              </details>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
