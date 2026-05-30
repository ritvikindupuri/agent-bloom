import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureChaffIndex, indexEvent, chaffIndex } from "./es-chaff.server";
import { esRequest, type EsAuth } from "./es.server";

// Synthetic demo data — clearly labeled. Lets a new user (or hackathon judge)
// see clustered campaigns within seconds without waiting for real traffic.

const DEMO_TAG = "__chaff_demo__";

type Persona = {
  ua: string;
  ua_family: string;
  verdict: "bot" | "human" | "suspicious";
  score: number;
  reasons: string[];
  ips: string[];
  paths: string[];
  countries: string[];
  webgl_renderer?: string;
  canvas_hash?: string;
  is_honeypot_hit?: boolean;
  signature_hash: string;
};

const PERSONAS: Persona[] = [
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
    ua_family: "HeadlessChrome",
    verdict: "bot",
    score: 92,
    reasons: ["headless_chrome", "webdriver_true", "no_mouse_entropy"],
    ips: ["185.220.101.42", "185.220.101.43", "185.220.101.44", "185.220.102.7", "185.220.102.8"],
    paths: ["/products", "/products/2", "/products/3", "/products/4", "/api/products"],
    countries: ["NL", "DE", "RO"],
    webgl_renderer: "Mesa/X.org Llvmpipe",
    canvas_hash: "a7f3...DEMO_SCRAPER",
    signature_hash: "demo:scraper:headless-mesa",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ua_family: "Chrome",
    verdict: "suspicious",
    score: 74,
    reasons: ["honeypot_hit", "credential_stuff_path", "rapid_fire"],
    ips: [
      "91.243.59.12",
      "91.243.59.13",
      "194.165.16.77",
      "194.165.16.78",
      "5.188.206.91",
      "45.143.221.44",
    ],
    paths: ["/login", "/wp-login.php", "/admin/login", "/auth/signin"],
    countries: ["RU", "RU", "BY", "RU", "RU", "RU"],
    canvas_hash: "b22c...DEMO_CRED",
    is_honeypot_hit: true,
    signature_hash: "demo:credstuff:login-burst",
  },
  {
    ua: "curl/8.4.0",
    ua_family: "curl",
    verdict: "bot",
    score: 88,
    reasons: ["curl_ua", "no_js_signals", "scanning_pattern"],
    ips: ["198.235.24.120", "198.235.24.121", "162.142.125.55"],
    paths: ["/.env", "/.git/config", "/wp-config.php.bak", "/admin/backup.sql", "/phpinfo.php"],
    countries: ["US", "US", "US"],
    is_honeypot_hit: true,
    signature_hash: "demo:scanner:env-probe",
  },
  // Humans — to make the bot signal visible by contrast
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    ua_family: "Safari",
    verdict: "human",
    score: 8,
    reasons: ["mouse_entropy_high", "consistent_screen"],
    ips: ["73.158.42.18", "108.41.205.6", "97.105.18.40", "47.144.62.10"],
    paths: ["/", "/products", "/about", "/contact", "/products/1"],
    countries: ["US", "US", "US", "US"],
    webgl_renderer: "Apple GPU",
    signature_hash: "demo:human:macos-safari",
  },
];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function loadConn(supabase: any, userId: string) {
  const { data } = await supabase
    .from("es_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return data;
}

export const loadDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const conn = await loadConn(supabase, userId);
    if (!conn)
      return {
        ok: false as const,
        error: "Connect an Elasticsearch cluster first (Connection tab).",
      };
    const auth: EsAuth = { endpoint: conn.endpoint, apiKey: conn.api_key };
    await ensureChaffIndex(auth, userId);

    const now = Date.now();
    let written = 0;

    // Write ~150 events spread over the last 60 minutes
    for (let i = 0; i < 150; i++) {
      const p = pick(PERSONAS);
      const ip = pick(p.ips);
      const country = pick(p.countries);
      const path = pick(p.paths);
      const tsOffset = randInt(0, 60 * 60 * 1000); // last hour
      const doc = {
        "@timestamp": new Date(now - tsOffset).toISOString(),
        verdict: p.verdict,
        score: p.score + randInt(-5, 5),
        reasons: p.reasons,
        signature_hash: p.signature_hash,
        ua_family: p.ua_family,
        slug: DEMO_TAG,
        is_honeypot_hit: !!p.is_honeypot_hit,
        ip,
        ip_str: ip,
        country,
        path,
        origin: "https://demo.chaff.local",
        referrer: "",
        dwell_ms: p.verdict === "human" ? randInt(8000, 60000) : randInt(50, 800),
        ua: p.ua,
        canvas_hash: p.canvas_hash,
        webgl_renderer: p.webgl_renderer,
        hardware_concurrency: p.verdict === "human" ? 8 : 2,
        device_memory: p.verdict === "human" ? 8 : 0,
        screen_w: p.verdict === "human" ? 1512 : 800,
        screen_h: p.verdict === "human" ? 982 : 600,
        mouse_moves: p.verdict === "human" ? randInt(40, 220) : 0,
        mouse_entropy: p.verdict === "human" ? Math.random() * 3 + 2 : 0,
        scrolls: p.verdict === "human" ? randInt(2, 12) : 0,
        clicks: p.verdict === "human" ? randInt(1, 6) : 0,
        raw: { demo: true },
      };
      await indexEvent(auth, userId, doc);
      written++;
    }

    // Seed bot_campaigns rows (so /app/campaigns lights up instantly)
    const botPersonas = PERSONAS.filter((p) => p.verdict !== "human");
    for (const p of botPersonas) {
      await supabase.from("bot_campaigns").upsert(
        {
          user_id: userId,
          signature_hash: p.signature_hash,
          name: `DEMO · ${p.ua_family} (${p.reasons[0]})`,
          fingerprint: {
            ua_family: p.ua_family,
            webgl_renderer: p.webgl_renderer,
            canvas_hash: p.canvas_hash,
            top_ip: p.ips[0],
            top_reasons: p.reasons,
            avg_score: p.score,
          },
          ip_count: p.ips.length,
          event_count: Math.round(150 / PERSONAS.length),
          first_seen: new Date(now - 60 * 60 * 1000).toISOString(),
          last_seen: new Date(now).toISOString(),
          status: "active",
        },
        { onConflict: "user_id,signature_hash" },
      );
    }

    // Seed two threat findings
    await supabase.from("threat_findings").insert([
      {
        user_id: userId,
        kind: "scraper",
        severity: "high",
        title: "DEMO · Headless Chrome scraper ring",
        summary:
          "Coordinated scraping from a /24 in NL/DE hitting /products/* with no mouse entropy and Mesa Llvmpipe WebGL.",
        ip: "185.220.101.42",
        user_agent: PERSONAS[0].ua,
        request_count: 60,
        evidence: { demo: true, asns: ["AS1234"], paths: PERSONAS[0].paths },
        status: "open",
        first_seen: new Date(now - 60 * 60 * 1000).toISOString(),
        last_seen: new Date(now).toISOString(),
      },
      {
        user_id: userId,
        kind: "credential-stuffing",
        severity: "critical",
        title: "DEMO · Credential stuffing wave on /login",
        summary:
          "6 IPs from RU/BY hitting /login + /wp-login.php with rapid-fire pattern; honeypot bait paths also hit.",
        ip: "91.243.59.12",
        user_agent: PERSONAS[1].ua,
        request_count: 45,
        evidence: { demo: true, countries: ["RU", "BY"], honeypot_hits: 12 },
        status: "open",
        first_seen: new Date(now - 60 * 60 * 1000).toISOString(),
        last_seen: new Date(now).toISOString(),
      },
    ]);

    return { ok: true as const, written, campaigns: botPersonas.length, threats: 2 };
  });

export const clearDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const conn = await loadConn(supabase, userId);
    let esDeleted = 0;
    if (conn) {
      const auth: EsAuth = { endpoint: conn.endpoint, apiKey: conn.api_key };
      const idx = chaffIndex(userId);
      try {
        const res: any = await esRequest(auth, `/${idx}/_delete_by_query?refresh=true`, {
          method: "POST",
          body: { query: { term: { slug: DEMO_TAG } } },
        });
        esDeleted = res?.deleted ?? 0;
      } catch (_e) {
        /* index may not exist */
      }
    }
    await supabase
      .from("bot_campaigns")
      .delete()
      .eq("user_id", userId)
      .like("signature_hash", "demo:%");
    await supabase.from("threat_findings").delete().eq("user_id", userId).like("title", "DEMO ·%");
    return { ok: true as const, esDeleted };
  });

export const recentAgentActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("agent_messages")
      .select("id, role, content, tool_name, created_at")
      .eq("user_id", userId)
      .in("role", ["assistant", "tool"])
      .order("created_at", { ascending: false })
      .limit(5);
    return { activity: data ?? [] };
  });
