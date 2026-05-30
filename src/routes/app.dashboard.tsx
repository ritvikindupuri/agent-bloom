import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMetrics, listConnections } from "@/lib/es.functions";
import { loadDemo, clearDemo } from "@/lib/demo.functions";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot, User, Globe, Activity, AlertTriangle, ChevronRight, Plug, Sparkles, Trash2, Loader2 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/app/dashboard")({
  component: Dashboard,
});

const RANGES = [
  { label: "1h", value: 60 },
  { label: "6h", value: 360 },
  { label: "24h", value: 1440 },
  { label: "7d", value: 10080 },
] as const;

function Dashboard() {
  const [range, setRange] = useState<number>(60);
  const fnGet = useServerFn(getMetrics);
  const fnList = useServerFn(listConnections);

  const conns = useQuery({ queryKey: ["connections"], queryFn: () => fnList() });
  const hasConn = (conns.data?.connections?.length ?? 0) > 0;

  const m = useQuery({
    queryKey: ["metrics", range],
    queryFn: () => fnGet({ data: { rangeMinutes: range } }),
    enabled: hasConn,
    refetchInterval: 30_000,
  });

  if (!hasConn && !conns.isLoading) {
    return (
      <div className="p-10">
        <PageHeader title="Dashboard" subtitle="Live overview of your traffic." />
        <EmptyConn />
      </div>
    );
  }

  const metrics = m.data?.metrics;
  const err = m.data?.error;

  return (
    <div className="p-10 max-w-7xl">
      <PageHeader
        title="Dashboard"
        subtitle="Live overview of your traffic, sifted in real time."
        right={
          <div className="flex items-center gap-2">
            <DemoControls onChange={() => m.refetch()} />
            <div className="flex gap-1 rounded-md border border-border bg-surface/40 p-0.5">
              {RANGES.map((r) => (
                <button key={r.value} onClick={() => setRange(r.value)}
                  className={`px-2.5 py-1 rounded text-xs transition ${range === r.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {err && (
        <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <div className="flex items-center gap-2 text-destructive font-medium"><AlertTriangle className="h-4 w-4" /> Couldn't query Elasticsearch</div>
          <div className="mt-1 text-muted-foreground font-mono text-xs break-all">{err}</div>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <Stat label="Total requests" value={metrics?.totalRequests} icon={<Activity className="h-4 w-4" />} loading={m.isLoading} />
        <Stat label="Bot traffic" value={metrics?.botRequests} icon={<Bot className="h-4 w-4" />} accent="bot" loading={m.isLoading} />
        <Stat label="Human traffic" value={metrics?.humanRequests} icon={<User className="h-4 w-4" />} accent="human" loading={m.isLoading} />
        <Stat label="Unique IPs" value={metrics?.uniqueIps} icon={<Globe className="h-4 w-4" />} loading={m.isLoading} />
      </div>

      <Card className="mt-6 bg-surface/40 border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Bot vs Human · last {range} min</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics?.timeline ?? []}>
                <defs>
                  <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.16 155)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.78 0.16 155)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="bg2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.68 0.21 25)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.68 0.21 25)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.06)" />
                <XAxis dataKey="ts" hide />
                <YAxis tick={{ fill: "oklch(0.65 0.01 270)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.17 0.006 270)", border: "1px solid oklch(0.26 0.006 270)", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(v) => new Date(v as string).toLocaleString()}
                />
                <Area type="monotone" dataKey="humans" stroke="oklch(0.78 0.16 155)" fill="url(#hg)" strokeWidth={1.5} />
                <Area type="monotone" dataKey="bots" stroke="oklch(0.68 0.21 25)" fill="url(#bg2)" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <ListCard title="Top user-agents" rows={metrics?.topUserAgents?.slice(0, 10).map((u) => ({
          key: u.key, count: u.count, tag: u.isBot ? "bot" : "human",
        }))} />
        <ListCard title="Top IPs" rows={metrics?.topIps?.slice(0, 10).map((u) => ({ key: u.key, count: u.count }))} mono />
        <ListCard title="Top paths" rows={metrics?.topPaths?.slice(0, 10).map((u) => ({ key: u.key, count: u.count }))} mono />
        <ListCard title="Status codes" rows={metrics?.statusCodes?.slice(0, 10).map((u) => ({ key: u.key, count: u.count }))} mono />
      </div>

      <div className="mt-8 flex justify-end">
        <Link to="/app/agent" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition">
          Ask the agent about these patterns <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-4xl tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function Stat({ label, value, icon, accent, loading }: { label: string; value?: number; icon: React.ReactNode; accent?: "bot" | "human"; loading?: boolean }) {
  const color = accent === "bot" ? "text-[color:var(--bot)]" : accent === "human" ? "text-[color:var(--human)]" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-surface/40 p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs uppercase tracking-wider">{label}</span>{icon}
      </div>
      <div className={`mt-2 font-display text-3xl ${color}`}>
        {loading ? <span className="text-muted-foreground/40">—</span> : (value ?? 0).toLocaleString()}
      </div>
    </div>
  );
}

function ListCard({ title, rows, mono }: { title: string; rows?: Array<{ key: string; count: number; tag?: "bot" | "human" }>; mono?: boolean }) {
  return (
    <Card className="bg-surface/40 border-border">
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent>
        {(!rows || rows.length === 0) ? (
          <div className="text-xs text-muted-foreground py-4">No data</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <div className={`min-w-0 truncate ${mono ? "font-mono text-[12px]" : ""}`} title={r.key}>{r.key}</div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.tag && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${r.tag === "bot" ? "bg-[color:var(--bot)]/10 text-[color:var(--bot)]" : "bg-[color:var(--human)]/10 text-[color:var(--human)]"}`}>{r.tag}</span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{r.count.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyConn() {
  return (
    <div className="mt-12 rounded-xl border border-dashed border-border bg-surface/30 p-16 text-center">
      <Plug className="h-8 w-8 mx-auto text-muted-foreground" />
      <h3 className="mt-4 font-display text-2xl">No data source connected</h3>
      <p className="mt-1 text-sm text-muted-foreground">Connect your Elasticsearch cluster to start sifting.</p>
      <Link to="/app/connection"><Button className="mt-5">Connect Elasticsearch</Button></Link>
    </div>
  );
}

function DemoControls({ onChange }: { onChange: () => void }) {
  const qc = useQueryClient();
  const fnLoad = useServerFn(loadDemo);
  const fnClear = useServerFn(clearDemo);
  const load = useMutation({
    mutationFn: () => fnLoad(),
    onSuccess: (res: any) => {
      if (res?.ok) { toast.success(`Loaded ${res.written} demo events`); qc.invalidateQueries(); onChange(); }
      else toast.error(res?.error ?? "Failed to load demo");
    },
  });
  const clear = useMutation({
    mutationFn: () => fnClear(),
    onSuccess: () => { toast.success("Demo data cleared"); qc.invalidateQueries(); onChange(); },
  });
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" onClick={() => load.mutate()} disabled={load.isPending}>
        {load.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        Load demo
      </Button>
      <Button size="sm" variant="ghost" onClick={() => clear.mutate()} disabled={clear.isPending} title="Clear demo data">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
