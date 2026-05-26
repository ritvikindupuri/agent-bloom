// Pure scoring engine — isomorphic, no deps. Takes a beacon payload and returns a verdict.
import { classifyUA } from "./bot-detect";

export type Verdict = "human" | "suspect" | "bot" | "certified_bot";

export type BeaconSignals = {
  slug?: string | null;
  origin?: string;
  path?: string;
  referrer?: string | null;
  dwell_ms?: number;
  reason?: string;
  navigator?: {
    ua?: string;
    platform?: string;
    languages?: string[];
    hardwareConcurrency?: number;
    deviceMemory?: number;
    webdriver?: boolean;
    plugins?: number;
    pdfViewerEnabled?: boolean;
    hasChrome?: boolean;
  };
  screen?: { w?: number; h?: number; avail_w?: number; avail_h?: number; dpr?: number; color_depth?: number };
  tz?: { name?: string; offset?: number };
  canvas_hash?: string;
  webgl_vendor?: string;
  webgl_renderer?: string;
  behavior?: {
    mouse_moves?: number;
    mouse_entropy?: number;
    clicks?: number;
    scrolls?: number;
    max_scroll?: number;
    key_count?: number;
    key_intervals?: number[];
  };
};

export type FingerprintResult = {
  verdict: Verdict;
  score: number; // 0 (human) → 100 (certified bot)
  reasons: string[];
  signature_hash: string; // stable per cluster
  ua_family: string;
  is_honeypot_hit: boolean;
};

// FNV-1a 32-bit
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}

function uaFamily(ua: string): string {
  if (!ua) return "unknown";
  if (/HeadlessChrome/i.test(ua)) return "HeadlessChrome";
  if (/Chrome\/(\d+)/i.test(ua)) return "Chrome/" + RegExp.$1;
  if (/Firefox\/(\d+)/i.test(ua)) return "Firefox/" + RegExp.$1;
  if (/Safari\/(\d+)/i.test(ua) && !/Chrome/.test(ua)) return "Safari";
  if (/python-requests/i.test(ua)) return "python-requests";
  if (/curl/i.test(ua)) return "curl";
  if (/go-http-client/i.test(ua)) return "go-http";
  if (/node-fetch|axios/i.test(ua)) return "node-fetch";
  if (/bot|crawler|spider/i.test(ua)) return "bot/crawler";
  return ua.split(/[ /]/)[0]?.slice(0, 40) || "unknown";
}

export function scoreBeacon(s: BeaconSignals, opts: { honeypot: boolean }): FingerprintResult {
  const reasons: string[] = [];
  let score = 0;
  const ua = s.navigator?.ua ?? "";
  const fam = uaFamily(ua);

  if (opts.honeypot) {
    reasons.push("hit a honeypot URL");
    score += 100;
  }
  if (s.navigator?.webdriver) {
    reasons.push("navigator.webdriver = true");
    score += 60;
  }
  if (/HeadlessChrome/i.test(ua)) {
    reasons.push("UA contains HeadlessChrome");
    score += 50;
  }
  if (s.navigator && s.navigator.hasChrome === false && /Chrome/.test(ua)) {
    reasons.push("missing window.chrome despite Chrome UA");
    score += 35;
  }
  if (s.navigator && (s.navigator.plugins ?? 0) === 0 && /Chrome|Firefox|Safari/.test(ua)) {
    reasons.push("zero plugins on browser UA");
    score += 15;
  }
  if (!s.canvas_hash || s.canvas_hash === "blocked") {
    reasons.push("canvas blocked / null");
    score += 20;
  }
  if (s.webgl_renderer && /SwiftShader|llvmpipe|Mesa OffScreen/i.test(s.webgl_renderer)) {
    reasons.push("software WebGL renderer (" + s.webgl_renderer + ")");
    score += 40;
  }
  const b = s.behavior ?? {};
  const dwell = s.dwell_ms ?? 0;
  if (dwell > 2500 && (b.mouse_moves ?? 0) === 0 && (b.scrolls ?? 0) === 0) {
    reasons.push("no mouse/scroll after " + dwell + "ms");
    score += 30;
  }
  if ((b.mouse_moves ?? 0) > 8 && (b.mouse_entropy ?? 0) < 0.05) {
    reasons.push("mouse path too straight (entropy " + (b.mouse_entropy ?? 0) + ")");
    score += 25;
  }
  if (s.screen && (s.screen.w ?? 0) > 0 && s.screen.w === s.screen.avail_w && s.screen.h === s.screen.avail_h && s.screen.dpr === 1) {
    // headless default viewport
    if (s.screen.w === 800 || s.screen.w === 1024 || s.screen.w === 1920) {
      // common headless defaults; only a mild signal
      reasons.push("exact default headless viewport " + s.screen.w + "x" + s.screen.h);
      score += 8;
    }
  }
  const uaC = classifyUA(ua);
  if (uaC.isBot && uaC.category === "bad-bot") {
    reasons.push("UA matches " + (uaC.reason ?? "bot pattern"));
    score += 35;
  } else if (uaC.isBot && uaC.category === "good-bot") {
    reasons.push("declared good-bot (" + (uaC.reason ?? "") + ")");
    score += 5;
  }

  score = Math.max(0, Math.min(100, score));
  const verdict: Verdict =
    score >= 95 ? "certified_bot" :
    score >= 60 ? "bot" :
    score >= 30 ? "suspect" :
    "human";

  // Stable cluster signature (drop UA version noise, focus on render/device fingerprint)
  const sigInput = [
    fam,
    s.canvas_hash ?? "",
    s.webgl_renderer ?? "",
    s.webgl_vendor ?? "",
    String(s.navigator?.hardwareConcurrency ?? ""),
    String(s.navigator?.deviceMemory ?? ""),
    String(s.screen?.w ?? "") + "x" + String(s.screen?.h ?? ""),
    String(s.navigator?.webdriver ? 1 : 0),
  ].join("|");

  return {
    verdict,
    score,
    reasons,
    signature_hash: fnv1a(sigInput),
    ua_family: fam,
    is_honeypot_hit: opts.honeypot,
  };
}
