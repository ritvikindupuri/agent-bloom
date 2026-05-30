import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { activate, getActivation, getBlocklist, listSessions, clearSession, restoreSession } from "@/lib/activate.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Globe, Database, Sparkles, Loader2, CheckCircle2, XCircle,
  ShieldAlert, Zap, ArrowRight, Eye, EyeOff, Crosshair, Download,
  ShieldCheck, AlertTriangle, HelpCircle, History, Trash2, RotateCcw,
} from "lucide-react";
import { Hint } from "@/components/Hint";

export const Route = createFileRoute("/app/onboard")({
  component: OnboardPage,
});

type Offender = {
  ip: string;
  rdns: string | null;
  verifiedBot: string | null;
  isDatacenter: boolean;
  isTor: boolean;
  confidence: number;
  classification: "verified_bot" | "malicious" | "suspicious" | "benign" | "unknown";
  reasons: string[];
  eventCount: number;
  sampleUserAgent: string | null;
};

type Detector = {
  id: string; name: string; rationale: string;
  severity: "low" | "medium" | "high" | "critical";
  target_path?: string; es_query: any;
  match_count?: number; match_count_clean?: number;
  offenders?: Offender[];
};

const sevColor: Record<string, string> = {
  low: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
};

const classBadge: Record<Offender["classification"], { cls: string; icon: any; label: string }> = {
  verified_bot: { cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: ShieldCheck, label: "Verified bot" },
  malicious:    { cls: "bg-red-500/10 text-red-400 border-red-500/30", icon: AlertTriangle, label: "Malicious" },
  suspicious:   { cls: "bg-orange-500/10 text-orange-400 border-orange-500/30", icon: ShieldAlert, label: "Suspicious" },
  unknown:      { cls: "bg-muted text-muted-foreground border-border", icon: HelpCircle, label: "Unknown" },
  benign:       { cls: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: ShieldCheck, label: "Benign" },
};

