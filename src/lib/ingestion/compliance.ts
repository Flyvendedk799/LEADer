import { AUTOMATABLE_SOURCE_TYPES, type SourceType } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// COMPLIANCE GATE — see docs/COMPLIANCE.md. The automated pipeline literally
// cannot run on community/manual source types, and never fetches a URL that
// robots.txt disallows. No login, no paywall bypass, no closed groups. Ever.
// ─────────────────────────────────────────────────────────────────────────

export function isAutomatable(type: SourceType): boolean {
  return AUTOMATABLE_SOURCE_TYPES.includes(type);
}

/** Throws if a source type must never be fetched automatically. */
export function assertAutomatable(type: SourceType): void {
  if (!isAutomatable(type)) {
    throw new Error(
      `Source type ${type} is manual-only and excluded from automated discovery (compliance gate).`,
    );
  }
}

const robotsCache = new Map<string, { rules: { ua: string; disallow: string[] }[]; fetchedAt: number }>();
const ROBOTS_TTL_MS = 1000 * 60 * 60; // 1h

function userAgent(): string {
  return process.env.CRAWLER_USER_AGENT || "LEADerBot/0.1 (+respects robots.txt)";
}

/**
 * Fetch + parse robots.txt for a host and check whether the path is allowed
 * for our user agent. Fails CLOSED only on explicit Disallow; network/parse
 * errors are treated as "allowed" for public pages but logged by the caller.
 */
export async function isAllowedByRobots(targetUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = `${url.protocol}//${url.host}`;
  const cached = robotsCache.get(host);
  const fresh = cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS;

  let rules = cached?.rules;
  if (!fresh) {
    try {
      const res = await fetch(`${host}/robots.txt`, {
        headers: { "User-Agent": userAgent() },
        signal: AbortSignal.timeout(8000),
      });
      rules = res.ok ? parseRobots(await res.text()) : [];
    } catch {
      rules = []; // no robots.txt reachable → no explicit disallow
    }
    robotsCache.set(host, { rules: rules || [], fetchedAt: Date.now() });
  }

  return isPathAllowed(rules || [], url.pathname, userAgent());
}

function parseRobots(txt: string): { ua: string; disallow: string[] }[] {
  const groups: { ua: string; disallow: string[] }[] = [];
  let current: { ua: string; disallow: string[] } | null = null;
  for (const lineRaw of txt.split("\n")) {
    const line = lineRaw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.toLowerCase().trim();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      current = { ua: value.toLowerCase(), disallow: [] };
      groups.push(current);
    } else if (key === "disallow" && current) {
      if (value) current.disallow.push(value);
    }
  }
  return groups;
}

function isPathAllowed(
  groups: { ua: string; disallow: string[] }[],
  path: string,
  ua: string,
): boolean {
  const uaLower = ua.toLowerCase();
  // Prefer a group matching our UA, else the wildcard group.
  const specific = groups.find((g) => uaLower.includes(g.ua) && g.ua !== "*");
  const wildcard = groups.find((g) => g.ua === "*");
  const group = specific || wildcard;
  if (!group) return true;
  return !group.disallow.some((rule) => rule !== "" && path.startsWith(rule));
}

// ── Per-host rate limiter ────────────────────────────────────────────────────

const lastHit = new Map<string, number>();

export async function rateLimit(targetUrl: string): Promise<void> {
  const minMs = Number(process.env.CRAWLER_RATE_LIMIT_MS || 2000);
  let host = "";
  try {
    host = new URL(targetUrl).host;
  } catch {
    return;
  }
  const last = lastHit.get(host) || 0;
  const wait = Math.max(0, last + minMs - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

export function crawlerSettings() {
  return {
    userAgent: userAgent(),
    timeoutMs: Number(process.env.CRAWLER_TIMEOUT_MS || 15000),
    maxPagesPerRun: Number(process.env.CRAWLER_MAX_PAGES_PER_RUN || 25),
    playwrightEnabled: process.env.CRAWLER_ENABLE_PLAYWRIGHT === "true",
  };
}
