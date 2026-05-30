import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { activate, getActivation, getBlocklist } from "@/lib/activate.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Globe, Database, Sparkles, Loader2, CheckCircle2, XCircle,
  ShieldAlert, Zap, ArrowRight, Eye, EyeOff, Crosshair, Download,
  ShieldCheck, AlertTriangle, HelpCircle,
} from "lucide-react";

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

  const existing = useQuery({ queryKey: ["activation"], queryFn: () => fnGet() });

  const [siteUrl, setSiteUrl] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [indexPattern, setIndexPattern] = useState("logs-*");
  const [showKey, setShowKey] = useState(false);

  const mut = useMutation({
    mutationFn: () => fnActivate({ data: { siteUrl, esEndpoint: endpoint, esApiKey: apiKey, indexPattern } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Chaff is live", { description: `${r.detectors.length} custom detectors deployed.` });
        existing.refetch();
      } else {
        toast.error(r.error);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Activation failed"),
  });

  const result = mut.data && mut.data.ok ? mut.data : null;
  const failedSteps = mut.data && !mut.data.ok ? mut.data : null;
  const live = existing.data?.connection;

  const canActivate = siteUrl.trim() && endpoint.trim() && apiKey.trim() && !mut.isPending;

  return (
    <div className="p-10 max-w-5xl mx-auto space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Activate Chaff</h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Two inputs. Our agent scans your site, learns your log schema, and writes a custom bot-detection pack tailored to your exact routes.
          </p>
        </div>
        {live && (
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live: {live.label}
          </Badge>
        )}
      </div>

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
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
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
          <Button onClick={() => mut.mutate()} disabled={!canActivate} size="lg" className="gap-2">
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {mut.isPending ? "Activating…" : "Activate Chaff"}
          </Button>
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
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-2">
                  <Crosshair className="h-3.5 w-3.5" /> Custom detector pack
                </div>
                <h3 className="font-display text-2xl">{result.detectors.length} rules written for {new URL(result.recon.url).hostname}</h3>
              </div>
              <Link to="/app/dashboard" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                Open live console <ArrowRight className="h-3.5 w-3.5" />
              </Link>
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
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Crosshair className="h-3.5 w-3.5" /> Active detector pack
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

function DetectorRow({ d }: { d: Detector }) {
  const [open, setOpen] = useState(false);
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
            <div className={`font-mono text-sm ${d.match_count > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
              {d.match_count.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">24h hits</div>
          </div>
        )}
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 bg-background/60">
          {d.target_path && (
            <div className="mb-2 text-xs">
              <span className="text-muted-foreground">Target: </span>
              <code className="font-mono">{d.target_path}</code>
            </div>
          )}
          <pre className="font-mono text-[11px] text-foreground/80 overflow-auto max-h-64">
            {JSON.stringify(d.es_query, null, 2)}
          </pre>
        </div>
      )}
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
    { name: "Backtest on last 24h", ok: false },
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
