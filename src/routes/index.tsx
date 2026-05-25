import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { ArrowRight, Bot, Database, Sparkles, Shield, Activity } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 text-foreground">
            <Logo className="h-5 w-5" withWordmark />
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link to="/login" className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground transition">Sign in</Link>
            <Link to="/login" className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90 transition">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
          <div className="relative mx-auto max-w-4xl px-6 pt-24 pb-28 text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Powered by Gemini · Elasticsearch native
            </div>
            <h1 className="font-display text-6xl leading-[1.05] tracking-tight md:text-7xl">
              Separate the wheat<br />
              <span className="italic text-muted-foreground">from the chaff.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
              Chaff is an autonomous agent that hunts bots in your real Elasticsearch traffic logs.
              It investigates, finds evidence, and tells you exactly who to block.
            </p>
            <div className="mt-10 flex items-center justify-center gap-3">
              <Link to="/login" className="group inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition">
                Launch console <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <a href="#how" className="rounded-md border border-border bg-surface/40 px-5 py-2.5 text-sm hover:bg-surface transition">
                How it works
              </a>
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-border/60 bg-surface/30">
          <div className="mx-auto grid max-w-6xl gap-px bg-border/60 px-0 md:grid-cols-3">
            {[
              { icon: Database, title: "Connect your logs", body: "Bring your Elasticsearch endpoint and API key. Credentials stay encrypted and isolated to your account." },
              { icon: Bot, title: "Ask the agent", body: "Gemini calls real tools — search, aggregate, sample — to investigate your traffic. No hallucinated numbers." },
              { icon: Shield, title: "Act on evidence", body: "Recorded threats include the offending IPs, user-agents, and request counts. Review, dismiss, or mark blocked." },
            ].map((f) => (
              <div key={f.title} className="bg-background p-8">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 font-display text-xl">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border/60">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:grid-cols-2 md:items-center">
            <div>
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
                <Sparkles className="h-3 w-3" /> What it does
              </div>
              <h2 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">An analyst that actually does the work.</h2>
              <p className="mt-4 text-muted-foreground">
                Most bot detection stops at a dashboard. Chaff goes further: the agent reasons over your real
                logs, runs aggregations, samples suspicious sessions, and writes a verdict with citations.
              </p>
              <ul className="mt-6 space-y-2 text-sm">
                <li className="flex items-start gap-2"><Activity className="mt-0.5 h-4 w-4 text-primary" /> Live human-vs-bot timeline from your index</li>
                <li className="flex items-start gap-2"><Activity className="mt-0.5 h-4 w-4 text-primary" /> User-agent fingerprinting (scrapers, headless browsers, libraries)</li>
                <li className="flex items-start gap-2"><Activity className="mt-0.5 h-4 w-4 text-primary" /> Per-IP investigation with evidence trails</li>
                <li className="flex items-start gap-2"><Activity className="mt-0.5 h-4 w-4 text-primary" /> Persistent threat log you can triage</li>
              </ul>
            </div>
            <div className="relative">
              <div className="rounded-2xl border border-border bg-surface/50 p-1 shadow-2xl">
                <div className="rounded-xl border border-border/60 bg-background p-5 font-mono text-[12px] leading-6">
                  <div className="text-muted-foreground">{">"} chaff: investigate spike at 14:02 UTC</div>
                  <div className="mt-1 text-primary">→ search_logs (range=30m, agg=top_ips)</div>
                  <div className="text-muted-foreground">  185.220.101.45 — 12,408 reqs</div>
                  <div className="text-primary">→ search_logs (agg=ip_user_agents, ip=185.220…)</div>
                  <div className="text-muted-foreground">  python-requests/2.31 — 12,201</div>
                  <div className="text-primary">→ record_threat (severity=high)</div>
                  <div className="mt-2 text-foreground">
                    <span className="text-[color:var(--bot)]">●</span> Confirmed scraper. Hitting <code>/api/products</code> at 6.9 req/s with no session cookie.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 bg-surface/30">
          <div className="mx-auto max-w-4xl px-6 py-24 text-center">
            <h2 className="font-display text-4xl tracking-tight md:text-5xl">Ready to sift?</h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Connect your Elasticsearch in 30 seconds. Chaff does the rest.
            </p>
            <Link to="/login" className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><Logo className="h-4 w-4" /> Chaff</div>
          <div>Built for the Building Agents for Real-World Challenges hackathon.</div>
        </div>
      </footer>
    </div>
  );
}
