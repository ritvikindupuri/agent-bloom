import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCampaign, updateCampaignStatus } from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/campaigns/$id")({ component: CampaignDetail });

function CampaignDetail() {
  const { id } = Route.useParams();
  const fnGet = useServerFn(getCampaign);
  const fnUpdate = useServerFn(updateCampaignStatus);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["campaign", id], queryFn: () => fnGet({ data: { id } }) });
  const m = useMutation({
    mutationFn: (status: "active" | "resolved" | "monitoring") => fnUpdate({ data: { id, status } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["campaign", id] }); toast.success("Updated"); },
  });

  const c = q.data?.campaign;
  if (q.isLoading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  if (!c) return <div className="p-10 text-sm text-muted-foreground">Campaign not found.</div>;

  return (
    <div className="p-10 max-w-5xl">
      <Link to="/app/campaigns" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3 mr-1" />All campaigns</Link>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-tight">{c.name}</h1>
          <div className="text-xs text-muted-foreground font-mono mt-1">sig:{c.signature_hash}</div>
        </div>
        <div className="flex gap-2">
          {(["active", "monitoring", "resolved"] as const).map((s) => (
            <Button key={s} size="sm" variant={c.status === s ? "default" : "outline"} onClick={() => m.mutate(s)}>{s}</Button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Metric label="Events" value={c.event_count} />
        <Metric label="IPs" value={c.ip_count} />
        <Metric label="Avg score" value={c.fingerprint?.avg_score ?? 0} />
        <Metric label="Last seen" value={c.last_seen ? new Date(c.last_seen).toLocaleString() : "—"} small />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel title="Fingerprint">
          <KV k="UA family" v={c.fingerprint?.ua_family} />
          <KV k="WebGL renderer" v={c.fingerprint?.webgl_renderer} />
          <KV k="Canvas hash" v={c.fingerprint?.canvas_hash} mono />
          <KV k="Top IP" v={c.fingerprint?.top_ip ?? "—"} mono />
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Top reasons</div>
            <div className="flex flex-wrap gap-1.5">
              {(c.fingerprint?.top_reasons ?? []).map((r: string) => (
                <span key={r} className="text-[11px] rounded border border-border bg-background px-1.5 py-0.5">{r}</span>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="Auto-generated kill rule (Cloudflare WAF)">
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all rounded-md border border-border bg-background p-3 max-h-64 overflow-auto">{c.kill_rule || "No rule generated yet."}</pre>
          {c.kill_rule && (
            <button onClick={() => { navigator.clipboard.writeText(c.kill_rule); toast.success("Copied"); }} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Copy className="h-3 w-3" />Copy expression</button>
          )}
        </Panel>
      </div>

      <Panel title={`Recent events (${q.data?.samples?.length ?? 0})`} className="mt-6">
        <div className="divide-y divide-border">
          {q.data?.samples?.length ? q.data.samples.map((s: any, i: number) => (
            <div key={i} className="py-2 text-xs flex items-center gap-3">
              <VerdictPill v={s.verdict} />
              <span className="text-muted-foreground font-mono">{new Date(s["@timestamp"]).toLocaleString()}</span>
              <span className="font-mono">{s.ip_str ?? s.ip ?? "—"}</span>
              <span className="truncate text-muted-foreground">{s.ua}</span>
            </div>
          )) : <div className="text-xs text-muted-foreground py-3">No samples.</div>}
        </div>
      </Panel>
    </div>
  );
}

function VerdictPill({ v }: { v: string }) {
  const cls = v === "human" ? "bg-[color:var(--human)]/10 text-[color:var(--human)]"
    : v === "suspect" ? "bg-[color:var(--warn)]/10 text-[color:var(--warn)]"
    : "bg-[color:var(--bot)]/10 text-[color:var(--bot)]";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${cls}`}>{v}</span>;
}

function Metric({ label, value, small }: { label: string; value: any; small?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface/40 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 font-display ${small ? "text-base" : "text-3xl"}`}>{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-surface/40 p-5 ${className}`}>
      <div className="text-sm font-medium text-muted-foreground mb-3">{title}</div>
      {children}
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: any; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className={mono ? "font-mono" : ""}>{String(v ?? "—")}</span>
    </div>
  );
}
