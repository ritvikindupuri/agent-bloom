import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listHoneypots, createHoneypot, deleteHoneypot } from "@/lib/honeypots.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Copy, Trash2, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/honeypots")({ component: HoneypotsPage });

function HoneypotsPage() {
  const fnList = useServerFn(listHoneypots);
  const fnCreate = useServerFn(createHoneypot);
  const fnDelete = useServerFn(deleteHoneypot);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["honeypots"], queryFn: () => fnList() });
  const [label, setLabel] = useState("");

  const mCreate = useMutation({
    mutationFn: () => fnCreate({ data: { label: label || "Trap" } }),
    onSuccess: () => { setLabel(""); qc.invalidateQueries({ queryKey: ["honeypots"] }); toast.success("Honeypot created"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDelete = useMutation({
    mutationFn: (id: string) => fnDelete({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["honeypots"] }),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="p-10 max-w-5xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Honeypots</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Trap URLs that look like real pages. Any visitor is, by definition, a bot — Chaff captures their fingerprint live.
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        <Input placeholder="Label (e.g. fake-pricing)" value={label} onChange={(e) => setLabel(e.target.value)} className="max-w-xs" />
        <Button onClick={() => mCreate.mutate()} disabled={mCreate.isPending}><Plus className="h-4 w-4 mr-1" />New trap</Button>
      </div>

      <div className="mt-8 rounded-lg border border-border bg-surface/40 divide-y divide-border">
        {q.data?.honeypots?.length ? q.data.honeypots.map((h: any) => {
          const trapUrl = `${origin}/trap/${h.slug}`;
          const embed = `<script>window.__chaff_slug="${h.slug}"</script>\n<script async src="${origin}/beacon.js"></script>`;
          return (
            <div key={h.id} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{h.label}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{h.slug}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{h.hit_count} hits</span>
                  <a href={trapUrl} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Open</a>
                  <button onClick={() => mDelete.mutate(h.id)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <CopyField label="Trap URL" value={trapUrl} />
                <CopyField label="Embed on your own pages" value={embed} multi />
              </div>
            </div>
          );
        }) : (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {q.isLoading ? "Loading…" : "No honeypots yet. Create one above."}
          </div>
        )}
      </div>
    </div>
  );
}

function CopyField({ label, value, multi }: { label: string; value: string; multi?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="flex gap-1.5">
        <code className={`flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono ${multi ? "whitespace-pre" : "truncate"}`}>{value}</code>
        <button onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }} className="rounded-md border border-border px-2 hover:bg-accent">
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
