import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { ArrowRight, Bot, Database, Sparkles, Shield, Activity, Globe } from "lucide-react";

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
            <h1 className="font-display text-6xl leading-[1.05] tracking-tight md:text-7xl">
              Every bot leaves<br />
              <span className="italic text-muted-foreground">chaff behind.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
              Paste your URL and connect Elasticsearch. Our agent reads your site, writes a bot-detection pack tailored to your exact routes, and starts hunting. No snippet. No install.
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
              { icon: Globe, title: "Paste your URL", body: "Firecrawl scans your site — detects your stack, login pages, API surface, and admin paths. Recon, not guesswork." },
              { icon: Database, title: "Connect Elasticsearch", body: "We sample one log document and auto-map the schema. No field-picking, no manual config. ECS or custom — it just works." },
              { icon: Shield, title: "Get a custom detector pack", body: "The agent writes 4–6 ES rules tailored to YOUR routes — credential stuffing on your real login, scraping on your real APIs. Live in 30 seconds." },
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
            <h2 className="font-display text-4xl tracking-tight md:text-5xl">Two inputs. No install. Built for security teams.</h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Every other tool ships generic bot rules. Chaff reads your site first, then writes detection rules that target your actual attack surface.
            </p>
            <Link to="/login" className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition">
              Activate Chaff <ArrowRight className="h-4 w-4" />
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
