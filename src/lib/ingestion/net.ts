import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// ─────────────────────────────────────────────────────────────────────────
// SSRF protection for the crawler. The discovery pipeline fetches USER-SUPPLIED
// source URLs, so without this a malicious/typo'd source could be pointed at
// localhost, the cloud metadata endpoint (169.254.169.254), or private ranges.
//
// assertPublicUrl(): scheme must be http(s); host must not be a private/reserved
// IP; the host's DNS resolution must not land on a private IP either.
// safeFetch(): validates, then follows redirects MANUALLY re-validating each hop,
// with a response-size cap. Use this for every outbound crawl request.
// ─────────────────────────────────────────────────────────────────────────

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

/** True if an IPv4/IPv6 literal is loopback, private, link-local, CGNAT, etc. */
export function isPrivateIp(addr: string): boolean {
  const v = isIP(addr);
  if (v === 4) return isPrivateV4(addr);
  if (v === 6) return isPrivateV6(addr.toLowerCase());
  return true; // not a parseable IP → treat as unsafe
}

function isPrivateV4(addr: string): boolean {
  const p = addr.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0 && p[2] === 0) return true; // 192.0.0/24
  if (a >= 224) return true; // multicast + reserved (224-255)
  return false;
}

function isPrivateV6(addr: string): boolean {
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  if (addr.startsWith("fe80") || addr.startsWith("fc") || addr.startsWith("fd")) return true; // link-local + ULA
  // IPv4-mapped (::ffff:a.b.c.d) — extract and check the v4 part.
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return false;
}

/** Throws SsrfError unless the URL is a public http(s) endpoint (DNS-checked). */
export async function assertPublicUrl(target: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new SsrfError(`Invalid URL: ${target}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfError(`Blocked non-http(s) scheme: ${url.protocol}`);
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "ip6-localhost") {
    throw new SsrfError(`Blocked local hostname: ${host}`);
  }
  // If the host is a literal IP, check it directly.
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new SsrfError(`Blocked private/reserved IP: ${host}`);
    return url;
  }
  // Otherwise resolve and verify EVERY address is public (defeats DNS rebinding to a private IP).
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new SsrfError(`DNS resolution failed for ${host}`);
  }
  if (!addrs.length) throw new SsrfError(`No DNS records for ${host}`);
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      throw new SsrfError(`Host ${host} resolves to a private IP (${a.address}) — blocked`);
    }
  }
  return url;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5MB cap per fetched page/feed

/**
 * SSRF-safe fetch: validates the URL and each redirect hop, caps body size.
 * Returns the response text (status checked by caller via the thrown errors).
 */
export async function safeFetch(
  target: string,
  init: RequestInit & { maxRedirects?: number } = {},
): Promise<{ url: string; status: number; text: string }> {
  const maxRedirects = init.maxRedirects ?? 4;
  let current = target;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current); // re-validate every hop (redirect-based SSRF)
    const res = await fetch(current, { ...init, redirect: "manual" });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { url: current, status: res.status, text: "" };
      current = new URL(loc, current).toString();
      continue;
    }

    // Read with a size cap.
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      return { url: current, status: res.status, text: text.slice(0, MAX_BYTES) };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > MAX_BYTES) {
          reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
    return { url: current, status: res.status, text };
  }
  throw new SsrfError(`Too many redirects fetching ${target}`);
}
