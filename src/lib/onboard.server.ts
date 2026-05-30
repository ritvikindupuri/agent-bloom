// Server-only helpers for the onboarding scan.
import Firecrawl from "@mendable/firecrawl-js";

export type StackId =
  | "wordpress"
  | "shopify"
  | "nextjs"
  | "react-spa"
  | "webflow"
  | "wix"
  | "squarespace"
  | "laravel"
  | "rails"
  | "django"
  | "static";

export type StackInfo = {
  id: StackId;
  label: string;
  installLocation: string; // human-readable where-to-paste
  baitPaths: string[]; // attack-surface paths bots commonly probe for this stack
};

const STACKS: Record<StackId, Omit<StackInfo, "id">> = {
  wordpress: {
    label: "WordPress",
    installLocation: "Paste in your active theme's footer.php just before </body>, or use a header/footer plugin.",
    baitPaths: [
      "/wp-admin/setup-config.php",
      "/wp-content/backup-db/",
      "/wp-content/uploads/.env",
      "/xmlrpc.php?rsd",
      "/wp-config.php.bak",
      "/.git/config",
    ],
  },
  shopify: {
    label: "Shopify",
    installLocation: "Online Store → Themes → Edit code → layout/theme.liquid, paste before </body>.",
    baitPaths: [
      "/admin/orders.json",
      "/admin/products.json?debug=1",
      "/cart.json?internal=1",
      "/.env",
      "/admin/api/2024-01/shop.json",
    ],
  },
  nextjs: {
    label: "Next.js",
    installLocation: "Add to app/layout.tsx (App Router) or pages/_app.tsx (Pages Router) inside the <body>.",
    baitPaths: [
      "/api/admin",
      "/api/internal/debug",
      "/.env.local",
      "/_next/static/.well-known/secret",
      "/api/v1/users?role=admin",
    ],
  },
  "react-spa": {
    label: "React SPA",
    installLocation:
      "Paste into public/index.html (or root index.html for Vite) just before </body>. Do NOT paste into a .jsx/.tsx component — React ignores inline <script> tags rendered via JSX.",
    baitPaths: [
      "/.env",
      "/config.js.bak",
      "/admin",
      "/api/internal",
      "/.git/HEAD",
    ],
  },
  webflow: {
    label: "Webflow",
    installLocation: "Project Settings → Custom Code → Footer Code.",
    baitPaths: ["/.env", "/admin", "/wp-login.php", "/.git/config"],
  },
  wix: {
    label: "Wix",
    installLocation: "Settings → Custom Code → Add to body end on all pages.",
    baitPaths: ["/.env", "/admin", "/wp-login.php"],
  },
  squarespace: {
    label: "Squarespace",
    installLocation: "Settings → Advanced → Code Injection → Footer.",
    baitPaths: ["/.env", "/admin", "/wp-login.php"],
  },
  laravel: {
    label: "Laravel",
    installLocation: "Add to resources/views/layouts/app.blade.php before </body>.",
    baitPaths: [
      "/.env",
      "/storage/logs/laravel.log",
      "/telescope/requests",
      "/horizon/dashboard",
      "/.git/config",
    ],
  },
  rails: {
    label: "Ruby on Rails",
    installLocation: "Add to app/views/layouts/application.html.erb before </body>.",
    baitPaths: [
      "/rails/info/routes",
      "/rails/db",
      "/.env",
      "/config/database.yml",
      "/secrets.yml",
    ],
  },
  django: {
    label: "Django",
    installLocation: "Add to your base template (templates/base.html) before </body>.",
    baitPaths: [
      "/admin/",
      "/.env",
      "/settings.py",
      "/static/admin/",
      "/api/v1/users?is_staff=true",
    ],
  },
  static: {
    label: "Static HTML",
    installLocation: "Paste into every page's <body>, just before </body>.",
    baitPaths: ["/.env", "/.git/config", "/admin", "/backup.zip", "/sitemap-old.xml"],
  },
};

