// Server-only Elasticsearch client. Uses fetch + ApiKey auth. Cloudflare Workers compatible.

export type EsAuth = {
  endpoint: string;
  apiKey: string;
};

function normalizeEndpoint(ep: string) {
  return ep.replace(/\/+$/, "");
}

export async function esRequest<T = unknown>(
  auth: EsAuth,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const url = `${normalizeEndpoint(auth.endpoint)}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      Authorization: `ApiKey ${auth.apiKey}`,
      Accept: "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const msg =
      typeof parsed === "object" && parsed && "error" in (parsed as any)
        ? JSON.stringify((parsed as any).error)
        : text || res.statusText;
    throw new Error(`Elasticsearch ${res.status}: ${msg.slice(0, 400)}`);
  }
  return parsed as T;
}

export async function esPing(
  auth: EsAuth,
): Promise<{ name?: string; version?: { number?: string } }> {
  return esRequest(auth, "/");
}

export async function esSearch<T = any>(auth: EsAuth, index: string, body: unknown): Promise<T> {
  return esRequest<T>(auth, `/${encodeURIComponent(index)}/_search`, { method: "POST", body });
}