function OnboardPage() {
  const fnActivate = useServerFn(activate);
  const fnGet = useServerFn(getActivation);
  const fnClear = useServerFn(clearSession);
  const qc = useQueryClient();

  const existing = useQuery({ queryKey: ["activation"], queryFn: () => fnGet() });

  const [siteUrl, setSiteUrl] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [indexPattern, setIndexPattern] = useState("logs-*");
  const [showKey, setShowKey] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const mut = useMutation({
    mutationFn: () => fnActivate({ data: { siteUrl, esEndpoint: endpoint, esApiKey: apiKey, indexPattern } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Chaff is live", { description: `${r.detectors.length} custom detectors deployed.` });
        existing.refetch();
        qc.invalidateQueries({ queryKey: ["sessions"] });
      } else {
        toast.error(r.error);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Activation failed"),
  });

  const clearMut = useMutation({
    mutationFn: () => fnClear(),
    onSuccess: () => {
      toast.success("Session cleared", { description: "Saved to history. You can restore it anytime." });
      setSiteUrl(""); setEndpoint(""); setApiKey(""); setIndexPattern("logs-*");
      mut.reset();
      existing.refetch();
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to clear"),
  });

  const result = mut.data && mut.data.ok ? mut.data : null;
  const failedSteps = mut.data && !mut.data.ok ? mut.data : null;
  const live = existing.data?.connection;
  const hasSession = !!live || !!result || !!siteUrl || !!endpoint || !!apiKey;

  const canActivate = siteUrl.trim() && endpoint.trim() && apiKey.trim() && !mut.isPending;

  return (
    <div className="p-10 max-w-5xl mx-auto space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Activate Chaff</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Two inputs. Our agent scans your site, learns your log schema, and writes a custom bot-detection pack tailored to your exact routes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {live && (
            <Hint label="Your current active session. Detectors are running against this site + cluster.">
              <Badge variant="secondary" className="gap-1.5 px-3 py-1 cursor-default">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live: {live.label}
              </Badge>
            </Hint>
          )}
          <Hint label="Browse and restore any past session. Each one keeps its own site, ES connection, and detector pack.">
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} className="gap-1.5">
              <History className="h-3.5 w-3.5" /> History
            </Button>
          </Hint>
          {hasSession && (
            <Hint label="Archive this session and reset the form. Nothing is deleted — restore it anytime from History.">
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearMut.mutate()}
                disabled={clearMut.isPending}
                className="gap-1.5"
              >
                {clearMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Clear session
              </Button>
            </Hint>
          )}
        </div>
      </div>

      {historyOpen && (
        <HistoryPanel
          onClose={() => setHistoryOpen(false)}
          onRestored={() => {
            mut.reset();
            existing.refetch();
            setHistoryOpen(false);
          }}
        />
      )}

      {/* The 2-input form */}
      <Card className="bg-surface/40 border-border p-6">
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <Label icon={Globe}>Your website URL</Label>
            <Input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://yoursite.com"
              disabled={mut.isPending}
              className="mt-2"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Firecrawl maps your stack, login pages, and API surface — so detectors target YOUR routes.
            </p>
          </div>

          <div>
            <Label icon={Database}>Elasticsearch endpoint</Label>
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://my-cluster.es.region.aws.elastic-cloud.com"
              disabled={mut.isPending}
              className="mt-2"
            />
          </div>

          <div>
            <Label icon={Sparkles}>API key</Label>
            <div className="mt-2 relative">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="base64-encoded ApiKey"
                disabled={mut.isPending}
                className="pr-9 font-mono"
              />
              <Hint label={showKey ? "Hide API key" : "Show API key"}>
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </Hint>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Create one in Kibana → Stack Management → API Keys. Read-only is enough.
            </p>
          </div>

          <div>
            <Label icon={Database}>Index pattern</Label>
            <Input
              value={indexPattern}
              onChange={(e) => setIndexPattern(e.target.value)}
              placeholder="logs-*"
              disabled={mut.isPending}
              className="mt-2 font-mono"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              We auto-detect fields from a sample doc — no manual mapping.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            No agent, no snippet, no install. We never write to your cluster.
          </p>
          <Hint label="Recon your site, sample your index, then generate + test a custom detector pack against the last 24h of logs.">
            <Button onClick={() => mut.mutate()} disabled={!canActivate} size="lg" className="gap-2">
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {mut.isPending ? "Activating…" : "Activate Chaff"}
            </Button>
          </Hint>
        </div>
      </Card>

      {/* Pipeline trace */}
      {(mut.isPending || mut.data) && (
        <Card className="bg-surface/40 border-border p-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" /> Agent pipeline
          </div>
          <PipelineSteps
            isPending={mut.isPending}
            steps={mut.data?.steps ?? defaultPendingSteps()}
            failed={!!failedSteps}
          />
          {failedSteps && (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {failedSteps.error}
            </div>
          )}
        </Card>
      )}

      {/* Recon + Detectors */}
      {result && (
        <>
          <Card className="bg-surface/40 border-border p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5" /> What the agent learned about your site
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-xl">{result.recon.title ?? result.recon.url}</span>
                  <Badge variant="secondary">{result.recon.stack.label}</Badge>
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {result.recon.pageCount} links mapped<br />
                {result.recon.suspectedSurface.length} sensitive paths flagged
              </div>
            </div>

            {result.recon.suspectedSurface.length > 0 && (
              <div className="mt-5">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="h-3 w-3" /> Attack surface in your HTML
                </div>
                <div className="grid md:grid-cols-2 gap-1.5">
                  {result.recon.suspectedSurface.map((s) => (
                    <div key={s.path} className="flex items-start gap-2 text-sm bg-background/40 rounded px-2.5 py-1.5">
                      <code className="font-mono text-xs">{s.path}</code>
                      <span className="text-xs text-muted-foreground truncate">{s.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
              <SchemaPill label="timestamp" value={result.schema.timestamp_field} />
              <SchemaPill label="client ip" value={result.schema.ip_field} />
              <SchemaPill label="user agent" value={result.schema.user_agent_field} />
              <SchemaPill label="url path" value={result.schema.url_field} />
              <SchemaPill label="status" value={result.schema.status_field} />
            </div>
          </Card>

          <Card className="bg-surface/40 border-border p-6">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-2">
                  <Crosshair className="h-3.5 w-3.5" /> Custom detector pack
                </div>
                <h3 className="font-display text-2xl">{result.detectors.length} rules written for {new URL(result.recon.url).hostname}</h3>
              </div>
              <div className="flex items-center gap-2">
                <BlocklistExport />
                <Link to="/app/dashboard" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                  Open live console <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
            <div className="space-y-2">
              {result.detectors.map((d) => <DetectorRow key={d.id} d={d} />)}
            </div>
          </Card>
        </>
      )}

      {/* Existing activation summary if already live */}
      {!result && live && live.detector_pack && (
        <Card className="bg-surface/40 border-border p-6">
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Crosshair className="h-3.5 w-3.5" /> Active detector pack
            </div>
            <BlocklistExport />
          </div>
          <div className="space-y-2">
            {(((live.detector_pack as any)?.detectors ?? []) as Detector[]).map((d) => <DetectorRow key={d.id} d={d} />)}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Re-activate above to regenerate detectors after site changes.
          </p>
        </Card>
      )}
    </div>
  );
}

function BlocklistExport() {
  const fn = useServerFn(getBlocklist);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"nginx" | "cloudflare" | "iptables">("nginx");
  const q = useQuery({ queryKey: ["blocklist"], queryFn: () => fn(), enabled: open });
  const data: any = q.data;
  const text = data ? data[tab] : "";
  return (
    <>
      <Hint label="Export the IPs flagged by your detectors as a drop-in blocklist for nginx, Cloudflare, or iptables.">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
          <Download className="h-3.5 w-3.5" /> Export blocklist
        </Button>
      </Hint>
      {open && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <Card className="bg-surface border-border p-5 max-w-3xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-display text-xl">Deployable blocklist</h3>
                <p className="text-xs text-muted-foreground">
                  {data ? `${data.count} IPs · confidence ≥ 40 · verified bots excluded` : "Loading…"}
                </p>
              </div>
              <div className="flex gap-1">
                {(["nginx", "cloudflare", "iptables"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-2.5 py-1 text-xs rounded border ${tab === t ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <pre className="flex-1 overflow-auto font-mono text-[11px] bg-background/60 rounded p-3 border border-border">
              {q.isLoading ? "Generating…" : text || "No blockable offenders yet."}
            </pre>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Close</Button>
              <Button
                size="sm"
                disabled={!text}
                onClick={() => {
                  navigator.clipboard.writeText(text);
                  toast.success("Copied to clipboard");
                }}
              >
                Copy
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function DetectorRow({ d }: { d: Detector }) {
  const [open, setOpen] = useState(false);
  const clean = d.match_count_clean ?? d.match_count ?? 0;
  const raw = d.match_count ?? 0;
  const excluded = Math.max(0, raw - clean);
  return (
    <div className="rounded-md border border-border bg-background/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-background/60 transition"
      >
        <Badge variant="outline" className={`shrink-0 capitalize ${sevColor[d.severity] ?? ""}`}>{d.severity}</Badge>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{d.name}</div>
          <div className="text-xs text-muted-foreground truncate">{d.rationale}</div>
        </div>
        {typeof d.match_count === "number" && (
          <div className="shrink-0 text-right">
            <div className={`font-mono text-sm ${clean > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
              {clean.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              threats {excluded > 0 && <span className="text-emerald-400">· −{excluded.toLocaleString()} verified</span>}
            </div>
          </div>
        )}
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 bg-background/60 space-y-3">
          {d.target_path && (
            <div className="text-xs">
              <span className="text-muted-foreground">Target: </span>
              <code className="font-mono">{d.target_path}</code>
            </div>
          )}
          {d.offenders && d.offenders.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Top offenders (enriched)</div>
              <div className="space-y-1">
                {d.offenders.slice(0, 6).map((o) => <OffenderRow key={o.ip} o={o} />)}
              </div>
            </div>
          )}
          <details>
            <summary className="text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer">Raw ES query</summary>
            <pre className="mt-2 font-mono text-[11px] text-foreground/80 overflow-auto max-h-64">
              {JSON.stringify(d.es_query, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

function OffenderRow({ o }: { o: Offender }) {
  const cls = classBadge[o.classification];
  const Icon = cls.icon;
  return (
    <div className="flex items-center gap-2.5 text-xs bg-background/60 rounded px-2.5 py-1.5">
      <Badge variant="outline" className={`shrink-0 gap-1 ${cls.cls}`}>
        <Icon className="h-3 w-3" /> {cls.label}
      </Badge>
      <code className="font-mono text-foreground shrink-0">{o.ip}</code>
      <span className="text-muted-foreground truncate flex-1" title={o.reasons.join(" · ")}>
        {o.rdns ?? "no rDNS"} {o.reasons[0] && <span>· {o.reasons[0]}</span>}
      </span>
      <span className="font-mono text-muted-foreground shrink-0">{o.eventCount.toLocaleString()}×</span>
      <span className={`font-mono shrink-0 ${o.confidence >= 70 ? "text-red-400" : o.confidence >= 40 ? "text-amber-400" : "text-muted-foreground"}`}>
        {o.confidence}
      </span>
    </div>
  );
}

function PipelineSteps({ isPending, steps, failed }: { isPending: boolean; steps: { name: string; ok: boolean; detail?: string }[]; failed: boolean }) {
  const total = 5;
  const completed = steps.length;
  return (
    <ol className="space-y-2.5">
      {Array.from({ length: total }).map((_, i) => {
        const step = steps[i];
        const isCurrent = isPending && i === completed && !failed;
        const isDone = !!step?.ok;
        const isFail = !!step && !step.ok;
        return (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="w-5 h-5 flex items-center justify-center">
              {isDone && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              {isFail && <XCircle className="h-4 w-4 text-destructive" />}
              {isCurrent && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {!isDone && !isFail && !isCurrent && <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />}
            </span>
            <span className={isDone ? "text-foreground" : isCurrent ? "text-foreground" : "text-muted-foreground"}>
              {step?.name ?? defaultPendingSteps()[i].name}
            </span>
            {step?.detail && <span className="text-xs text-muted-foreground font-mono">— {step.detail}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function defaultPendingSteps() {
  return [
    { name: "Connect Elasticsearch", ok: false },
    { name: "Scan site with Firecrawl", ok: false },
    { name: "Auto-detect log schema", ok: false },
    { name: "Generate site-specific detectors", ok: false },
    { name: "Enrich offenders + verify bots", ok: false },
  ];
}

function Label({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
      <Icon className="h-3 w-3" /> {children}
    </div>
  );
}

function SchemaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background/40 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-[11px] truncate" title={value}>{value}</div>
    </div>
  );
}

function HistoryPanel({ onClose, onRestored }: { onClose: () => void; onRestored: () => void }) {
  const fnList = useServerFn(listSessions);
  const fnRestore = useServerFn(restoreSession);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sessions"], queryFn: () => fnList() });
  const restore = useMutation({
    mutationFn: (id: string) => fnRestore({ data: { id } }),
    onSuccess: () => {
      toast.success("Session restored");
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["activation"] });
      qc.invalidateQueries({ queryKey: ["blocklist"] });
      onRestored();
    },
    onError: (e: any) => toast.error(e?.message ?? "Restore failed"),
  });
  const sessions = q.data?.sessions ?? [];
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <Card className="bg-surface border-border p-5 max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display text-xl flex items-center gap-2"><History className="h-4 w-4" /> Session history</h3>
            <p className="text-xs text-muted-foreground">Past activations. Click restore to reload that exact session.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="flex-1 overflow-auto space-y-2">
          {q.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {!q.isLoading && sessions.length === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center">No sessions yet.</div>
          )}
          {sessions.map((s) => (
            <div key={s.id} className="rounded-md border border-border bg-background/40 p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{s.label}</span>
                  {s.is_active && (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Active
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">
                  {s.site_url ?? "—"} · {s.index_pattern} · {s.detector_count} detectors
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(s.created_at).toLocaleString()}
                </div>
              </div>
              {!s.is_active && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(s.id)}
                  className="gap-1.5 shrink-0"
                >
                  {restore.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Restore
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
