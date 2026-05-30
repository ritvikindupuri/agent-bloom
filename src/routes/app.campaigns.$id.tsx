import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getCampaign,
  updateCampaignStatus,
  exportBlockRule,
  enrichTopIp,
  recordBlockAction,
} from "@/lib/campaigns.functions";
import { TARGETS, type Target } from "@/lib/block-rules";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Check, Shield, Globe2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/campaigns/$id")({ component: CampaignDetail });

function CampaignDetail() {
  const { id } = Route.useParams();
  const fnGet = useServerFn(getCampaign);
  const fnUpdate = useServerFn(updateCampaignStatus);
  const fnExport = useServerFn(exportBlockRule);
  const fnEnrich = useServerFn(enrichTopIp);
  const fnBlock = useServerFn(recordBlockAction);
  const qc = useQueryClient();
  const [target, setTarget] = useState<Target>("cloudflare");
  const [copied, setCopied] = useState(false);

  const q = useQuery({ queryKey: ["campaign", id], queryFn: () => fnGet({ data: { id } }) });
  const ruleQ = useQuery({
    queryKey: ["rule", id, target],
    queryFn: () => fnExport({ data: { id, target } }),
    enabled: !!q.data?.campaign,
  });

  const statusM = useMutation({
    mutationFn: (status: "active" | "resolved" | "monitoring") =>
      fnUpdate({ data: { id, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", id] });
      toast.success("Status updated");
    },
  });
  const enrichM = useMutation({
    mutationFn: () => fnEnrich({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", id] });
      toast.success("IP enriched");
    },
    onError: (e: any) => toast.error(e?.message ?? "Enrichment failed"),
  });
  const blockM = useMutation({
    mutationFn: () => fnBlock({ data: { id, target } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign", id] });
      toast.success("Campaign blocked & logged");
    },
  });

  const c = q.data?.campaign as any;
  if (q.isLoading) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  if (!c) return <div className="p-10 text-sm text-muted-foreground">Campaign not found.</div>;

  const intel = c.fingerprint?.ip_intel;
  const rule = ruleQ.data?.rule ?? "";

  async function copy() {
    if (!rule) return;
    await navigator.clipboard.writeText(rule);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
    toast.success("Rule copied");
  }

  return (
    <div className="p-10 max-w-5xl">
      <Link
        to="/app/campaigns"
        className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3 mr-1" />
        All campaigns
      </Link>
      <div className="mt-3 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl tracking-tight">{c.name}</h1>
          <div className="text-xs text-muted-foreground font-mono mt-1">
            sig:{c.signature_hash} · {c.status}
          </div>
        </div>
        <div className="flex gap-2">
          {(["active", "monitoring", "resolved"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={c.status === s ? "default" : "outline"}
              onClick={() => statusM.mutate(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Metric label="Events" value={c.event_count} />
        <Metric label="IPs" value={c.ip_count} />
        <Metric label="Avg score" value={c.fingerprint?.avg_score ?? 0} />
        <Metric
          label="Last seen"
          value={c.last_seen ? new Date(c.last_seen).toLocaleString() : "—"}
          small
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel title="Fingerprint">
          <KV k="UA family" v={c.fingerprint?.ua_family} />
          <KV k="WebGL renderer" v={c.fingerprint?.webgl_renderer} />
          <KV k="Canvas hash" v={c.fingerprint?.canvas_hash} mono />
          <KV k="Top IP" v={c.fingerprint?.top_ip ?? "—"} mono />
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Top reasons
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(c.fingerprint?.top_reasons ?? []).map((r: string) => (
                <span
                  key={r}
                  className="text-[11px] rounded border border-border bg-background px-1.5 py-0.5"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="IP intelligence">
          {!intel && (
            <div className="text-center py-4">
              <Globe2 className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">
                {c.fingerprint?.top_ip
                  ? `Enrich ${c.fingerprint.top_ip} with ASN, hosting & proxy flags.`
                  : "No top IP available."}
              </p>
              {c.fingerprint?.top_ip && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => enrichM.mutate()}
                  disabled={enrichM.isPending}
                >
                  {enrichM.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Globe2 className="h-3.5 w-3.5 mr-1" />
                  )}
                  Enrich IP
                </Button>
              )}
            </div>
          )}
          {intel && (
            <>
              <KV k="IP" v={intel.ip} mono />
              <KV k="ASN" v={`${intel.asn_name ?? "—"} (${intel.asn ?? "—"})`} />
              <KV k="ISP / org" v={intel.isp || intel.org || "—"} />
              <KV
                k="Location"
                v={`${intel.city ?? ""}${intel.city ? ", " : ""}${intel.country ?? "—"}`}
              />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {intel.flags?.hosting && (
                  <Badge className="bg-[color:var(--bot)]/15 text-[color:var(--bot)] text-[10px] uppercase tracking-wider">
                    Datacenter
                  </Badge>
                )}
                {intel.flags?.proxy && (
                  <Badge className="bg-[color:var(--warn)]/15 text-[color:var(--warn)] text-[10px] uppercase tracking-wider">
                    Proxy
                  </Badge>
                )}
                {intel.flags?.mobile && (
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    Mobile
                  </Badge>
                )}
                {!intel.flags?.hosting && !intel.flags?.proxy && (
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    Residential
                  </Badge>
                )}
              </div>
              <button
                onClick={() => enrichM.mutate()}
                className="mt-3 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Refresh
              </button>
            </>
          )}
        </Panel>
      </div>

      <Panel title="Block rule export" className="mt-6">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {TARGETS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTarget(t.id)}
              className={`text-xs px-2.5 py-1 rounded border transition ${
                target === t.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-all rounded-md border border-border bg-background p-3 max-h-72 overflow-auto">
          {ruleQ.isLoading ? "Generating…" : rule || "No rule."}
        </pre>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={copy} disabled={!rule}>
            {copied ? (
              <Check className="h-3.5 w-3.5 mr-1" />
            ) : (
              <Copy className="h-3.5 w-3.5 mr-1" />
            )}{" "}
            Copy
          </Button>
          <Button
            size="sm"
            onClick={() => blockM.mutate()}
            disabled={blockM.isPending || c.status === "resolved"}
          >
            {c.status === "resolved" ? (
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
            ) : (
              <Shield className="h-3.5 w-3.5 mr-1" />
            )}
            {c.status === "resolved" ? "Already blocked" : "Mark as blocked & log"}
          </Button>
          <span className="text-[11px] text-muted-foreground ml-auto">
            Apply the rule at your edge, then log here for an audit trail.
          </span>
        </div>
      </Panel>

      <Panel title={`Recent events (${q.data?.samples?.length ?? 0})`} className="mt-6">
        <div className="divide-y divide-border">
          {q.data?.samples?.length ? (
            q.data.samples.map((s: any, i: number) => (
              <div key={i} className="py-2 text-xs flex items-center gap-3">
                <VerdictPill v={s.verdict} />
                <span className="text-muted-foreground font-mono">
                  {new Date(s["@timestamp"]).toLocaleString()}
                </span>
                <span className="font-mono">{s.ip_str ?? s.ip ?? "—"}</span>
                <span className="truncate text-muted-foreground">{s.ua}</span>
              </div>
            ))
          ) : (
            <div className="text-xs text-muted-foreground py-3">No samples.</div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function VerdictPill({ v }: { v: string }) {
  const cls =
    v === "human"
      ? "bg-[color:var(--human)]/10 text-[color:var(--human)]"
      : v === "suspect"
        ? "bg-[color:var(--warn)]/10 text-[color:var(--warn)]"
        : "bg-[color:var(--bot)]/10 text-[color:var(--bot)]";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${cls}`}>
      {v}
    </span>
  );
}

function Metric({ label, value, small }: { label: string; value: any; small?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface/40 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-2 font-display ${small ? "text-base" : "text-3xl"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
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
