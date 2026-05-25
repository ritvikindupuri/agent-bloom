import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { saveConnection, listConnections, deleteConnection } from "@/lib/es.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Lock, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/app/connection")({
  component: ConnectionPage,
});

function ConnectionPage() {
  const qc = useQueryClient();
  const list = useServerFn(listConnections);
  const save = useServerFn(saveConnection);
  const del = useServerFn(deleteConnection);
  const q = useQuery({ queryKey: ["connections"], queryFn: () => list() });

  const [form, setForm] = useState({
    label: "Production",
    endpoint: "",
    apiKey: "",
    indexPattern: "logs-*",
    timestampField: "@timestamp",
    ipField: "client.ip",
    userAgentField: "user_agent.original",
    urlField: "url.path",
    statusField: "http.response.status_code",
  });

  const saveMut = useMutation({
    mutationFn: () => save({ data: form }),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message);
      else toast.error("Saved, but test failed: " + res.message);
      setForm((f) => ({ ...f, apiKey: "" }));
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["connections"] }); },
  });

  return (
    <div className="p-10 max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Connection</h1>
        <p className="mt-1 text-sm text-muted-foreground">Connect your Elasticsearch cluster. Credentials are encrypted at rest and only accessible to your account.</p>
      </div>

      {(q.data?.connections ?? []).length > 0 && (
        <Card className="bg-surface/40 border-border">
          <CardHeader><CardTitle className="text-base">Active connections</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {q.data!.connections.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border border-border bg-background/40 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.label}</span>
                    {c.is_active && <Badge variant="secondary" className="text-[10px]">Active</Badge>}
                    {c.last_test_ok === true && <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--human)]" />}
                    {c.last_test_ok === false && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground truncate">{c.endpoint} · {c.index_pattern}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => delMut.mutate(c.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-surface/40 border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> Add or update connection</CardTitle>
          <CardDescription>
            Use an Elasticsearch API key with at least <code className="font-mono">read</code> on your log index. Credentials never leave your encrypted backend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }} className="grid gap-4 md:grid-cols-2">
            <Field label="Label"><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required /></Field>
            <Field label="Index pattern"><Input value={form.indexPattern} onChange={(e) => setForm({ ...form, indexPattern: e.target.value })} required /></Field>
            <Field label="Endpoint URL" full>
              <Input placeholder="https://my-cluster.es.us-east-1.aws.elastic.cloud:443" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} required type="url" />
            </Field>
            <Field label="API Key (base64)" full>
              <Input placeholder="VnVhQ2ZHY0JDZGJrUW0t…" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} required type="password" />
            </Field>

            <div className="md:col-span-2 mt-2 mb-1 text-xs uppercase tracking-widest text-muted-foreground">Field mapping (ECS defaults)</div>
            <Field label="Timestamp field"><Input value={form.timestampField} onChange={(e) => setForm({ ...form, timestampField: e.target.value })} /></Field>
            <Field label="Status code field"><Input value={form.statusField} onChange={(e) => setForm({ ...form, statusField: e.target.value })} /></Field>
            <Field label="IP field"><Input value={form.ipField} onChange={(e) => setForm({ ...form, ipField: e.target.value })} /></Field>
            <Field label="User-agent field"><Input value={form.userAgentField} onChange={(e) => setForm({ ...form, userAgentField: e.target.value })} /></Field>
            <Field label="URL path field" full><Input value={form.urlField} onChange={(e) => setForm({ ...form, urlField: e.target.value })} /></Field>

            <div className="md:col-span-2 flex justify-end gap-2 mt-2">
              <Button type="submit" disabled={saveMut.isPending}>
                {saveMut.isPending ? "Testing & saving…" : "Test & save connection"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
