import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { scanSite } from "@/lib/onboard.functions";
import { listHoneypots, createHoneypot } from "@/lib/honeypots.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Globe, Search, Copy, Check, CheckCircle2, Circle,
  ShieldAlert, Wand2, Loader2, Crosshair, ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/app/onboard")({
  component: OnboardPage,
});

function OnboardPage() {
  const qc = useQueryClient();
  const fnScan = useServerFn(scanSite);
  const fnList = useServerFn(listHoneypots);
  const fnCreate = useServerFn(createHoneypot);

  const hpQ = useQuery({ queryKey: ["honeypots"], queryFn: () => fnList() });
  const hp = hpQ.data?.honeypots?.[0];

  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const scanMut = useMutation({
    mutationFn: (args: { url: string; expectedSlug?: string }) => fnScan({ data: args }),
  });

  const createMut = useMutation({
    mutationFn: () => fnCreate({ data: { label: url || "My site" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["honeypots"] }),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const scan = scanMut.data && scanMut.data.ok ? scanMut.data : null;

  const snippet = useMemo(() => {
    if (!hp) return "";
    return `<!-- Chaff beacon -->
<script>window.__chaff_slug = "${hp.slug}";</script>
<script async src="${origin}/beacon.js"></script>`;
  }, [hp, origin]);

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success("Copied");
    setTimeout(() => setCopied(null), 1200);
  }

  async function handleScan() {
    if (!url.trim()) return;
    if (!hp) await createMut.mutateAsync();
    scanMut.mutate({ url, expectedSlug: hp?.slug });
  }

  async function handleVerify() {
    if (!url.trim() || !hp) return;
    const res = await scanMut.mutateAsync({ url, expectedSlug: hp.slug });
    if (res.ok && res.beaconDetected) toast.success("Beacon detected — you're live");
    else toast.error("Beacon not detected yet. Make sure you saved & deployed.");
  }

  const step1Done = !!url.trim();
  const step2Done = !!scan;
  const step3Done = !!hp;
  const step4Done = !!scan?.beaconDetected;

  return (
    <div className="p-10 max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Onboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste your site URL. We'll detect your stack, map your attack surface, and give you exact install instructions. The autonomous agent starts hunting bots the moment your first real visitor arrives.
        </p>
      </div>

      {/* Step 1 — URL */}
      <Step n={1} done={step1Done} title="Your site URL">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yoursite.com"
              className="pl-9"
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
            />
          </div>
          <Button onClick={handleScan} disabled={scanMut.isPending || !url.trim()}>
            {scanMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Scan
          </Button>
        </div>
        {scanMut.data && !scanMut.data.ok && (
          <p className="mt-2 text-xs text-destructive">{(scanMut.data as any).error}</p>
        )}
      </Step>

      {/* Step 2 — Detection */}
      {scan && (
        <Step n={2} done={step2Done} title="What we found">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Detected stack">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-[color:var(--human)]" />
                <span className="font-medium">{scan.stack.label}</span>
                <Badge variant="secondary" className="text-[10px]">{scan.stack.id}</Badge>
              </div>
            </Field>
            <Field label="Title">
              <span className="text-sm">{scan.title ?? "—"}</span>
            </Field>
            <Field label="Pages discovered" full>
              <span className="text-sm">{scan.pageCount} links on landing page</span>
            </Field>
          </div>

          {scan.suspectedSurface.length > 0 && (
            <div className="mt-5 rounded-md border border-border bg-background/40 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5" /> Attack surface exposed in your HTML
              </div>
              <ul className="mt-3 space-y-1.5">
                {scan.suspectedSurface.map((s) => (
                  <li key={s.path} className="flex items-start gap-3 text-sm">
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{s.path}</code>
                    <span className="text-muted-foreground">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 rounded-md border border-border bg-background/40 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Crosshair className="h-3.5 w-3.5" /> Honeypot bait paths to deploy
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Bots probing {scan.stack.label} sites consistently hit these. Wire any of them on your server to redirect to <code className="font-mono">{origin}/trap/{hp?.slug ?? "&lt;slug&gt;"}</code> — every hit becomes a confirmed-bot signal in your agent's cluster.
            </p>
            <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {scan.stack.baitPaths.map((p) => (
                <li key={p} className="flex items-center gap-2 text-sm">
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <code className="font-mono text-xs">{p}</code>
                </li>
              ))}
            </ul>
          </div>
        </Step>
      )}

      {/* Step 3 — Install */}
      {scan && hp && (
        <Step n={3} done={step3Done} title="Install the beacon">
          <p className="text-sm text-muted-foreground">{scan.stack.installLocation}</p>
          <div className="mt-3 rounded-md border border-border bg-background/60">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-mono text-muted-foreground">snippet.html</span>
              <Button size="sm" variant="ghost" onClick={() => copy(snippet, "snip")}>
                {copied === "snip" ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />} Copy
              </Button>
            </div>
            <pre className="overflow-auto p-4 font-mono text-[12px] text-foreground/90">{snippet}</pre>
          </div>
        </Step>
      )}

      {/* Step 4 — Verify */}
      {scan && hp && (
        <Step n={4} done={step4Done} title="Verify install">
          <div className="flex items-center gap-3">
            <Button onClick={handleVerify} disabled={scanMut.isPending} variant="outline">
              {scanMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Re-scan {url || "your site"}
            </Button>
            {scan.beaconDetected ? (
              <span className="flex items-center gap-2 text-sm text-[color:var(--human)]">
                <CheckCircle2 className="h-4 w-4" /> Beacon live. The agent is now classifying every visitor.
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Beacon not detected yet — save the snippet & redeploy, then re-scan.
              </span>
            )}
          </div>
        </Step>
      )}
    </div>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-surface/40 border-border p-6">
      <div className="flex items-center gap-3 mb-4">
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-[color:var(--human)]" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" />
        )}
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Step {n}</span>
        <span className="font-medium">{title}</span>
      </div>
      {children}
    </Card>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
