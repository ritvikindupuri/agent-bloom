import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listHoneypots, createHoneypot } from "@/lib/honeypots.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Copy, Check, Radar, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/harvest")({
  component: InstallPage,
});

function InstallPage() {
  const fnList = useServerFn(listHoneypots);
  const fnCreate = useServerFn(createHoneypot);
  const q = useQuery({ queryKey: ["honeypots"], queryFn: () => fnList() });
  const [label, setLabel] = useState("My site");
  const [copied, setCopied] = useState<string | null>(null);

  const hp = q.data?.honeypots?.[0];
  const origin = typeof window !== "undefined" ? window.location.origin : "";

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

  async function create() {
    await fnCreate({ data: { label } });
    toast.success("Site key created");
    q.refetch();
  }

  return (
    <div className="p-10 max-w-3xl">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Install</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drop this snippet into your site. Every real visitor's signals are fingerprinted client-side and shipped straight into your Elasticsearch index — no synthetic traffic, no log shipper to run.
        </p>
      </div>

      {!hp && (
        <Card className="mt-8 bg-surface/40 border-border p-6">
          <div className="flex items-center gap-2"><Radar className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">Create a site key</span></div>
          <p className="mt-1 text-xs text-muted-foreground">One key per site. We'll use its slug to route beacons to your tenant.</p>
          <div className="mt-4 flex gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My site" />
            <Button onClick={create}><Plus className="h-4 w-4 mr-1" /> Create</Button>
          </div>
        </Card>
      )}

      {hp && (
        <>
          <Card className="mt-8 bg-surface/40 border-border p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Site key</div>
                <div className="mt-1 font-mono text-sm">{hp.slug}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => copy(hp.slug, "slug")}>
                {copied === "slug" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </Card>

          <Card className="mt-4 bg-surface/40 border-border p-6">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Embed snippet</div>
              <Button size="sm" variant="outline" onClick={() => copy(snippet, "snip")}>
                {copied === "snip" ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                Copy
              </Button>
            </div>
            <pre className="mt-3 overflow-auto rounded bg-background/60 p-4 font-mono text-[12px] text-foreground/90">{snippet}</pre>
            <p className="mt-3 text-xs text-muted-foreground">
              Place this before <code className="font-mono">&lt;/body&gt;</code> on every page. The beacon ships one event after ~3s of observation and a final one on page unload. Hits on <code className="font-mono">/trap/{hp.slug}</code> URLs are flagged as honeypot hits automatically.
            </p>
          </Card>

          <Card className="mt-4 bg-surface/40 border-border p-6">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">What gets shipped</div>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-foreground/90">
              <li>· UA + headless tells</li>
              <li>· Canvas + WebGL fingerprint</li>
              <li>· Mouse entropy, scroll, click</li>
              <li>· Screen, DPR, timezone</li>
              <li>· Dwell time, referrer, path</li>
              <li>· navigator.webdriver</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">No PII. No third-party calls. The beacon posts directly to your Chaff tenant.</p>
          </Card>
        </>
      )}
    </div>
  );
}
