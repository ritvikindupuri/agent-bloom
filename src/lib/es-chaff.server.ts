// Server-only: helpers for the dedicated chaff-events-{userId} index that we own
// inside the user's Elasticsearch cluster.
import { esRequest, esSearch, type EsAuth } from "./es.server";

export function chaffIndex(userId: string) {
  return `chaff-events-${userId.replace(/-/g, "")}`;
}

const MAPPING = {
  mappings: {
    dynamic: false as const,
    properties: {
      "@timestamp": { type: "date" },
      verdict: { type: "keyword" },
      score: { type: "integer" },
      reasons: { type: "keyword" },
      signature_hash: { type: "keyword" },
      ua_family: { type: "keyword" },
      slug: { type: "keyword" },
      is_honeypot_hit: { type: "boolean" },
      ip: { type: "ip" },
      ip_str: { type: "keyword" },
      country: { type: "keyword" },
      path: { type: "keyword" },
      origin: { type: "keyword" },
      referrer: { type: "keyword" },
      dwell_ms: { type: "integer" },
      ua: { type: "keyword" },
      canvas_hash: { type: "keyword" },
      webgl_vendor: { type: "keyword" },
      webgl_renderer: { type: "keyword" },
      hardware_concurrency: { type: "integer" },
      device_memory: { type: "integer" },
      screen_w: { type: "integer" },
      screen_h: { type: "integer" },
      mouse_moves: { type: "integer" },
      mouse_entropy: { type: "float" },
      scrolls: { type: "integer" },
      clicks: { type: "integer" },
      raw: { type: "object", enabled: false },
    },
  },
};

export async function ensureChaffIndex(auth: EsAuth, userId: string) {
  const idx = chaffIndex(userId);
  try {
    await esRequest(auth, `/${idx}`, { method: "HEAD" });
    return idx;
  } catch (_e) {
    // try create
  }
  try {
    await esRequest(auth, `/${idx}`, { method: "PUT", body: MAPPING });
  } catch (e: any) {
    // race: already exists
    if (!/resource_already_exists/.test(e?.message ?? "")) throw e;
  }
  return idx;
}

export async function indexEvent(auth: EsAuth, userId: string, doc: Record<string, any>) {
  const idx = chaffIndex(userId);
  return esRequest(auth, `/${idx}/_doc?refresh=wait_for`, { method: "POST", body: doc });
}

export async function searchEvents(auth: EsAuth, userId: string, body: unknown) {
  const idx = chaffIndex(userId);
  return esSearch(auth, idx, body);
}
