import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  listConversations,
  getConversation,
  sendAgentMessage,
  deleteConversation,
} from "@/lib/agent.functions";
import { listConnections } from "@/lib/es.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import { Bot, Send, Trash2, Plus, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/agent")({
  component: AgentPage,
});

const SUGGESTIONS = [
  "What does my traffic look like in the last hour?",
  "Find the most suspicious IPs from today.",
  "Are any clients masquerading as Googlebot?",
  "Investigate any unusual spikes in the last 24h.",
];

function AgentPage() {
  const qc = useQueryClient();
  const fnList = useServerFn(listConversations);
  const fnGet = useServerFn(getConversation);
  const fnSend = useServerFn(sendAgentMessage);
  const fnDel = useServerFn(deleteConversation);
  const fnConn = useServerFn(listConnections);

  const conns = useQuery({ queryKey: ["connections"], queryFn: () => fnConn() });
  const hasConn = (conns.data?.connections?.length ?? 0) > 0;

  const convs = useQuery({ queryKey: ["agent-convs"], queryFn: () => fnList() });
  const [activeId, setActiveId] = useState<string | null>(null);
  const msgs = useQuery({
    queryKey: ["agent-msgs", activeId],
    queryFn: () => fnGet({ data: { id: activeId! } }),
    enabled: !!activeId,
  });

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = useMutation({
    mutationFn: (text: string) =>
      fnSend({ data: { conversationId: activeId ?? undefined, message: text } }),
    onSuccess: (r) => {
      setActiveId(r.conversationId);
      qc.invalidateQueries({ queryKey: ["agent-convs"] });
      qc.invalidateQueries({ queryKey: ["agent-msgs", r.conversationId] });
      qc.invalidateQueries({ queryKey: ["threats"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Agent failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => fnDel({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-convs"] });
      setActiveId(null);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.data, send.isPending]);

  const submit = (text: string) => {
    if (!text.trim() || send.isPending) return;
    setInput("");
    send.mutate(text.trim());
  };

  if (!hasConn && !conns.isLoading) {
    return (
      <div className="p-10">
        <h1 className="font-display text-4xl tracking-tight">Agent</h1>
        <div className="mt-12 rounded-xl border border-dashed border-border bg-surface/30 p-16 text-center">
          <Bot className="h-8 w-8 mx-auto text-muted-foreground" />
          <h3 className="mt-4 font-display text-2xl">Agent needs your logs</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Activate Chaff first so the agent has something to investigate.
          </p>
          <Link to="/app/onboard">
            <Button className="mt-5">Activate Chaff</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <aside className="w-64 shrink-0 border-r border-border/60 bg-surface/30 flex flex-col">
        <div className="p-3 border-b border-border/60">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start bg-background/40"
            onClick={() => setActiveId(null)}
          >
            <Plus className="h-4 w-4 mr-2" /> New investigation
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {(convs.data?.conversations ?? []).map((c) => (
            <div key={c.id} className="group relative">
              <button
                onClick={() => setActiveId(c.id)}
                className={`w-full text-left rounded-md px-3 py-2 text-sm truncate transition ${activeId === c.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`}
              >
                {c.title}
              </button>
              <button
                onClick={() => del.mutate(c.id)}
                className="absolute right-2 top-2 hidden group-hover:block text-muted-foreground hover:text-destructive"
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {(convs.data?.conversations ?? []).length === 0 && (
            <div className="text-xs text-muted-foreground px-3 py-4">No investigations yet.</div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-14 px-6 border-b border-border/60 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-display text-lg">Chaff Agent</span>
          <span className="text-xs text-muted-foreground">
            · Gemini · live tools over your index
          </span>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl px-6 py-8 space-y-5">
            {!activeId && (msgs.data?.messages?.length ?? 0) === 0 && <Welcome onPick={submit} />}
            {(msgs.data?.messages ?? []).map((m: any) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {send.isPending && <Thinking />}
          </div>
        </div>

        <div className="border-t border-border/60 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="mx-auto max-w-3xl flex items-end gap-2 rounded-xl border border-border bg-surface/60 p-2 focus-within:border-ring transition"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              placeholder="Ask the agent to investigate your traffic…"
              rows={1}
              className="resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 min-h-[40px] max-h-40"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || send.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Welcome({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="text-center py-10">
      <Bot className="h-10 w-10 mx-auto text-primary" />
      <h2 className="mt-4 font-display text-3xl">What should we sift today?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Try one of these, or ask anything about your logs.
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-left rounded-lg border border-border bg-surface/40 px-4 py-3 text-sm hover:border-ring transition"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: any }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-xl bg-primary/15 border border-primary/30 px-4 py-2.5 text-sm text-foreground">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.role === "tool") {
    const r = message.tool_result;
    return (
      <details className="rounded-lg border border-border bg-surface/30 text-xs">
        <summary className="cursor-pointer select-none flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground">
          <Wrench className="h-3 w-3" /> tool:{" "}
          <code className="font-mono">{message.tool_name}</code>
          {r?.error && <span className="text-destructive">(error)</span>}
          {r?.recorded && <span className="text-primary">→ threat recorded</span>}
        </summary>
        <pre className="px-3 pb-3 overflow-auto font-mono text-[11px] text-muted-foreground max-h-64">
          {JSON.stringify(r, null, 2)}
        </pre>
      </details>
    );
  }
  if (message.role === "assistant") {
    if (!message.content) return null;
    return (
      <div className="flex gap-3">
        <div className="h-7 w-7 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="h-4 w-4" />
        </div>
        <div
          className="prose prose-invert prose-sm max-w-none flex-1
          prose-headings:font-display prose-headings:tracking-tight
          prose-p:my-2 prose-code:font-mono prose-code:bg-surface prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-surface prose-pre:border prose-pre:border-border
          prose-a:text-primary"
        >
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      </div>
    );
  }
  return null;
}

function Thinking() {
  return (
    <div className="flex gap-3 items-center text-muted-foreground text-sm">
      <div className="h-7 w-7 rounded-md bg-primary/15 text-primary flex items-center justify-center">
        <Bot className="h-4 w-4 animate-pulse" />
      </div>
      <span className="inline-flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:240ms]" />
      </span>
      <span>investigating…</span>
    </div>
  );
}
