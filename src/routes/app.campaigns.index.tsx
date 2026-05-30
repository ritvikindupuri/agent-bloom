import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCampaigns, clusterCampaigns } from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import { Sparkles, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Hint } from "@/components/Hint";

export const Route = createFileRoute("/app/campaigns/")({ component: CampaignsPage });

function CampaignsPage() {
  const fnList = useServerFn(listCampaigns);
  const fnCluster = useServerFn(clusterCampaigns);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["campaigns"], queryFn: () => fnList(), refetchInterval: 15_000 });
  const m = useMutation({
    mutationFn: () => fnCluster({ data: { windowMinutes: 1440 } }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["campaigns"] }); toast.success(`Clustered ${d.clusters} campaigns`); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-10 max-w-6xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bot actors clustered by behavioral fingerprint across IPs. Each one is a coordinated effort.
          </p>
        </div>
        <Hint label="Re-run clustering against the last 24h of fingerprints. Coordinated bots get grouped into a single campaign by behavioral signature.">
          <Button onClick={() => m.mutate()} disabled={m.isPending} variant="secondary">
            <Sparkles className="h-4 w-4 mr-1" />{m.isPending ? "Clustering…" : "Re-cluster (24h)"}
          </Button>
        </Hint>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface/40 divide-y divide-border">
        {q.data?.campaigns?.length ? q.data.campaigns.map((c: any) => (
          <Link key={c.id} to="/app/campaigns/$id" params={{ id: c.id }} className="block p-5 hover:bg-accent/40 transition">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-xl">{c.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${c.status === "active" ? "bg-[color:var(--bot)]/10 text-[color:var(--bot)]" : "bg-muted text-muted-foreground"}`}>{c.status}</span>
                </div>
                <div className="text-xs text-muted-foreground font-mono mt-1">sig:{c.signature_hash} · {c.fingerprint?.ua_family} · {c.fingerprint?.webgl_renderer}</div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <Stat n={c.event_count} label="events" />
                <Stat n={c.ip_count} label="IPs" />
                <Stat n={c.fingerprint?.avg_score ?? 0} label="score" />
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </Link>
        )) : (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {q.isLoading ? "Loading…" : "No campaigns yet. Create a honeypot, then click Re-cluster."}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="text-right">
      <div className="font-mono">{n?.toLocaleString?.() ?? n}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}