export function detectStack(html: string, headers: Record<string, string> = {}, sourceURL?: string): StackId {
  const h = html || "";
  const lower = h.toLowerCase();
  const serverHeader = (headers["server"] || headers["Server"] || "").toLowerCase();
  const poweredBy = (headers["x-powered-by"] || headers["X-Powered-By"] || "").toLowerCase();

  if (lower.includes("/wp-content/") || lower.includes("wp-includes") || /<meta[^>]+generator[^>]+wordpress/i.test(h)) return "wordpress";
  if (lower.includes("cdn.shopify.com") || lower.includes("shopify.shop") || lower.includes('"shopify"')) return "shopify";
  if (lower.includes("__next_data__") || lower.includes("/_next/static")) return "nextjs";
  if (lower.includes("webflow.com") || lower.includes("data-wf-")) return "webflow";
  if (lower.includes("static.wixstatic.com") || lower.includes("wix-warmup-data")) return "wix";
  if (lower.includes("static1.squarespace.com") || lower.includes("squarespace-cdn")) return "squarespace";
  if (poweredBy.includes("laravel") || lower.includes("/vendor/laravel") || lower.includes('name="csrf-token"')) return "laravel";
  if (serverHeader.includes("phusion passenger") || lower.includes("ruby on rails") || lower.includes('name="csrf-param"')) return "rails";
  if (lower.includes("csrfmiddlewaretoken") || lower.includes("django")) return "django";
  if (lower.includes('id="root"') || lower.includes('id="app"') || /<script[^>]+src=["'][^"']*assets\/index-[\w-]+\.js/.test(h)) return "react-spa";
  return "static";
}

export function stackInfo(id: StackId): StackInfo {
  return { id, ...STACKS[id] };
}

export type ScanResult = {
  ok: true;
  url: string;
  title: string | null;
  description: string | null;
  stack: StackInfo;
  beaconDetected: boolean;
  pageCount: number;
  suspectedSurface: { path: string; reason: string }[];
};

function firecrawl() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");
  return new Firecrawl({ apiKey });
}

export async function scanUrl(rawUrl: string, expectedSlug?: string): Promise<ScanResult> {
  const url = normalizeUrl(rawUrl);
  const fc = firecrawl();
  const result: any = await fc.scrape(url, {
    formats: ["html", "links"],
    onlyMainContent: false,
    waitFor: 1500,
  });

  const html: string = result?.html ?? result?.data?.html ?? "";
  const metadata = result?.metadata ?? result?.data?.metadata ?? {};
  const links: string[] = result?.links ?? result?.data?.links ?? [];

  const stackId = detectStack(html, metadata.headers ?? {}, url);
  const stack = stackInfo(stackId);

  const beaconDetected = expectedSlug
    ? html.includes(expectedSlug) && /beacon\.js/i.test(html)
    : false;

  // Lightweight attack-surface heuristics from links we already have
  const suspectedSurface: { path: string; reason: string }[] = [];
  for (const link of links.slice(0, 200)) {
    try {
      const u = new URL(link);
      const p = u.pathname.toLowerCase();
      if (p.includes("/admin") && !suspectedSurface.find((s) => s.path === u.pathname))
        suspectedSurface.push({ path: u.pathname, reason: "Admin path exposed in HTML — bots will probe variants" });
      if (p.includes("/login") && !suspectedSurface.find((s) => s.path === u.pathname))
        suspectedSurface.push({ path: u.pathname, reason: "Login endpoint — credential stuffing target" });
      if (p.includes("/api/") && !suspectedSurface.find((s) => s.path === u.pathname))
        suspectedSurface.push({ path: u.pathname, reason: "API surface exposed — scrape & enumeration target" });
    } catch {
      /* ignore */
    }
    if (suspectedSurface.length >= 6) break;
  }

  return {
    ok: true,
    url,
    title: metadata.title ?? null,
    description: metadata.description ?? null,
    stack,
    beaconDetected,
    pageCount: links.length,
    suspectedSurface,
  };
}

function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}
