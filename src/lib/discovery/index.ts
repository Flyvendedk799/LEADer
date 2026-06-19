import * as cheerio from "cheerio";
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { runAi } from "@/lib/ai";
import {
  getStoredSearchApiKey,
  normalizeStoredAiKeys,
  type SearchProvider,
} from "@/lib/ai/keys";
import { ensureEmbedding } from "@/lib/opportunities/similar";
import { scoreOpportunity } from "@/lib/scoring";
import type {
  ApplicationRoute,
  ScoreBreakdown,
  ScoreWeights,
  SourceType,
  Workspace,
} from "@/lib/types";
import { AUTOMATABLE_SOURCE_TYPES } from "@/lib/types";
import { crawlerSettings, isAllowedByRobots, rateLimit } from "@/lib/ingestion/compliance";
import { dedupeHash, type OpportunityCandidate } from "@/lib/ingestion/dedupe";
import { detectApplicationRoute, extractBudget, extractDeadline } from "@/lib/ingestion/extract";
import { assertPublicUrl, safeFetch } from "@/lib/ingestion/net";
import { fetchRssCandidates } from "@/lib/ingestion/rss";
import { fetchWebCandidates } from "@/lib/ingestion/web";
export { DISCOVERY_PRESETS } from "./presets";

export interface DiscoverySearchInput {
  query: string;
  workspace?: Workspace;
  maxResults?: number;
  includeWeb?: boolean;
  includeSources?: boolean;
  provider?: "auto" | "tavily" | "brave" | "serper" | "none";
}

export interface DiscoveryCandidateDto {
  id: string;
  title: string;
  description?: string;
  rawContent?: string;
  url?: string;
  organization?: string;
  location?: string;
  country?: string;
  region?: string;
  category?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  deadline?: string;
  postedAt?: string;
  applicationRoute: ApplicationRoute;
  contacts: { name?: string; email?: string; role?: string }[];
  sourceName: string;
  sourceKind: "web-search" | "source-scan";
  provider: string;
  query: string;
  matchScore: number;
  scoreBreakdown: ScoreBreakdown;
  reasons: string[];
  signals: string[];
  alreadySaved?: { id: string; title: string };
}

export interface DiscoverySearchResult {
  candidates: DiscoveryCandidateDto[];
  queries: string[];
  provider: string;
  providerConfigured: boolean;
  sourceScanCount: number;
  warnings: string[];
}

interface SearchResult {
  title: string;
  url?: string;
  snippet?: string;
  sourceName?: string;
  publishedAt?: string | Date | null;
  provider: string;
  query: string;
}

export type DiscoveryCandidateSaveInput = {
  id?: string;
  title: string;
  description?: string;
  rawContent?: string;
  url?: string;
  organization?: string;
  location?: string;
  country?: string;
  region?: string;
  category?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  deadline?: string;
  postedAt?: string;
  applicationRoute?: ApplicationRoute;
  contacts?: { name?: string; email?: string; role?: string }[];
  sourceName?: string;
  sourceKind?: "web-search" | "source-scan";
  provider?: string;
  query?: string;
};

interface UserProfile {
  id: string;
  headline: string | null;
  bio: string | null;
  preferredProjectTypes: string[];
  excludedCategories: string[];
  budgetMaxDkk: number;
  scoringWeights: Prisma.JsonValue;
  aiKeys: Prisma.JsonValue;
}

const MAX_PAGE_FETCHES = 10;
const MAX_SCAN_SOURCES = 8;

