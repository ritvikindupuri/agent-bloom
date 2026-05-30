import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import {
  ArrowRight,
  Database,
  Sparkles,
  Shield,
  Activity,
  Globe,
  RefreshCw,
  ShieldCheck,
  Download,
} from "lucide-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
};

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const viewportOnce = { once: true, amount: 0.25 } as const;

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
            <Link
              to="/login"
              className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground transition"
            >
              Sign in
            </Link>
            <Link
              to="/login"
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90 transition"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
            className="relative mx-auto max-w-4xl px-6 pt-24 pb-28 text-center"
          >
            <motion.h1
              variants={fadeUp}
              className="font-display text-6xl leading-[1.05] tracking-tight md:text-7xl"
            >
              Every bot leaves
              <br />
              <span className="italic text-muted-foreground">chaff behind.</span>
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mx-auto mt-6 max-w-md text-base text-muted-foreground md:text-lg"
            >
              An agent that reads your site, writes detection tailored to your routes, and hunts
              continuously.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-10 flex items-center justify-center gap-3">
              <Link
                to="/login"
                className="group inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
              >
                Launch console{" "}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#how"
                className="rounded-md border border-border bg-surface/40 px-5 py-2.5 text-sm hover:bg-surface transition"
              >
                How it works
              </a>
            </motion.div>
          </motion.div>
        </section>

        <section id="how" className="border-t border-border/60 bg-surface/30">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={viewportOnce}
            variants={stagger}
            className="mx-auto grid max-w-6xl gap-px bg-border/60 px-0 md:grid-cols-3"
          >
            {[
              {
                icon: Globe,
                title: "Paste your URL",
                body: "Firecrawl scans your site — detects your stack, login pages, API surface, and admin paths. Recon, not guesswork.",
              },
              {
                icon: Database,
                title: "Connect Elasticsearch",
                body: "We sample one log document and auto-map the schema. No field-picking, no manual config. ECS or custom — it just works.",
              },
              {
                icon: Shield,
                title: "Get a custom detector pack",
                body: "The agent writes 4–6 ES rules tailored to YOUR routes — credential stuffing on your real login, scraping on your real APIs. Live in 30 seconds.",
              },
            ].map((f) => (
              <motion.div key={f.title} variants={fadeUp} className="bg-background p-8">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 font-display text-xl">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section className="border-t border-border/60">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 md:grid-cols-2 md:items-center">
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={viewportOnce}
              variants={stagger}
            >
              <motion.div
                variants={fadeUp}
                className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"
              >
                <Sparkles className="h-3 w-3" /> What it does
              </motion.div>
              <motion.h2
                variants={fadeUp}
                className="mt-3 font-display text-4xl tracking-tight md:text-5xl"
              >
                An analyst that actually does the work.
              </motion.h2>
              <motion.p variants={fadeUp} className="mt-4 text-muted-foreground">
                Most bot detection stops at a dashboard. Chaff goes further: the agent reasons over
                your real logs, runs aggregations, samples suspicious sessions, and writes a verdict
                with citations.
              </motion.p>
              <motion.ul variants={stagger} className="mt-6 space-y-2 text-sm">
                {[
                  "Live human-vs-bot timeline from your index",
                  "User-agent fingerprinting (scrapers, headless browsers, libraries)",
                  "Per-IP investigation with evidence trails",
                  "Persistent threat log you can triage",
                ].map((t) => (
                  <motion.li key={t} variants={fadeUp} className="flex items-start gap-2">
                    <Activity className="mt-0.5 h-4 w-4 text-primary" /> {t}
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={viewportOnce}
              transition={{ duration: 0.8, ease }}
              className="relative"
            >
              <div className="rounded-2xl border border-border bg-surface/50 p-1 shadow-2xl">
                <div className="rounded-xl border border-border/60 bg-background p-5 font-mono text-[12px] leading-6">
                  <TraceLine delay={0.2} className="text-muted-foreground">
                    {">"} chaff: investigate spike at 14:02 UTC
                  </TraceLine>
                  <TraceLine delay={0.5} className="mt-1 text-primary">
                    → search_logs (range=30m, agg=top_ips)
                  </TraceLine>
                  <TraceLine delay={0.8} className="text-muted-foreground">
                    {" "}
                    185.220.101.45 — 12,408 reqs
                  </TraceLine>
                  <TraceLine delay={1.1} className="text-primary">
                    → search_logs (agg=ip_user_agents, ip=185.220…)
                  </TraceLine>
                  <TraceLine delay={1.4} className="text-muted-foreground">
                    {" "}
                    python-requests/2.31 — 12,201
                  </TraceLine>
                  <TraceLine delay={1.7} className="text-primary">
                    → record_threat (severity=high)
                  </TraceLine>
                  <TraceLine delay={2.0} className="mt-2 text-foreground">
                    <span className="text-[color:var(--bot)]">●</span> Confirmed scraper. Hitting{" "}
                    <code>/api/products</code> at 6.9 req/s with no session cookie.
                  </TraceLine>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="border-t border-border/60">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={viewportOnce}
              variants={stagger}
              className="text-center"
            >
              <motion.div
                variants={fadeUp}
                className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"
              >
                <Shield className="h-3 w-3" /> Why teams pick Chaff
              </motion.div>
              <motion.h2
                variants={fadeUp}
                className="mt-3 font-display text-4xl tracking-tight md:text-5xl"
              >
                Built to deploy, not just to demo.
              </motion.h2>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="show"
              viewport={viewportOnce}
              variants={stagger}
              className="mt-12 grid gap-6 md:grid-cols-3"
            >
              {[
                {
                  icon: RefreshCw,
                  title: "Continuous monitoring",
                  body: "An hourly worker re-runs your detector pack against the last 24h, refreshes offender intel, and opens new findings — no dashboard-watching required.",
                },
                {
                  icon: ShieldCheck,
                  title: "Zero false-positive bots",
                  body: "Forward-confirmed reverse-DNS allowlists Googlebot, Bingbot, Applebot and friends. AbuseIPDB scores every offender so you never page on a legit crawler.",
                },
                {
                  icon: Download,
                  title: "Deployable mitigations",
                  body: "Export high-confidence offenders as nginx, Cloudflare WAF, or iptables rules. From detection to deny-list in two clicks.",
                },
              ].map((f) => (
                <motion.div
                  key={f.title}
                  variants={fadeUp}
                  whileHover={{ y: -4, transition: { duration: 0.25, ease } }}
                  className="rounded-xl border border-border bg-surface/40 p-6"
                >
                  <f.icon className="h-5 w-5 text-primary" />
                  <h3 className="mt-4 font-display text-lg">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        <section className="border-t border-border/60 bg-surface/30">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={viewportOnce}
            variants={stagger}
            className="mx-auto max-w-4xl px-6 py-24 text-center"
          >
            <motion.h2
              variants={fadeUp}
              className="font-display text-4xl tracking-tight md:text-5xl"
            >
              Two inputs. No install. Built for security teams.
            </motion.h2>
            <motion.p variants={fadeUp} className="mx-auto mt-3 max-w-md text-muted-foreground">
              Every other tool ships generic bot rules. Chaff reads your site first, then writes
              detection rules that target your actual attack surface — and keeps them tuned.
            </motion.p>
            <motion.div variants={fadeUp}>
              <Link
                to="/login"
                className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
              >
                Activate Chaff <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Logo className="h-4 w-4" /> Chaff
          </div>
          <div>Built for the Building Agents for Real-World Challenges hackathon.</div>
        </div>
      </footer>
    </div>
  );
}

function TraceLine({
  children,
  delay,
  className,
}: {
  children: React.ReactNode;
  delay: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: -6 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={viewportOnce}
      transition={{ duration: 0.4, ease, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
