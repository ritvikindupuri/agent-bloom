import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { LayoutDashboard, Bot, ShieldAlert, Plug, LogOut } from "lucide-react";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

const NAV = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/agent", label: "Agent", icon: Bot },
  { to: "/app/threats", label: "Threats", icon: ShieldAlert },
  { to: "/app/connection", label: "Connection", icon: Plug },
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
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                }`}
              >
                <n.icon className="h-4 w-4" />{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border/70">
          <div className="px-3 py-2 text-xs text-muted-foreground truncate">{email}</div>
          <button onClick={signOut} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