function cleanText(value = "", max = 1600): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function searchProviderFromEnv(
  requested: DiscoverySearchInput["provider"] = "auto",
  aiKeys?: unknown,
): { provider: SearchProvider | "none"; apiKey: string; configured: boolean; source: "user" | "env" | "none" } {
  if (requested === "none") {
    return { provider: "none", apiKey: "", configured: false, source: "none" };
  }

  const stored = normalizeStoredAiKeys(aiKeys);
  const providers =
    requested === "auto"
      ? ([
          stored?.searchProvider,
          "tavily",
          "brave",
          "serper",
        ].filter(Boolean) as SearchProvider[])
      : [requested as SearchProvider];
  const ordered = [...new Set(providers)];

  for (const provider of ordered) {
    const apiKey = getStoredSearchApiKey(aiKeys, provider);
    if (apiKey) return { provider, apiKey, configured: true, source: "user" };
  }

  const envKeys: Record<SearchProvider, string | undefined> = {
    tavily: process.env.TAVILY_API_KEY,
    brave: process.env.BRAVE_SEARCH_API_KEY,
    serper: process.env.SERPER_API_KEY,
  };
  for (const provider of ordered) {
    const apiKey = envKeys[provider]?.trim();
    if (apiKey) return { provider, apiKey, configured: true, source: "env" };
  }

  return {
    provider: requested === "auto" ? "none" : requested ?? "none",
    apiKey: "",
    configured: false,
    source: "none",
  };
}

function profileText(user: UserProfile): string {
  return cleanText(
    [
      user.headline,
      user.bio,
      user.preferredProjectTypes.length
        ? `Preferred work: ${user.preferredProjectTypes.join(", ")}`
        : "",
      `Budget preference: under ${user.budgetMaxDkk.toLocaleString("da-DK")} DKK`,
    ]
      .filter(Boolean)
      .join("\n"),
    1200,
  );
}

function buildQueries(query: string, workspace: Workspace): string[] {
  const q = cleanText(query, 280);
  const country = workspace === "DK" ? "Danmark" : "Europe remote";
  const terms =
    workspace === "DK"
      ? [
          q,
          `${q} ${country} udbud software udvikling IT konsulent`,
          `${q} ${country} startup søger udvikler MVP prototype tilskud voucher`,
          `${q} ${country} SMV Digital digitalisering rådgivning software`,
        ]
      : [
          q,
          `${q} funded startup MVP fullstack software project remote`,
          `${q} grant voucher innovation software supplier`,
        ];
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 4);
}

function sourceLabel(url?: string): string {
  if (!url) return "Unknown source";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Unknown source";
  }
}

function parseMaybeDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function categoryFromText(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/ai|llm|kunstig intelligens|automation|automatisering|chatbot/.test(t)) return "AI / automation";
  if (/mvp|prototype|proof.of.concept|poc|startup|founder/.test(t)) return "MVP / prototype";
  if (/smv.?digital|voucher|tilskud|bevilling|innobooster|erhvervshus/.test(t)) return "Voucher / grant";
  if (/udbud|tender|procurement|offentlig/.test(t)) return "Tender";
  if (/roadmap|strategi|architecture|arkitektur/.test(t)) return "Product strategy";
  return undefined;
}

function extractContacts(text: string): { name?: string; email?: string; role?: string }[] {
  const emails = [...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])];
  return emails.slice(0, 3).map((email) => ({ email }));
}

function signalLabels(c: OpportunityCandidate): string[] {
  const text = `${c.title} ${c.description ?? ""} ${c.rawContent ?? ""}`.toLowerCase();
  const signals: string[] = [];
  if (c.budgetMin || c.budgetMax) signals.push("budget");
  if (c.deadline) signals.push("deadline");
  if (/mvp|prototype|poc/.test(text)) signals.push("MVP");
  if (/ai|llm|automation|automatisering/.test(text)) signals.push("AI");
  if (/voucher|tilskud|bevilling|smv.?digital|innobooster/.test(text)) signals.push("funding");
  if (/udbud|tender|procurement/.test(text)) signals.push("udbud");
  if (/kontakt|contact|email|e-mail|@/.test(text)) signals.push("contactable");
  return [...new Set(signals)].slice(0, 6);
}

function reasonsFromScore(breakdown: ScoreBreakdown): string[] {
  return breakdown.components
    .filter((c) => c.raw >= 0.45)
    .slice(0, 4)
    .map((c) => (c.note ? `${c.label}: ${c.note}` : c.label));
}

