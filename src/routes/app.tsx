import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { recentAgentActivity } from "@/lib/demo.functions";
import { Logo } from "@/components/Logo";
import { Hint } from "@/components/Hint";
import { LayoutDashboard, Bot, ShieldAlert, LogOut, Crosshair, Network, Plug2, Zap, Activity, Wrench } from "lucide-react";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

const NAV = [
  { to: "/app/onboard", label: "Activate", icon: Zap, hint: "Paste your site + Elasticsearch creds. The agent recons your routes and writes a custom detector pack." },
  { to: "/app/dashboard", label: "Live", icon: LayoutDashboard, hint: "Real-time bot vs human traffic, top user-agents, IPs, paths, and status codes." },
  { to: "/app/campaigns", label: "Campaigns", icon: Network, hint: "Bot actors clustered by behavioral fingerprint across IPs — coordinated activity surfaced as a single campaign." },
  { to: "/app/agent", label: "Agent", icon: Bot, hint: "Chat with the Gemini-powered agent. It investigates your live logs and records findings as threats." },
  { to: "/app/threats", label: "Threats", icon: ShieldAlert, hint: "Findings the agent recorded. Triage, mark blocked, or dismiss." },
  { to: "/app/honeypots", label: "Honeypots", icon: Crosshair, hint: "Trap URLs that only bots will hit. Any visitor is, by definition, automated." },
  { to: "/app/mcp", label: "MCP", icon: Plug2, hint: "Expose Chaff's bot intelligence to Claude, Cursor, ChatGPT via the MCP protocol." },
] as const;

function AppLayout() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/login" });
      else setEmail(session.user.email ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) navigate({ to: "/login" });
      else { setEmail(data.session.user.email ?? null); setChecked(true); }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  if (!checked) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">Loading…</div>;
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="w-60 shrink-0 border-r border-border/60 bg-sidebar text-sidebar-foreground flex flex-col">
        <Link to="/app/dashboard" className="flex items-center gap-2 px-5 h-14 border-b border-sidebar-border/70">
          <Logo className="h-5 w-5" withWordmark />
        </Link>
        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.to);
            return (
              <Hint key={n.to} label={n.hint} side="right">
                <Link
                  to={n.to}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
                    active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  }`}
                >
                  <n.icon className="h-4 w-4" />{n.label}
                </Link>
              </Hint>
            );
          })}
        </nav>
        <AgentActivityFeed />
        <div className="p-3 border-t border-sidebar-border/70">
          <div className="px-3 py-2 text-xs text-muted-foreground truncate">{email}</div>
          <Hint label="Sign out of your Chaff account" side="right">
            <button onClick={signOut} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </Hint>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}

function AgentActivityFeed() {
  const fn = useServerFn(recentAgentActivity);
  const q = useQuery({
    queryKey: ["agent-activity"],
    queryFn: () => fn(),
    refetchInterval: 8000,
  });
  const items = q.data?.activity ?? [];
  if (items.length === 0) return null;
  return (
    <div className="border-t border-sidebar-border/70 px-3 py-2.5">
      <div className="px-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        <Activity className="h-3 w-3" /> Agent activity
      </div>
      <Link to="/app/agent" className="block space-y-1">
        {items.slice(0, 4).map((m: any) => (
          <div key={m.id} className="px-2 py-1 rounded text-[11px] text-muted-foreground hover:bg-sidebar-accent/40 hover:text-sidebar-foreground transition">
            <div className="flex items-center gap-1.5">
              {m.role === "tool" ? <Wrench className="h-2.5 w-2.5 shrink-0" /> : <Bot className="h-2.5 w-2.5 shrink-0" />}
              <span className="truncate font-mono">
                {m.role === "tool" ? m.tool_name : (m.content?.slice(0, 60) ?? "…")}
              </span>
            </div>
          </div>
        ))}
      </Link>
    </div>
  );
}
