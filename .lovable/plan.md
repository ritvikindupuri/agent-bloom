# Chaff v2 — Adversarial Bot Honeypot

Turn Chaff from "AI chat over ES logs" into a live bot-trap that captures behavioral signals from real browsers, clusters them into campaigns using Elasticsearch, reasons about them with Gemini, and exposes itself as an MCP server for external AI tools.

## What changes

```text
                ┌─────────────────────────────────────────┐
                │   /trap/:slug  (AI-generated honeypot)  │
                │   ↓ embeds beacon.js                    │
                │   POST /api/public/beacon  (no auth)    │
                └───────────────┬─────────────────────────┘
                                │ behavioral fingerprint
                                ▼
            ┌──────────────────────────────────────────┐
            │  Elasticsearch (user's own cluster)       │
            │  chaff-events-*  (signals + fingerprint)  │
            │  chaff-campaigns (clustered actors)       │
            └────────┬─────────────────────┬────────────┘
                     │                     │
              Live dashboard         Gemini agent
              (WebSocket-ish         (tools: search,
               polling, 1s)           cluster, verdict,
                                      generate WAF rule)
                                            │
                                            ▼
                                ┌─────────────────────┐
                                │  /api/mcp           │
                                │  is_known_bot(ip)   │
                                │  get_campaign(id)   │
                                │  list_recent()      │
                                └─────────────────────┘
```

## Build steps

### 1. Beacon + honeypot infrastructure
- `/api/public/beacon` (TSS server route, no auth) — accepts JSON fingerprint, ingests to user's ES `chaff-events-*` index using server-side ES creds tied to a public honeypot key.
- `public/beacon.js` — lightweight collector: mouse path entropy, scroll cadence, key timing variance, canvas hash, WebGL renderer, screen/timezone, navigator props, headless tells (`navigator.webdriver`, missing `chrome` obj, perfect mouse-line score, no human dwell).
- `/trap/:slug` route — AI-pre-generated fake content pages (pricing, product, login) that load the beacon. Slugs are honeypot tokens — any hit = certified bot.
- Migration: add `honeypot_keys` table (slug, owner, created_at) and switch `es_connections` to also support a "honeypot ingest" key flag.

### 2. Real-time identification engine
- `src/lib/fingerprint.ts` — pure scoring: takes signals → `{ verdict: 'human'|'suspect'|'bot'|'certified_bot', score, reasons[] }`. Rules: webdriver=true → certified; canvas hash in known-bot set → bot; honeypot hit → certified; mouse entropy < threshold + no scroll → bot; etc.
- Beacon endpoint writes verdict into the event doc so dashboards/queries are pre-scored.

### 3. Campaign clustering (the ES "wow")
- `src/lib/campaigns.ts` + `src/lib/campaigns.functions.ts` — server fn that runs an ES aggregation over `chaff-events-*`: composite agg on `{canvas_hash, webgl_renderer, ua_family, tls_ja4_hint}` with cardinality of IPs, count of events, first/last seen.
- Persists clusters to `bot_campaigns` table with a stable signature hash. Each campaign gets a name (Gemini-generated: "ScraperFleet-Aurora") and a kill-rule (Gemini-generated nginx/Cloudflare WAF snippet).
- Dashboard surfaces "Active Campaigns" with live event counts.

### 4. Live dashboard rebuild
- `/app/dashboard` — replaces current generic charts:
  - Live event feed (poll every 2s, last 50 events with verdict pills)
  - Active campaigns panel (top 5, click → detail)
  - Honeypot hit counter
  - Gauge: humans vs bots last 15min
- `/app/campaigns/:id` — campaign detail with cluster fingerprint, sample events, AI-generated kill rule, "mark resolved" button.
- `/app/honeypots` — manage trap slugs, copy beacon embed code.

### 5. Gemini agent upgrade
- New tools added to `agent.functions.ts`:
  - `cluster_recent_bots(window_min)` — runs the ES composite agg
  - `name_campaign(signature)` — Gemini self-call to brand a campaign
  - `generate_waf_rule(campaign_id, target: 'cloudflare'|'nginx'|'fastly')` — returns deployable rule
  - `verdict_for_ip(ip)` — pull recent events + fingerprint summary
- System prompt updated for honeypot context.

### 6. MCP server (hackathon requirement)
- `src/routes/api/mcp.ts` using `mcp-tanstack-start` with auth via per-workspace MCP token.
- Tools exposed: `is_known_bot`, `get_campaign`, `list_recent_campaigns`, `lookup_fingerprint`.
- Page `/app/mcp` shows the MCP URL + token to paste into Claude/Cursor/ChatGPT.

### 7. Landing page rewrite
- New `/` — bold positioning: "Honeypots that poison scrapers, identify bots in <2s, and brief your AI tools via MCP."
- Live demo widget on landing (anonymous beacon ping → shows your own fingerprint verdict).

## DB migration

```text
honeypot_keys(id, user_id, slug UNIQUE, label, hit_count, created_at)
bot_campaigns(id, user_id, signature_hash UNIQUE, name, fingerprint jsonb,
              ip_count, event_count, first_seen, last_seen, kill_rule text,
              status text DEFAULT 'active', created_at, updated_at)
mcp_tokens(id, user_id, token_hash, label, created_at, revoked_at)
```
ES indices created on first connection: `chaff-events-{user_id}`, with mapping for keyword fields needed for composite agg.

## Tech notes
- All beacon ingest, campaign agg, MCP lookups use Elasticsearch directly — this is the real-data substrate, no mocks.
- `mcp-tanstack-start` package + `@modelcontextprotocol/sdk` + `zod` installed.
- Gemini calls keep going through Lovable AI gateway (`google/gemini-3-flash-preview` for tool loop, `google/gemini-3-pro-preview` for kill-rule generation).
- Existing files reused: `es.server.ts`, `agent.functions.ts` (extended), `bot-detect.ts` (folded into `fingerprint.ts`).

## Out of scope (this round)
- Real TLS JA4 (need network edge); we capture UA-derived JA4 hint only.
- Per-user OAuth for MCP — using static per-workspace tokens.
- WAF rule auto-deploy — we generate the rule, user pastes it.

Confirm and I'll ship it as one batch: migration → beacon route + collector → fingerprint engine → campaign clustering → dashboard/campaigns/honeypots UI → agent tools → MCP route → landing page.