function enrichCandidate(input: OpportunityCandidate, fallback: Partial<OpportunityCandidate> = {}) {
  const text = cleanText(
    `${input.title}\n${input.description ?? ""}\n${input.rawContent ?? ""}`,
    6000,
  );
  const budget =
    input.budgetMax == null && input.budgetMin == null ? extractBudget(text) : {};
  const deadline = input.deadline ?? extractDeadline(text);
  const applicationRoute =
    input.applicationRoute && input.applicationRoute !== "UNKNOWN"
      ? input.applicationRoute
      : detectApplicationRoute(text);
  return {
    ...fallback,
    ...input,
    description: input.description || fallback.description,
    rawContent: input.rawContent || text,
    budgetMin: input.budgetMin ?? budget.min,
    budgetMax: input.budgetMax ?? budget.max,
    currency: input.currency ?? budget.currency ?? fallback.currency ?? "DKK",
    deadline,
    applicationRoute,
    contacts: input.contacts?.length ? input.contacts : extractContacts(text),
    category: input.category ?? fallback.category ?? categoryFromText(text),
  } satisfies OpportunityCandidate;
}

async function fetchReadablePage(url?: string): Promise<{ title?: string; description?: string; text?: string }> {
  if (!url) return {};
  const { userAgent, timeoutMs } = crawlerSettings();
  try {
    await assertPublicUrl(url);
    if (!(await isAllowedByRobots(url))) return {};
    await rateLimit(url);
    const res = await safeFetch(url, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status < 200 || res.status >= 300) return {};
    const $ = cheerio.load(res.text);
    $("script,style,noscript,svg").remove();
    const title = cleanText($("h1").first().text() || $("title").text(), 220);
    const description = cleanText(
      $('meta[name="description"]').attr("content") || $("p").first().text(),
      700,
    );
    const text = cleanText($("body").text(), 5000);
    return { title, description, text };
  } catch {
    return {};
  }
}

