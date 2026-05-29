import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { harvestTraffic } from "@/lib/harvest.functions";
import { Crosshair, Loader2, Radar, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/app/harvest")({
  component: HarvestPage,
});

function HarvestPage() {
  const harvest = useServerFn(harvestTraffic);
  const [target, setTarget] = useState("");
  const [count, setCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof harvestTraffic>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await harvest({ data: { target, count } });
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? "Harvest failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <Radar className="h-3.5 w-3.5" /> Traffic Harvester
      </div>
      <h1 className="mt-2 font-display text-4xl tracking-tight">No logs? No problem.</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Point Chaff at a URL. A Gemini-orchestrated probe makes <span className="text-foreground">real HTTP requests</span> against
        it with a curated mix of browser and bot user-agents, captures actual responses,
        and ships them as access-log events into your Elasticsearch index. Then run the
        Agent to hunt the bots it just planted alongside any real traffic.
      </p>

      <form onSubmit={run} className="mt-8 space-y-4 rounded-2xl border border-border bg-surface/40 p-6">
        <div>
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Target URL</label>
          <input
            type="url"
            required
            placeholder="https://your-site.com"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Probes ({count})</label>
          <input
            type="range"
            min={5}
            max={40}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value))}
            className="mt-2 w-full"
          />
        </div>
        <button
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
          {loading ? "Harvesting…" : "Harvest & index"}
        </button>
        {error && <div className="text-sm text-destructive">{error}</div>}
      </form>

      {result && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-border bg-surface/40 p-5">
            <div className="flex items-baseline gap-6">
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Indexed</div>
                <div className="font-display text-3xl">{result.indexed}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Errors</div>
                <div className="font-display text-3xl">{result.errors}</div>
              </div>
              <div className="text-sm text-muted-foreground break-all">→ {result.target}</div>
            </div>
          </div>

          {result.samples.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface/40 p-5">
              <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Sample probes</div>
              <div className="space-y-1.5 font-mono text-[12px]">
                {result.samples.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className={s.verdict === "bot" ? "text-[color:var(--bot)]" : s.verdict === "suspect" ? "text-amber-400" : "text-emerald-400"}>●</span>
                    <span className="w-16 text-muted-foreground">{s.status}</span>
                    <span className="w-20 text-muted-foreground">{s.latency}ms</span>
                    <span className="w-40 truncate">{s.ua_family}</span>
                    <span className="truncate text-muted-foreground">{s.path}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link
            to="/app/agent"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface/60 px-4 py-2 text-sm hover:bg-surface"
          >
            Hunt these bots in the Agent <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
