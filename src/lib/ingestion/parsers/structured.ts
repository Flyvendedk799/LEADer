import type * as cheerio from "cheerio";
import type { OpportunityCandidate } from "../dedupe";

// ─────────────────────────────────────────────────────────────────────────
// STRUCTURED-DATA EXTRACTION (provider-agnostic)
//
// The most reliable, low-maintenance way to read public opportunity/grant/job
// pages is the structured data sites already publish for search engines:
//   • JSON-LD  (<script type="application/ld+json">) — schema.org JobPosting,
//     Event, GovernmentService, GrantApplication, Service…
//   • Microdata (itemscope / itemprop) — same vocabulary, inline.
//
// Real parsers below layer site-specific CSS selectors on top of this, but most
// modern sites give us a clean candidate from structured data alone.
// ─────────────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function str(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  return undefined;
}

function toDate(v: unknown): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function typeOf(node: Json): string[] {
  const t = node["@type"];
  return asArray(t)
    .map((x) => (typeof x === "string" ? x.toLowerCase() : ""))
    .filter(Boolean);
}

function absUrl(url: string | undefined, pageUrl: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, pageUrl).toString();
  } catch {
    return undefined;
  }
}

/** schema.org MonetaryAmount / PriceSpecification → {min,max,currency}. */
function moneyFrom(node: unknown): { min?: number; max?: number; currency?: string } {
  if (!node || typeof node !== "object") return {};
  const n = node as Json;
  const currency = str(n.currency) || str(n.priceCurrency);

  const valueNode = n.value ?? n;
  const v = valueNode as Json;
  const toNum = (x: unknown) => {
    const s = str(x);
    if (!s) return undefined;
    const num = Number(s.replace(/[^\d.]/g, ""));
    return Number.isFinite(num) && num > 0 ? Math.round(num) : undefined;
  };

  const min = toNum(v.minValue) ?? toNum(v.minPrice);
  const max = toNum(v.maxValue) ?? toNum(v.maxPrice);
  const single = toNum(v.value) ?? toNum(n.price);
  if (min != null || max != null) return { min, max, currency };
  if (single != null) return { max: single, currency };
  return { currency };
}

/** Map one schema.org node to a candidate, or null if it isn't opportunity-like. */
function nodeToCandidate(node: Json, pageUrl: string): OpportunityCandidate | null {
  const types = typeOf(node);
  const isOpportunityType = types.some((t) =>
    ["jobposting", "event", "governmentservice", "grant", "grantapplication", "service", "opportunity", "fundingscheme"].includes(t),
  );
  // Generic CreativeWork / WebPage nodes are too noisy to treat as candidates.
  if (!isOpportunityType) return null;

  const title = str(node.title) || str(node.name) || str(node.headline);
  if (!title) return null;

  const description = str(node.description);

  // Organization / provider / hiring org.
  const orgNode = node.hiringOrganization ?? node.organizer ?? node.provider ?? node.funder ?? node.sponsor;
  const organization = str((orgNode as Json)?.name) || str(orgNode);

  // Deadline: validThrough (JobPosting), endDate (Event), applicationDeadline.
  const deadline =
    toDate(node.validThrough) ?? toDate(node.applicationDeadline) ?? toDate(node.endDate) ?? null;
  const postedAt = toDate(node.datePosted) ?? toDate(node.startDate) ?? null;

  // Budget: baseSalary (JobPosting), offers (Event), estimatedCost / amount (Grant).
  const budget = moneyFrom(node.baseSalary ?? node.offers ?? node.estimatedCost ?? node.amount);

  // Location.
  const locNode = node.jobLocation ?? node.location ?? node.areaServed;
  const location =
    str((locNode as Json)?.name) ||
    str(((locNode as Json)?.address as Json)?.addressLocality) ||
    str(locNode);

  // Contact.
  const contactNode = (node.applicationContact ?? node.contactPoint) as Json | undefined;
  const email = str(contactNode?.email) || str(node.email);
  const contactName = str(contactNode?.name);
  const contacts =
    email || contactName ? [{ name: contactName, email, role: str(contactNode?.contactType) }] : undefined;

  const url = absUrl(str(node.url) || str((node.mainEntityOfPage as Json)?.["@id"]), pageUrl) || pageUrl;

  return {
    title: title.slice(0, 250),
    description: description?.slice(0, 1200),
    rawContent: description?.slice(0, 4000),
    url,
    organization,
    location,
    budgetMin: budget.min,
    budgetMax: budget.max,
    currency: budget.currency,
    deadline,
    postedAt,
    contacts,
    applicationRoute: types.includes("jobposting") || node.applicationDeadline ? "APPLICATION" : "UNKNOWN",
  };
}

/** Parse every JSON-LD block, flattening @graph, into candidates. */
export function extractJsonLd($: cheerio.CheerioAPI, pageUrl: string): OpportunityCandidate[] {
  const out: OpportunityCandidate[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // skip malformed blocks
    }
    const nodes: Json[] = [];
    for (const top of asArray(parsed as Json | Json[])) {
      if (!top || typeof top !== "object") continue;
      const graph = (top as Json)["@graph"];
      if (Array.isArray(graph)) nodes.push(...(graph as Json[]));
      else nodes.push(top as Json);
    }
    for (const node of nodes) {
      const c = nodeToCandidate(node, pageUrl);
      if (c) out.push(c);
    }
  });
  return out;
}

/** Parse schema.org microdata (itemscope/itemprop) for opportunity-like items. */
export function extractMicrodata($: cheerio.CheerioAPI, pageUrl: string): OpportunityCandidate[] {
  const out: OpportunityCandidate[] = [];
  const wanted = /(JobPosting|Event|GovernmentService|Grant|Service)/i;

  $("[itemscope][itemtype]").each((_, scope) => {
    const itemType = $(scope).attr("itemtype") || "";
    if (!wanted.test(itemType)) return;
    const $scope = $(scope);

    const prop = (name: string): string | undefined => {
      const el = $scope.find(`[itemprop="${name}"]`).first();
      if (!el.length) return undefined;
      const tag = (el.prop("tagName") || "").toLowerCase();
      const val =
        el.attr("content") ||
        (tag === "a" ? el.attr("href") : undefined) ||
        (tag === "time" ? el.attr("datetime") : undefined) ||
        el.text();
      return val?.trim() || undefined;
    };

    const title = prop("title") || prop("name");
    if (!title) return;
    const description = prop("description");
    const deadlineStr = prop("validThrough") || prop("applicationDeadline") || prop("endDate");
    const deadline = deadlineStr ? toDate(deadlineStr) : null;

    out.push({
      title: title.slice(0, 250),
      description: description?.slice(0, 1200),
      rawContent: $scope.text().replace(/\s+/g, " ").trim().slice(0, 4000),
      url: absUrl(prop("url"), pageUrl) || pageUrl,
      organization: prop("hiringOrganization") || prop("organizer") || prop("provider"),
      location: prop("jobLocation") || prop("location"),
      deadline,
      applicationRoute: "UNKNOWN",
    });
  });

  return out;
}

/** Best-effort structured extraction: JSON-LD first, then microdata. */
export function extractStructured($: cheerio.CheerioAPI, pageUrl: string): OpportunityCandidate[] {
  const jsonLd = extractJsonLd($, pageUrl);
  if (jsonLd.length) return jsonLd;
  return extractMicrodata($, pageUrl);
}