async function tavilySearch(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_raw_content: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`);
  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string; published_date?: string }[];
  };
  return (data.results ?? [])
    .filter((r) => r.title || r.url)
    .map((r) => ({
      title: r.title || r.url || "Untitled result",
      url: r.url,
      snippet: r.content,
      publishedAt: r.published_date,
      sourceName: sourceLabel(r.url),
      provider: "tavily",
      query,
    }));
}

async function braveSearch(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    country: "DK",
    search_lang: "da",
    count: String(Math.min(maxResults, 20)),
    safesearch: "moderate",
  });
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });
  if (!res.ok) throw new Error(`Brave search failed (${res.status})`);
  const data = (await res.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string; profile?: { name?: string } }[] };
  };
  return (data.web?.results ?? [])
    .filter((r) => r.title || r.url)
    .map((r) => ({
      title: r.title || r.url || "Untitled result",
      url: r.url,
      snippet: r.description,
      sourceName: r.profile?.name || sourceLabel(r.url),
      provider: "brave",
      query,
    }));
}

async function serperSearch(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, gl: "dk", hl: "da", num: Math.min(maxResults, 20) }),
  });
  if (!res.ok) throw new Error(`Serper search failed (${res.status})`);
  const data = (await res.json()) as {
    organic?: { title?: string; link?: string; snippet?: string; source?: string; date?: string }[];
  };
  return (data.organic ?? [])
    .filter((r) => r.title || r.link)
    .map((r) => ({
      title: r.title || r.link || "Untitled result",
      url: r.link,
      snippet: r.snippet,
      sourceName: r.source || sourceLabel(r.link),
      publishedAt: r.date,
      provider: "serper",
      query,
    }));
}

async function runProviderSearch(
  provider: SearchProvider,
  apiKey: string,
  queries: string[],
  maxResults: number,
): Promise<SearchResult[]> {
  const perQuery = Math.max(3, Math.ceil(maxResults / Math.max(1, queries.length)));
  const out: SearchResult[] = [];
  for (const query of queries) {
    const results =
      provider === "tavily"
        ? await tavilySearch(query, perQuery, apiKey)
        : provider === "brave"
          ? await braveSearch(query, perQuery, apiKey)
          : await serperSearch(query, perQuery, apiKey);
    out.push(...results);
    if (out.length >= maxResults * 2) break;
  }
  return out;
}

async function searchResultsToCandidates(
  results: SearchResult[],
  user: UserProfile,
  workspace: Workspace,
  maxResults: number,
): Promise<DiscoveryCandidateDto[]> {
  const candidates: DiscoveryCandidateDto[] = [];
  const seen = new Set<string>();
  let pageFetches = 0;

  for (const result of results) {
    if (candidates.length >= maxResults) break;
    const page = pageFetches < MAX_PAGE_FETCHES ? await fetchReadablePage(result.url) : {};
    pageFetches++;

    const title = cleanText(page.title || result.title, 220);
    if (!title || seen.has(result.url || title.toLowerCase())) continue;
    seen.add(result.url || title.toLowerCase());

    const rawText = cleanText(
      [title, result.snippet, page.description, page.text].filter(Boolean).join("\n"),
      6000,
    );
    const enriched = enrichCandidate({
      title,
      description: cleanText(page.description || result.snippet || page.text || "", 900),
      rawContent: rawText,
      url: result.url,
      organization: result.sourceName,
      country: workspace === "DK" ? "DK" : undefined,
      workspace,
      postedAt: parseMaybeDate(result.publishedAt),
    } as OpportunityCandidate & { workspace?: Workspace });

    candidates.push(await toDiscoveryDto(enriched, user, {
      sourceName: result.sourceName || sourceLabel(result.url),
      sourceKind: "web-search",
      provider: result.provider,
      query: result.query,
    }));
  }
  return candidates;
}

async function scanSources(
  ownerId: string,
  query: string,
  user: UserProfile,
  workspace: Workspace,
  maxResults: number,
): Promise<{ candidates: DiscoveryCandidateDto[]; scanned: number; warnings: string[] }> {
  const warnings: string[] = [];
  const sources = await db.source.findMany({
    where: {
      ownerId,
      enabled: true,
      workspace,
      type: { in: AUTOMATABLE_SOURCE_TYPES as SourceType[] },
      url: { not: null },
    },
    orderBy: [{ lastCheckedAt: "asc" }, { createdAt: "desc" }],
    take: MAX_SCAN_SOURCES,
  });
  const candidates: DiscoveryCandidateDto[] = [];
  const queryKeywords = query
    .split(/[,\s]+/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 3)
    .slice(0, 10);

  for (const source of sources) {
    if (!source.url || candidates.length >= maxResults) break;
    try {
      const mergedKeywords = [...new Set([...source.keywords, ...queryKeywords])];
      const raw =
        source.type === "RSS" || source.type === "NEWSLETTER"
          ? await fetchRssCandidates(source.url, mergedKeywords)
          : await fetchWebCandidates(source.url, {
              keywords: mergedKeywords,
              parserKey: source.parserKey,
            });
      for (const item of raw) {
        if (candidates.length >= maxResults) break;
        const enriched = enrichCandidate(item, {
          country: source.country ?? (workspace === "DK" ? "DK" : undefined),
          region: source.region ?? undefined,
          category: source.category ?? undefined,
        });
        candidates.push(await toDiscoveryDto(enriched, user, {
          sourceName: source.name,
          sourceKind: "source-scan",
          provider: "saved-sources",
          query,
        }));
      }
      await db.source.update({ where: { id: source.id }, data: { lastCheckedAt: new Date() } });
    } catch (e) {
      warnings.push(`${source.name}: ${e instanceof Error ? e.message : "scan failed"}`);
    }
  }
  return { candidates, scanned: sources.length, warnings };
}

async function maybeAiSummary(c: OpportunityCandidate, user: UserProfile): Promise<string | undefined> {
  if (!process.env.LLM_API_KEY && !user.aiKeys) return undefined;
  try {
    const res = await runAi({
      action: "summarize",
      context: [c.title, c.description, c.rawContent].filter(Boolean).join("\n"),
      profile: profileText(user),
      aiKeys: user.aiKeys,
    });
    return res.mocked ? undefined : res.text;
  } catch {
    return undefined;
  }
}

async function toDiscoveryDto(
  c: OpportunityCandidate,
  user: UserProfile,
  meta: Pick<DiscoveryCandidateDto, "sourceName" | "sourceKind" | "provider" | "query">,
): Promise<DiscoveryCandidateDto> {
  const breakdown = scoreOpportunity(
    { ...c, contacts: c.contacts ?? [] },
    {
      budgetMaxDkk: user.budgetMaxDkk,
      weights: (user.scoringWeights as Partial<ScoreWeights>) || undefined,
    },
  );
  const hash = dedupeHash(c);
  const aiSummary = await maybeAiSummary(c, user);
  const deadline = parseMaybeDate(c.deadline);
  const postedAt = parseMaybeDate(c.postedAt);
  return {
    id: hash,
    title: c.title,
    description: aiSummary || c.description,
    rawContent: c.rawContent,
    url: c.url,
    organization: c.organization,
    location: c.location,
    country: c.country,
    region: c.region,
    category: c.category,
    budgetMin: c.budgetMin,
    budgetMax: c.budgetMax,
    currency: c.currency ?? "DKK",
    deadline: deadline ? deadline.toISOString() : undefined,
    postedAt: postedAt ? postedAt.toISOString() : undefined,
    applicationRoute: c.applicationRoute ?? "UNKNOWN",
    contacts: c.contacts ?? [],
    matchScore: breakdown.total,
    scoreBreakdown: breakdown,
    reasons: reasonsFromScore(breakdown),
    signals: signalLabels(c),
    ...meta,
  };
}

function dedupeCandidates(candidates: DiscoveryCandidateDto[], maxResults: number): DiscoveryCandidateDto[] {
  const seen = new Set<string>();
  const unique: DiscoveryCandidateDto[] = [];
  for (const c of candidates.sort((a, b) => b.matchScore - a.matchScore)) {
    const key = c.url || c.id || c.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
    if (unique.length >= maxResults) break;
  }
  return unique;
}

async function markAlreadySaved(ownerId: string, candidates: DiscoveryCandidateDto[]) {
  const hashes = candidates.map((c) => c.id).filter(Boolean);
  const urls = candidates.map((c) => c.url).filter(Boolean) as string[];
  if (!hashes.length && !urls.length) return candidates;

  const saved = await db.opportunity.findMany({
    where: {
      ownerId,
      OR: [
        hashes.length ? { dedupeHash: { in: hashes } } : undefined,
        urls.length ? { url: { in: urls } } : undefined,
      ].filter(Boolean) as Prisma.OpportunityWhereInput[],
    },
    select: { id: true, title: true, dedupeHash: true, url: true },
  });
  return candidates.map((c) => {
    const match = saved.find((s) => s.dedupeHash === c.id || (c.url && s.url === c.url));
    return match ? { ...c, alreadySaved: { id: match.id, title: match.title } } : c;
  });
}

export async function runDiscoverySearch(
  ownerId: string,
  input: DiscoverySearchInput,
): Promise<DiscoverySearchResult> {
  const user = await db.user.findUnique({
    where: { id: ownerId },
    select: {
      id: true,
      headline: true,
      bio: true,
      preferredProjectTypes: true,
      excludedCategories: true,
      budgetMaxDkk: true,
      scoringWeights: true,
      aiKeys: true,
    },
  });
  if (!user) throw new Error("User not found");

  const workspace = input.workspace ?? "DK";
  const maxResults = Math.min(Math.max(input.maxResults ?? 12, 4), 30);
  const queries = buildQueries(input.query, workspace);
  const providerState = searchProviderFromEnv(input.provider, user.aiKeys);
  const warnings: string[] = [];
  let candidates: DiscoveryCandidateDto[] = [];
  let sourceScanCount = 0;

  if (input.includeWeb !== false && providerState.configured && providerState.provider !== "none") {
    try {
      const webResults = await runProviderSearch(
        providerState.provider,
        providerState.apiKey,
        queries,
        maxResults,
      );
      const webCandidates = await searchResultsToCandidates(webResults, user, workspace, maxResults);
      candidates.push(...webCandidates);
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : "Web search failed");
    }
  } else if (input.includeWeb !== false) {
    warnings.push(
      "No web search API key configured. Add Tavily, Brave Search, or Serper in Settings -> AI to enable broad web discovery.",
    );
  }

  if (input.includeSources !== false) {
    const scanned = await scanSources(ownerId, input.query, user, workspace, maxResults);
    sourceScanCount = scanned.scanned;
    candidates.push(...scanned.candidates);
    warnings.push(...scanned.warnings.slice(0, 4));
  }

  const unique = await markAlreadySaved(ownerId, dedupeCandidates(candidates, maxResults));
  return {
    candidates: unique,
    queries,
    provider: providerState.provider,
    providerConfigured: providerState.configured,
    sourceScanCount,
    warnings,
  };
}

export async function saveDiscoveryCandidate(
  ownerId: string,
  candidate: DiscoveryCandidateSaveInput,
  workspace: Workspace,
) {
  const base: OpportunityCandidate = enrichCandidate({
    title: candidate.title,
    description: candidate.description,
    rawContent: candidate.rawContent,
    url: candidate.url,
    organization: candidate.organization || candidate.sourceName,
    location: candidate.location,
    country: candidate.country || (workspace === "DK" ? "DK" : undefined),
    region: candidate.region,
    category: candidate.category,
    budgetMin: candidate.budgetMin,
    budgetMax: candidate.budgetMax,
    currency: candidate.currency || "DKK",
    deadline: parseMaybeDate(candidate.deadline),
    postedAt: parseMaybeDate(candidate.postedAt),
    applicationRoute: candidate.applicationRoute,
    contacts: candidate.contacts,
  });
  const hash = dedupeHash(base);

  const existing = await db.opportunity.findFirst({
    where: {
      ownerId,
      OR: [{ dedupeHash: hash }, ...(base.url ? [{ url: base.url }] : [])],
    },
    select: { id: true, title: true },
  });
  if (existing) return { opportunity: existing, created: false };

  const user = await db.user.findUnique({
    where: { id: ownerId },
    select: { budgetMaxDkk: true, scoringWeights: true },
  });
  const breakdown = scoreOpportunity(
    { ...base, contacts: base.contacts ?? [] },
    {
      budgetMaxDkk: user?.budgetMaxDkk ?? 100000,
      weights: (user?.scoringWeights as Partial<ScoreWeights>) || undefined,
    },
  );
  breakdown.computedAt = new Date().toISOString();
  const isActive = !base.deadline || new Date(base.deadline).getTime() >= Date.now();

  const opportunity = await db.opportunity.create({
    data: {
      ownerId,
      title: base.title,
      description: base.description,
      rawContent: base.rawContent,
      url: base.url,
      organization: base.organization,
      location: base.location,
      country: base.country || (workspace === "DK" ? "DK" : undefined),
      region: base.region,
      category: base.category,
      workspace,
      budgetMin: base.budgetMin,
      budgetMax: base.budgetMax,
      currency: base.currency ?? "DKK",
      deadline: base.deadline ?? undefined,
      postedAt: base.postedAt ?? undefined,
      isActive,
      applicationRoute: base.applicationRoute ?? "UNKNOWN",
      ingestMethod: "AUTOMATED",
      matchScore: breakdown.total,
      scoreBreakdown: breakdown as object,
      dedupeHash: hash,
      status: "NEW",
      contacts: base.contacts?.length
        ? {
            create: base.contacts.map((contact) => ({
              name: contact.name,
              email: contact.email,
              role: contact.role,
            })),
          }
        : undefined,
      activities: {
        create: {
          type: "IMPORT",
          message: "Saved from Discover",
          metadata: {
            sourceName: candidate.sourceName ?? "Discover",
            sourceKind: candidate.sourceKind ?? "web-search",
            provider: candidate.provider ?? "discover",
            query: candidate.query ?? "",
          },
        },
      },
    },
    select: { id: true, title: true },
  });

  await ensureEmbedding(opportunity.id);

  if (breakdown.total >= 80) {
    await db.alert.create({
      data: {
        ownerId,
        type: "NEW_HIGH_MATCH",
        title: `New high-match lead: ${opportunity.title}`,
        body: `Score ${breakdown.total}. ${base.url ?? ""}`,
        payload: { opportunityId: opportunity.id, score: breakdown.total },
      },
    });
  }

  return { opportunity, created: true };
}
