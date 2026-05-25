// Heuristic bot detection for user-agent strings. Pure function, isomorphic.
const BOT_PATTERNS = [
  /bot/i, /crawler/i, /spider/i, /slurp/i, /bingpreview/i, /headlesschrome/i,
  /phantomjs/i, /puppeteer/i, /playwright/i, /selenium/i, /scrapy/i,
  /python-requests/i, /python-urllib/i, /aiohttp/i, /go-http-client/i,
  /curl\//i, /wget/i, /libwww/i, /java\//i, /okhttp/i, /apachebench/i,
  /httpclient/i, /node-fetch/i, /axios/i, /postmanruntime/i,
  /^Mozilla\/5\.0$/i, /^-$/, /^$/,
];

const KNOWN_GOOD = [
  /googlebot/i, /bingbot/i, /yandex/i, /duckduckbot/i, /baiduspider/i,
  /applebot/i, /facebookexternalhit/i, /twitterbot/i, /linkedinbot/i,
  /slackbot/i, /discordbot/i,
];

export function classifyUA(ua: string | null | undefined): {
  isBot: boolean;
  category: "human" | "good-bot" | "bad-bot" | "unknown";
  reason?: string;
} {
  if (!ua || ua.trim() === "" || ua === "-") {
    return { isBot: true, category: "bad-bot", reason: "empty user-agent" };
  }
  for (const r of KNOWN_GOOD) if (r.test(ua)) return { isBot: true, category: "good-bot", reason: r.source };
  for (const r of BOT_PATTERNS) if (r.test(ua)) return { isBot: true, category: "bad-bot", reason: r.source };
  if (!/mozilla/i.test(ua) && !/safari|chrome|firefox|edge/i.test(ua)) {
    return { isBot: true, category: "bad-bot", reason: "non-browser UA" };
  }
  return { isBot: false, category: "human" };
}
