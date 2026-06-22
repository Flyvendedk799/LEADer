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
import { isBroadFrameworkTender } from "./tender-quality";
export { DISCOVERY_PRESETS } from "./presets";

export interface DiscoverySearchInput {
  query: string;
  queryVariants?: string[];
  requiredTerms?: string[];
  excludedTerms?: string[];
  workspace?: Workspace;
  maxResults?: number;
  includeWeb?: boolean;
  includeSources?: boolean;
  provider?: "auto" | "tavily" | "brave" | "serper" | "none";
  resultKind?: "all" | "opportunities" | "sources";
  useAiPlanner?: boolean;
  onProgress?: (message: string) => Promise<void> | void;
}

export interface DiscoveryCandidateDto {
  id: string;
  candidateKind: "opportunity" | "source";
  title: string;
  description?: string;
  summaryDa?: string;
  rawContent?: string;
  detailText?: string;
  url?: string;
  organization?: string;
  location?: string;
  country?: string;
  region?: string;
  category?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  priceText?: string;
  deadline?: string;
  postedAt?: string;
  freshness: "active" | "expired" | "stale" | "unknown";
  applicationRoute: ApplicationRoute;
  contacts: { name?: string; email?: string; role?: string }[];
  attachments: { label?: string; url: string; kind?: string }[];
  sourceName: string;
  sourceKind: "web-search" | "source-scan";
  provider: string;
  query: string;
  matchScore: number;
  scoreBreakdown: ScoreBreakdown;
  reasons: string[];
  signals: string[];
  feedback?: "GOOD_RESULT" | "NON_LEAD";
  feedbackSuppressed?: boolean;
  alreadySaved?: { id: string; title: string };
  alreadySavedSource?: { id: string; name: string };
}

export interface DiscoverySearchResult {
  candidates: DiscoveryCandidateDto[];
  queries: string[];
  searchPlan: DiscoverySearchPlan;
  provider: string;
  providerConfigured: boolean;
  sourceScanCount: number;
  warnings: string[];
}

export interface DiscoverySearchPlan {
  queries: string[];
  focusTerms: string[];
  avoidTerms: string[];
  rationale: string;
  usedAi: boolean;
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

type UdbudDkResultData = {
  titel?: string;
  ordregiver?: string;
  ordregiverId?: string;
  publiceringsdato?: string;
  cpvKode?: string;
  cpvTitel?: string;
  formulartype?: string;
  formulartypeKode?: string;
  tidsfrister?: string[];
  alleOrdregivere?: string[];
  anslaaetVaerdiValuta?: string;
  beskrivelse?: string;
  bkSubType?: string;
  bkSubTypeKode?: string;
  erAendring?: boolean;
};

type UdbudDkResult = {
  dataDa?: UdbudDkResultData;
  dataEn?: UdbudDkResultData;
  noticeId?: string;
  noticeVersion?: string;
  noticePublicationNumber?: string;
};

type UdbudDkSearchResponse = {
  resultatElementDtoList?: UdbudDkResult[];
  totaltAntalResultater?: number;
};

export type DiscoveryCandidateSaveInput = {
  id?: string;
  candidateKind?: "opportunity" | "source";
  title: string;
  description?: string;
  summaryDa?: string;
  rawContent?: string;
  detailText?: string;
  url?: string;
  organization?: string;
  location?: string;
  country?: string;
  region?: string;
  category?: string;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  priceText?: string;
  deadline?: string;
  postedAt?: string;
  freshness?: "active" | "expired" | "stale" | "unknown";
  applicationRoute?: ApplicationRoute;
  contacts?: { name?: string; email?: string; role?: string }[];
  attachments?: { label?: string; url: string; kind?: string }[];
  sourceName?: string;
  sourceKind?: "web-search" | "source-scan";
  provider?: string;
  query?: string;
  signals?: string[];
  feedback?: "GOOD_RESULT" | "NON_LEAD";
  feedbackSuppressed?: boolean;
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
const MAX_ATTACHMENTS = 8;
const SEARCH_PROVIDER_TIMEOUT_MS = Math.max(3000, Number(process.env.SEARCH_PROVIDER_TIMEOUT_MS || 12000));
const STALE_WITHOUT_DEADLINE_DAYS = 180;
const MAX_FEEDBACK_ROWS = 500;

type DiscoveryFeedbackValue = "GOOD_RESULT" | "NON_LEAD";

interface FeedbackFeatureInput {
  id?: string;
  title?: string;
  description?: string;
  rawContent?: string;
  url?: string | null;
  candidateKind?: "opportunity" | "source" | string | null;
  category?: string | null;
  applicationRoute?: ApplicationRoute | string | null;
  sourceName?: string | null;
  provider?: string | null;
  query?: string | null;
  signals?: string[];
}

interface FeedbackModelRow extends FeedbackFeatureInput {
  candidateId: string;
  feedback: DiscoveryFeedbackValue;
  features?: string[] | null;
}

interface FeedbackFeatureCount {
  good: number;
  nonLead: number;
}

interface FeedbackSignalModel {
  byCandidateId: Map<string, DiscoveryFeedbackValue>;
  byUrl: Map<string, DiscoveryFeedbackValue>;
  featureCounts: Map<string, FeedbackFeatureCount>;
  rowCount: number;
}

interface FeedbackInsight {
  feedback?: DiscoveryFeedbackValue;
  delta: number;
  suppress: boolean;
  notes: string[];
  signals: string[];
  features: string[];
}

interface SearchMemory {
  goodExamples: string[];
  savedSources: string[];
  nonLeadExamples: string[];
  goodTerms: string[];
  nonLeadTerms: string[];
}

interface SavedDiscoveryIndex {
  opportunityHashes: Set<string>;
  opportunityUrls: Set<string>;
  opportunityTitleKeys: Set<string>;
  sourceUrls: Set<string>;
}

const CURATED_DK_DISCOVERY_SOURCES = [
  {
    name: "EHSYS — aktuelle indkøb",
    url: "https://ehsys.dk/indkoeb/alle",
    type: "PUBLIC_WEB" as SourceType,
    parserKey: "ehsys-procurement",
    keywords: [] as string[],
    country: "DK",
    region: undefined as string | undefined,
    category: "Tender",
  },
] as const;

function cleanText(value = "", max = 1600): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function canonicalUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach(
      (param) => url.searchParams.delete(param),
    );
    return `${url.origin}${url.pathname}${url.search}`.toLowerCase().replace(/\/$/, "");
  } catch {
    return value.toLowerCase().trim();
  }
}

function titleKey(value?: string | null): string | undefined {
  const key = value
    ?.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key && key.length >= 16 ? key : undefined;
}

function uniqueStrings(values: (string | undefined | null)[], max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = cleanText(value || "", 160);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

function addFeature(features: Set<string>, value?: string | null) {
  const clean = value?.toLowerCase().replace(/\s+/g, " ").trim();
  if (clean) features.add(clean);
}

const FEEDBACK_STOPWORDS = new Set([
  "and", "eller", "for", "fra", "med", "the", "this", "that", "til", "som", "der",
  "det", "den", "din", "dit", "kan", "har", "med", "you", "your", "vores", "about",
  "home", "page", "site", "https", "http", "www", "com", "dk",
]);

function feedbackTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9æøå]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !FEEDBACK_STOPWORDS.has(token))
    .slice(0, 24);
}

function feedbackFeaturesFromCandidate(input: FeedbackFeatureInput): string[] {
  const features = new Set<string>();
  const url = canonicalUrl(input.url);
  if (url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "");
      const segments = parsed.pathname
        .split("/")
        .map((segment) => segment.trim().toLowerCase())
        .filter(Boolean);
      addFeature(features, `host:${host}`);
      if (segments[0]) addFeature(features, `path1:${host}/${segments[0]}`);
      if (segments[0] && segments[1]) addFeature(features, `path2:${host}/${segments[0]}/${segments[1]}`);
      for (const segment of segments.slice(0, 4)) {
        for (const token of feedbackTokens(segment)) addFeature(features, `path-token:${token}`);
      }
    } catch {
      addFeature(features, `url:${url}`);
    }
  }

  if (input.candidateKind) addFeature(features, `kind:${input.candidateKind}`);
  if (input.applicationRoute) addFeature(features, `route:${input.applicationRoute}`);
  if (input.category) addFeature(features, `category:${input.category}`);
  if (input.sourceName) addFeature(features, `source:${input.sourceName}`);
  if (input.provider) addFeature(features, `provider:${input.provider}`);
  for (const signal of input.signals ?? []) addFeature(features, `signal:${signal}`);

  const text = cleanText(
    [input.title, input.description, input.rawContent, input.query].filter(Boolean).join(" "),
    1200,
  );
  for (const token of feedbackTokens(text)) addFeature(features, `token:${token}`);

  return [...features].slice(0, 64);
}

function feedbackFeatureWeight(feature: string): number {
  if (feature.startsWith("path2:")) return 4.5;
  if (feature.startsWith("path1:")) return 2.5;
  if (feature.startsWith("source:")) return 2;
  if (feature.startsWith("path-token:")) return 1.5;
  if (feature.startsWith("host:")) return 1;
  if (feature.startsWith("signal:")) return 0.9;
  if (feature.startsWith("category:")) return 0.8;
  if (feature.startsWith("route:")) return 0.7;
  if (feature.startsWith("kind:")) return 0.4;
  if (feature.startsWith("token:")) return 0.8;
  return 0.5;
}

function emptyFeedbackModel(): FeedbackSignalModel {
  return {
    byCandidateId: new Map(),
    byUrl: new Map(),
    featureCounts: new Map(),
    rowCount: 0,
  };
}

function buildFeedbackSignalModel(rows: FeedbackModelRow[]): FeedbackSignalModel {
  const model = emptyFeedbackModel();
  model.rowCount = rows.length;

  for (const row of rows) {
    if (!model.byCandidateId.has(row.candidateId)) {
      model.byCandidateId.set(row.candidateId, row.feedback);
    }
    const url = canonicalUrl(row.url);
    if (url && !model.byUrl.has(url)) model.byUrl.set(url, row.feedback);

    const features = row.features?.length ? row.features : feedbackFeaturesFromCandidate(row);
    for (const feature of new Set(features)) {
      const current = model.featureCounts.get(feature) ?? { good: 0, nonLead: 0 };
      if (row.feedback === "GOOD_RESULT") current.good += 1;
      if (row.feedback === "NON_LEAD") current.nonLead += 1;
      model.featureCounts.set(feature, current);
    }
  }

  return model;
}

function isMissingDiscoveryFeedbackTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  return record.code === "P2021" || /DiscoveryFeedback.*does not exist|table .*DiscoveryFeedback.* does not exist/i.test(message);
}

async function withOptionalDiscoveryFeedback<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (isMissingDiscoveryFeedbackTable(error)) return fallback;
    throw error;
  }
}

async function loadFeedbackSignalModel(ownerId: string): Promise<FeedbackSignalModel> {
  const rows = await withOptionalDiscoveryFeedback(
    () =>
      db.discoveryFeedback.findMany({
        where: { ownerId },
        orderBy: { updatedAt: "desc" },
        take: MAX_FEEDBACK_ROWS,
        select: {
          candidateId: true,
          url: true,
          title: true,
          candidateKind: true,
          feedback: true,
          features: true,
          sourceName: true,
          provider: true,
          query: true,
        },
      }),
    [],
  );
  return buildFeedbackSignalModel(rows);
}

function readableFeature(feature: string): string | undefined {
  const [, value] = feature.split(/:(.+)/);
  if (!value) return undefined;
  if (feature.startsWith("token:") || feature.startsWith("path-token:")) return value;
  if (feature.startsWith("category:") || feature.startsWith("signal:")) return value;
  return undefined;
}

function topFeedbackTerms(model: FeedbackSignalModel, type: DiscoveryFeedbackValue, max = 8): string[] {
  return [...model.featureCounts.entries()]
    .map(([feature, counts]) => ({
      term: readableFeature(feature),
      score: type === "GOOD_RESULT" ? counts.good - counts.nonLead : counts.nonLead - counts.good,
    }))
    .filter((item): item is { term: string; score: number } => Boolean(item.term) && item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.term)
    .filter((term, index, arr) => arr.indexOf(term) === index)
    .slice(0, max);
}

async function loadSearchMemory(ownerId: string, feedbackModel: FeedbackSignalModel): Promise<SearchMemory> {
  const [opportunities, sources, feedbackRows] = await Promise.all([
    db.opportunity.findMany({
      where: { ownerId, status: { notIn: ["LOST", "ARCHIVED"] } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 10,
      select: { title: true, category: true, organization: true, url: true },
    }),
    db.source.findMany({
      where: { ownerId, enabled: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { name: true, category: true, keywords: true, url: true },
    }),
    withOptionalDiscoveryFeedback(
      () =>
        db.discoveryFeedback.findMany({
          where: { ownerId },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: { title: true, sourceName: true, feedback: true },
        }),
      [],
    ),
  ]);

  const goodExamples = uniqueStrings(
    opportunities.map((opp) =>
      [opp.title, opp.organization, opp.category].filter(Boolean).join(" · "),
    ),
    8,
  );
  const savedSources = uniqueStrings(
    sources.map((source) =>
      [source.name, source.category, source.keywords.slice(0, 4).join(" ")].filter(Boolean).join(" · "),
    ),
    6,
  );
  const nonLeadExamples = uniqueStrings(
    feedbackRows
      .filter((row) => row.feedback === "NON_LEAD")
      .map((row) => [row.title, row.sourceName].filter(Boolean).join(" · ")),
    6,
  );

  return {
    goodExamples,
    savedSources,
    nonLeadExamples,
    goodTerms: topFeedbackTerms(feedbackModel, "GOOD_RESULT"),
    nonLeadTerms: topFeedbackTerms(feedbackModel, "NON_LEAD"),
  };
}

function evaluateFeedbackSignal(
  model: FeedbackSignalModel | undefined,
  candidate: FeedbackFeatureInput & { id: string },
): FeedbackInsight {
  const features = feedbackFeaturesFromCandidate(candidate);
  if (!model || model.rowCount === 0) {
    return { delta: 0, suppress: false, notes: [], signals: [], features };
  }

  const exact =
    model.byCandidateId.get(candidate.id) ??
    (canonicalUrl(candidate.url) ? model.byUrl.get(canonicalUrl(candidate.url)!) : undefined);
  if (exact === "NON_LEAD") {
    return {
      feedback: exact,
      delta: -100,
      suppress: true,
      notes: ["Tidligere markeret som non-lead"],
      signals: ["learned non-lead"],
      features,
    };
  }

  let goodScore = exact === "GOOD_RESULT" ? 8 : 0;
  let nonLeadScore = 0;
  for (const feature of features) {
    const count = model.featureCounts.get(feature);
    if (!count) continue;
    const weight = feedbackFeatureWeight(feature);
    goodScore += count.good * weight;
    nonLeadScore += count.nonLead * weight;
  }

  const goodConfidence = goodScore - nonLeadScore;
  const nonLeadConfidence = nonLeadScore - goodScore;
  if (nonLeadConfidence >= 4) {
    return {
      delta: -Math.min(42, Math.round(12 + nonLeadConfidence * 3)),
      suppress: nonLeadConfidence >= 9,
      notes: ["Feedback: ligner tidligere non-leads"],
      signals: ["learned non-lead"],
      features,
    };
  }
  if (goodConfidence >= 3) {
    return {
      feedback: exact,
      delta: Math.min(22, Math.round(8 + goodConfidence * 2)),
      suppress: false,
      notes: ["Feedback: ligner tidligere gemte leads"],
      signals: ["learned good"],
      features,
    };
  }

  return {
    feedback: exact,
    delta: exact === "GOOD_RESULT" ? 10 : 0,
    suppress: false,
    notes: exact === "GOOD_RESULT" ? ["Tidligere gemt som godt lead"] : [],
    signals: exact === "GOOD_RESULT" ? ["learned good"] : [],
    features,
  };
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

function normalizeSearchQuery(value: string): string | undefined {
  const clean = cleanText(value, 220)
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return clean.length >= 3 ? clean : undefined;
}

function buildAvoidClause(avoidTerms: string[]): string {
  return avoidTerms
    .filter((term) => /^[a-z0-9æøå-]{4,}$/i.test(term))
    .slice(0, 4)
    .map((term) => `-${term}`)
    .join(" ");
}

function deterministicSearchPlan(
  query: string,
  workspace: Workspace,
  resultKind: DiscoverySearchInput["resultKind"],
  memory: SearchMemory,
): DiscoverySearchPlan {
  const q = cleanText(query, 280);
  const country = workspace === "DK" ? "Danmark" : "Europe remote";
  const avoidTerms = uniqueStrings(
    [
      ...memory.nonLeadTerms,
      "guide",
      "kursus",
      "nyhed",
      "artikel",
      "blog",
      "definition",
    ],
    8,
  );
  const avoidClause = buildAvoidClause(avoidTerms);
  const goodTerms = uniqueStrings(
    [
      ...memory.goodTerms,
      "software",
      "teknisk sparring",
      "produktroadmap",
      "MVP",
      "prototype",
      "AI",
      "integration",
      "tilbudsfrist",
    ],
    10,
  );
  const savedSourceTerms = memory.savedSources.slice(0, 3).join(" ");
  const concreteOpportunityQueries =
    workspace === "DK"
      ? [
          `${q} ${country} tilbudsfrist software udvikling teknisk sparring ${avoidClause}`,
          `${q} site:beyondbeta.ehsys.dk/indkoeb/tilbud/indsend OR site:ivaerksaetter.ehsys.dk/indkoeb/tilbud/indsend teknisk produkt roadmap software`,
          `${q} ${country} "indsend tilbud" "tilbudsfrist" software MVP prototype`,
          `${q} ${country} SMV Digital digitalisering software integration leverandør voucher ${avoidClause}`,
          `${q} ${country} AI automatisering proof of concept fullstack udvikler tilskud ${avoidClause}`,
        ]
      : [
          `${q} international fjernarbejde remote software projekt startup MVP fullstack ${avoidClause}`,
          `${q} international grant voucher innovation software supplier tilskud leverandør ${avoidClause}`,
          `${q} Europe remote dansk softwareudvikler AI automation consultant`,
        ];
  const sourceQueries =
    workspace === "DK"
      ? [
          `${q} ${country} udbudsliste software IT indkøb portal`,
          `${q} ${country} aktuelle udbud software udvikling leverandør oversigt`,
          `${q} ${country} tender portal startup digitalisering voucher`,
          savedSourceTerms ? `${q} ${savedSourceTerms}` : "",
        ]
      : [
          `${q} software tenders startup grants source list dansk international`,
          `${q} procurement portal innovation voucher software tilskud international`,
        ];
  const terms =
    resultKind === "sources"
      ? [q, ...sourceQueries]
      : resultKind === "opportunities"
        ? [q, ...concreteOpportunityQueries]
        : [q, ...concreteOpportunityQueries.slice(0, 4), ...sourceQueries.slice(0, 2)];

  return {
    queries: uniqueStrings(terms.map((term) => normalizeSearchQuery(term)), 7),
    focusTerms: goodTerms,
    avoidTerms,
    rationale:
      workspace === "DK"
        ? "Søger bredt efter aktive danske softwareopgaver, EHSYS-lignende indkøb og relevante udbudskilder."
        : "Searches for funded software, prototype, AI, and grant-backed supplier opportunities while preserving Danish intent.",
    usedAi: false,
  };
}

function parseAiSearchPlan(data: unknown): Partial<DiscoverySearchPlan> | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const queries = Array.isArray(obj.queries)
    ? obj.queries.map((q) => (typeof q === "string" ? normalizeSearchQuery(q) : undefined)).filter(Boolean) as string[]
    : [];
  if (!queries.length) return null;
  const strings = (value: unknown, max: number) =>
    Array.isArray(value)
      ? uniqueStrings(value.map((item) => (typeof item === "string" ? item : undefined)), max)
      : [];
  return {
    queries,
    focusTerms: strings(obj.focusTerms, 10),
    avoidTerms: strings(obj.avoidTerms, 8),
    rationale: typeof obj.rationale === "string" ? cleanText(obj.rationale, 220) : "",
  };
}

async function buildSearchPlan(
  query: string,
  workspace: Workspace,
  resultKind: DiscoverySearchInput["resultKind"],
  user: UserProfile,
  memory: SearchMemory,
): Promise<DiscoverySearchPlan> {
  const fallback = deterministicSearchPlan(query, workspace, resultKind, memory);
  try {
    const result = await runAi({
      action: "searchQueries",
      context: cleanText(query, 500),
      profile: profileText(user),
      extra: JSON.stringify({
        workspace,
        resultKind: resultKind ?? "all",
        goodExamples: memory.goodExamples,
        savedSources: memory.savedSources,
        nonLeadExamples: memory.nonLeadExamples,
        goodTerms: memory.goodTerms,
        nonLeadTerms: memory.nonLeadTerms,
      }),
      aiKeys: user.aiKeys,
    });
    if (result.mocked) return fallback;
    const aiPlan = parseAiSearchPlan(result.data);
    if (!aiPlan) return fallback;
    return {
      queries: uniqueStrings([...aiPlan.queries!, ...fallback.queries], 7),
      focusTerms: uniqueStrings([...(aiPlan.focusTerms ?? []), ...fallback.focusTerms], 10),
      avoidTerms: uniqueStrings([...(aiPlan.avoidTerms ?? []), ...fallback.avoidTerms], 8),
      rationale: aiPlan.rationale || fallback.rationale,
      usedAi: !result.mocked,
    };
  } catch {
    return fallback;
  }
}

function cleanSearchTerms(values: string[] = [], limit = 12) {
  return uniqueStrings(values.map((value) => cleanText(value, 80).toLowerCase()).filter(Boolean), limit);
}

function queryTerm(term: string, exclude = false) {
  const cleaned = cleanText(term, 80);
  if (!cleaned) return "";
  const value = /\s/.test(cleaned) ? `"${cleaned}"` : cleaned;
  return exclude ? `-${value}` : value;
}

function withHardSearchModifiers(queries: string[], requiredTerms: string[] = [], excludedTerms: string[] = []) {
  const required = cleanSearchTerms(requiredTerms).map((term) => queryTerm(term));
  const excluded = cleanSearchTerms(excludedTerms).map((term) => queryTerm(term, true));
  const modifiers = [...required, ...excluded].filter(Boolean).join(" ");
  if (!modifiers) return uniqueStrings(queries.map((query) => normalizeSearchQuery(query)), 7);
  return uniqueStrings(
    queries.map((query) => normalizeSearchQuery([query, modifiers].filter(Boolean).join(" "))),
    7,
  );
}

function candidateContains(text: string, term: string) {
  const cleaned = term.toLowerCase().trim();
  if (!cleaned) return true;
  return text.includes(cleaned);
}

function filterBySearchTerms<T extends Pick<DiscoveryCandidateDto, "title" | "description" | "rawContent" | "detailText" | "organization" | "sourceName" | "category" | "url">>(
  candidates: T[],
  requiredTerms: string[] = [],
  excludedTerms: string[] = [],
) {
  const required = cleanSearchTerms(requiredTerms);
  const excluded = cleanSearchTerms(excludedTerms);
  if (!required.length && !excluded.length) return { candidates, removed: 0 };

  const filtered = candidates.filter((candidate) => {
    const text = [
      candidate.title,
      candidate.description,
      candidate.rawContent,
      candidate.detailText,
      candidate.organization,
      candidate.sourceName,
      candidate.category,
      candidate.url,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const hasRequired = required.every((term) => candidateContains(text, term));
    const hasExcluded = excluded.some((term) => candidateContains(text, term));
    return hasRequired && !hasExcluded;
  });
  return { candidates: filtered, removed: candidates.length - filtered.length };
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

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDaDate(value?: string | Date | null): string | undefined {
  const date = parseMaybeDate(value);
  if (!date) return undefined;
  return new Intl.DateTimeFormat("da-DK", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function absoluteUrl(href: string | undefined, pageUrl: string): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, pageUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function attachmentKind(url: string, label = ""): string | undefined {
  const hay = `${url} ${label}`.toLowerCase();
  if (/\.pdf(?:[?#]|$)|\bpdf\b/.test(hay)) return "pdf";
  if (/\.(?:docx?|odt)(?:[?#]|$)|\bdokument\b|\bdocument\b/.test(hay)) return "doc";
  if (/\.(?:xlsx?|csv)(?:[?#]|$)|\bexcel\b|\bark\b|\bsheet\b/.test(hay)) return "sheet";
  if (/\.(?:png|jpe?g|webp)(?:[?#]|$)/.test(hay)) return "image";
  if (/\bdownload\b|\bhent\b|\bbilag\b|\battachment\b|\bmateriale\b/.test(hay)) return "link";
  return undefined;
}

function isAttachmentLink(url: string, label = ""): boolean {
  return Boolean(attachmentKind(url, label));
}

function attachmentLabel(url: string, label?: string): string {
  const cleaned = cleanText(label || "", 90);
  if (cleaned) return cleaned;
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
    return cleanText(name || url, 90);
  } catch {
    return cleanText(url, 90);
  }
}

function dedupeAttachments(
  attachments: { label?: string; url: string; kind?: string }[] = [],
): { label?: string; url: string; kind?: string }[] {
  const seen = new Set<string>();
  const out: { label?: string; url: string; kind?: string }[] = [];
  for (const attachment of attachments) {
    if (!attachment.url || seen.has(attachment.url)) continue;
    seen.add(attachment.url);
    out.push({
      label: attachmentLabel(attachment.url, attachment.label),
      url: attachment.url,
      kind: attachment.kind || attachmentKind(attachment.url, attachment.label),
    });
    if (out.length >= MAX_ATTACHMENTS) break;
  }
  return out;
}

function extractAttachments(
  $: cheerio.CheerioAPI,
  pageUrl: string,
): { label?: string; url: string; kind?: string }[] {
  const attachments: { label?: string; url: string; kind?: string }[] = [];
  const selfKind = attachmentKind(pageUrl);
  if (selfKind) {
    attachments.push({
      label: attachmentLabel(pageUrl),
      url: pageUrl,
      kind: selfKind,
    });
  }

  $("a[href]").each((_, el) => {
    if (attachments.length >= MAX_ATTACHMENTS * 2) return;
    const $el = $(el);
    const url = absoluteUrl($el.attr("href"), pageUrl);
    if (!url) return;
    const label = cleanText($el.text() || $el.attr("title") || $el.attr("aria-label") || "", 120);
    if (!isAttachmentLink(url, label)) return;
    attachments.push({
      label: attachmentLabel(url, label),
      url,
      kind: attachmentKind(url, label),
    });
  });

  return dedupeAttachments(attachments);
}

function extractPriceText(text: string): string | undefined {
  if (!text) return undefined;
  const lines = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => cleanText(line, 260))
    .filter(Boolean);
  const matches = lines.filter((line) =>
    /(?:\bpris\b|\bbudget\b|\bhonorar\b|\btilskud\b|\bbevilling\b|\bramme\b|\bbeløb\b|\bvaerdi\b|\bværdi\b|\bdkk\b|\bkr\.?\b|€|eur|\d[\d., ]{2,}\s*(?:kr|dkk|kroner))/i.test(line),
  );
  return matches.length ? cleanText([...new Set(matches)].slice(0, 3).join(" "), 520) : undefined;
}

function freshnessFor(
  candidate: OpportunityCandidate,
  kind: DiscoveryCandidateDto["candidateKind"],
): DiscoveryCandidateDto["freshness"] {
  if (kind === "source") return "active";
  const deadline = parseMaybeDate(candidate.deadline);
  if (deadline) return deadline.getTime() >= Date.now() ? "active" : "expired";
  const postedAt = parseMaybeDate(candidate.postedAt);
  if (postedAt && daysSince(postedAt) > STALE_WITHOUT_DEADLINE_DAYS) return "stale";
  return "unknown";
}

function isConcreteOpportunityUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    const href = parsed.toString().toLowerCase();
    const hasNoticeId = [...parsed.searchParams.keys()].some((key) => key.toLowerCase() === "noticeid");
    return (
      (hostname === "udbud.dk" && pathname === "/detaljevisning" && hasNoticeId) ||
      (hostname.endsWith("udbud.dk") && /\/pages\/tenders\/showtender/.test(pathname)) ||
      (hostname === "eu.eu-supply.com" && /\/ctm\/supplier\/publicpurchase\/|\/app\/rfq\//.test(pathname)) ||
      (hostname.endsWith("mercell.com") && /\/udbud\/\d+\//.test(pathname)) ||
      (hostname.endsWith("ethics.dk") && /\/ethics\/eo#\/tender/.test(href)) ||
      (hostname.endsWith("comdia.com") && /\/tender\//.test(pathname)) ||
      (hostname === "ted.europa.eu" && /\/notice\//.test(pathname)) ||
      /\/indkoeb\/tilbud\/indsend\/|\/indkøb\/tilbud\/indsend\/|\/opportunit(?:y|ies)\/|\/tender\/|\/udbud\/[^/]{8,}/.test(
        pathname,
      )
    );
  } catch {
    return false;
  }
}

function isSourceLikeCandidate(candidate: OpportunityCandidate, detailText: string): boolean {
  if (isConcreteOpportunityUrl(candidate.url)) return false;
  const text = `${candidate.title} ${candidate.description ?? ""} ${detailText}`.toLowerCase();
  const hasConcreteDeadline =
    Boolean(candidate.deadline) ||
    /tilbudsfrist|ansøgningsfrist|ansøgningsfrist|deadline|frist for tilbud|submission deadline/.test(text);
  const hasApplyCue =
    candidate.applicationRoute === "APPLICATION" ||
    /indsend tilbud|send tilbud|ansøg nu|ansoeg nu|apply now|submit proposal|giv tilbud/.test(text);
  const sourceCue =
    /find tenders?|match your company|udbudsportal|udbudsportalen|udbudsliste|tender portal|procurement platform|alle udbud|aktuelle indkøb|aktuelle indkoeb|liste over|oversigt over|samlet oversigt|database|markedsplads|hvor finder|it-udbud|herkules|offentlige udbud|søg efter udbud|soeg efter udbud/.test(
      text,
    );
  const pathCue = (() => {
    if (!candidate.url) return false;
    try {
      const pathname = new URL(candidate.url).pathname.toLowerCase();
      return /\/alle\/?$|\/sources?\/?$|\/kilder?\/?$|\/udbud\/?$|\/indkoeb\/alle\/?$|\/indkøb\/alle\/?$/.test(pathname);
    } catch {
      return false;
    }
  })();

  if (pathCue) return true;
  if (!sourceCue) return false;
  return !hasConcreteDeadline || !hasApplyCue || /herkules|it-udbud|portal|database|liste|oversigt/.test(text);
}

function buildDanishSummary(
  candidate: OpportunityCandidate,
  kind: DiscoveryCandidateDto["candidateKind"],
  priceText?: string,
): string {
  const deadline = formatDaDate(candidate.deadline);
  const postedAt = formatDaDate(candidate.postedAt);
  const budget =
    candidate.budgetMin != null && candidate.budgetMax != null
      ? `${candidate.budgetMin.toLocaleString("da-DK")}-${candidate.budgetMax.toLocaleString("da-DK")} ${candidate.currency ?? "DKK"}`
      : candidate.budgetMax != null
        ? `op til ${candidate.budgetMax.toLocaleString("da-DK")} ${candidate.currency ?? "DKK"}`
        : candidate.budgetMin != null
          ? `fra ${candidate.budgetMin.toLocaleString("da-DK")} ${candidate.currency ?? "DKK"}`
          : undefined;
  const org = candidate.organization ? ` hos ${candidate.organization}` : "";
  const body = cleanText(candidate.description || candidate.rawContent || "", 360);

  if (kind === "source") {
    return cleanText(
      [
        `Kildeside med relevante udbud eller opgavelister${org}.`,
        body ? `Den ser ud til at være nyttig som løbende søgekilde: ${body}` : "",
      ].join(" "),
      760,
    );
  }

  return cleanText(
    [
      `Mulig opgave${org}: ${body || candidate.title}.`,
      deadline ? `Tilbudsfrist: ${deadline}.` : "",
      budget ? `Budget/pris: ${budget}.` : priceText ? `Prisinfo: ${priceText}.` : "",
      postedAt ? `Fundet/annonceret: ${postedAt}.` : "",
    ].join(" "),
    760,
  );
}

function categoryFromText(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/\bai\b|llm|kunstig intelligens|automation|automatisering|chatbot/.test(t)) return "AI / automation";
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
  if (/\bai\b|llm|automation|automatisering/.test(text)) signals.push("AI");
  if (/voucher|tilskud|bevilling|smv.?digital|innobooster/.test(text)) signals.push("funding");
  if (/udbud|tender|procurement/.test(text)) signals.push("udbud");
  if (/kontakt|contact|email|e-mail|@/.test(text)) signals.push("contactable");
  return [...new Set(signals)].slice(0, 6);
}

function discoveryFitAdjustment(c: OpportunityCandidate): { delta: number; notes: string[]; signals: string[] } {
  const text = `${c.title} ${c.description ?? ""} ${c.rawContent ?? ""}`.toLowerCase();
  const positive = [
    "teknisk", "technical", "software", "softwareudvikling", "udvikling",
    "developer", "udvikler", "app", "web", "platform", "produkt", "product",
    "roadmap", "mvp", "prototype", "poc", "proof of concept", "algoritme",
    "algorithm", "ai", "automation", "automatisering", "data", "integration",
    "security", "sikkerhed", "digitalisering", "system", "api", "saas",
  ];
  const negative = [
    "juridisk", "legal", "ip-rettigheder", "ip rights", "branding", "content",
    "salg", "sales", "fundraising", "soft funding", "investor readiness",
    "kommunikation", "communication", "regulatory", "classification", "claims",
    "dossier", "biosafety", "lab training", "masterclass", "masterclasses",
    "kapitalrejsning",
  ];
  const positiveHits = positive.filter((term) =>
    term === "ai" ? /\bai\b/.test(text) : text.includes(term),
  );
  const negativeHits = negative.filter((term) => text.includes(term));
  let delta = 0;
  const notes: string[] = [];
  const signals: string[] = [];

  if (positiveHits.length >= 2) {
    delta += 14;
    notes.push("Stærkt teknisk/product signal");
    signals.push("technical fit");
  } else if (positiveHits.length === 1) {
    delta += 6;
    notes.push("Noget teknisk/product signal");
  } else {
    delta -= 18;
    notes.push("Svagt teknisk/software signal");
  }

  if (negativeHits.length >= 2) {
    delta -= 35;
    notes.push("Ser ud til at være rådgivning/admin frem for kode");
    signals.push("low fit");
  } else if (negativeHits.length === 1) {
    delta -= 22;
    notes.push("Muligvis ikke en kodningsopgave");
  }

  if (/beyond beta|ehsys|indkøb|indkoeb|tilbudsfrist/.test(text) && positiveHits.length > 0) {
    delta += 6;
    signals.push("supplier lead");
  }

  return { delta, notes, signals };
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

async function fetchReadablePage(
  url?: string,
): Promise<{
  title?: string;
  description?: string;
  text?: string;
  attachments?: { label?: string; url: string; kind?: string }[];
}> {
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
    const finalUrl = res.url || url;
    if (attachmentKind(finalUrl) === "pdf") {
      return {
        title: attachmentLabel(finalUrl),
        attachments: dedupeAttachments([{ label: attachmentLabel(finalUrl), url: finalUrl, kind: "pdf" }]),
      };
    }
    const $ = cheerio.load(res.text);
    $("script,style,noscript,svg").remove();
    const title = cleanText($("h1").first().text() || $("title").text(), 220);
    const description = cleanText(
      $('meta[name="description"]').attr("content") || $("p").first().text(),
      700,
    );
    const text = cleanText($("body").text(), 5000);
    const attachments = extractAttachments($, finalUrl);
    return { title, description, text, attachments };
  } catch {
    const kind = url ? attachmentKind(url) : undefined;
    return kind && url
      ? { attachments: [{ label: attachmentLabel(url), url, kind }] }
      : { attachments: [] };
  }
}

async function enrichWithDetailPage(input: OpportunityCandidate): Promise<OpportunityCandidate> {
  if (!input.url) return input;
  const page = await fetchReadablePage(input.url);
  if (!page.title && !page.description && !page.text && !page.attachments?.length) return input;

  const rawContent = cleanText(
    [input.rawContent, page.description, page.text].filter(Boolean).join("\n"),
    9000,
  );
  const attachments = dedupeAttachments([...(input.attachments ?? []), ...(page.attachments ?? [])]);

  return enrichCandidate({
    ...input,
    description: cleanText([input.description, page.description].filter(Boolean).join("\n"), 1200) || input.description,
    rawContent: rawContent || input.rawContent,
    attachments,
  });
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
    signal: AbortSignal.timeout(SEARCH_PROVIDER_TIMEOUT_MS),
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

async function braveSearch(
  query: string,
  maxResults: number,
  apiKey: string,
  workspace: Workspace,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    search_lang: "da",
    count: String(Math.min(maxResults, 20)),
    safesearch: "moderate",
  });
  if (workspace === "DK") params.set("country", "DK");
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(SEARCH_PROVIDER_TIMEOUT_MS),
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

async function serperSearch(
  query: string,
  maxResults: number,
  apiKey: string,
  workspace: Workspace,
): Promise<SearchResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      ...(workspace === "DK" ? { gl: "dk" } : {}),
      hl: "da",
      num: Math.min(maxResults, 20),
    }),
    signal: AbortSignal.timeout(SEARCH_PROVIDER_TIMEOUT_MS),
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

function isTenderSearchIntent(query: string, queries: string[] = []) {
  return /udbud|tender|procurement|tilbudsfrist|udbudsfrist|public rft|eu-supply|mercell|detaljevisning|offentlig/.test(
    [query, ...queries].join(" ").toLowerCase(),
  );
}

function sanitizeUdbudDkQuery(value?: string | null) {
  const stop = new Set([
    "and",
    "danmark",
    "denmark",
    "detaljevisning",
    "dk",
    "eu",
    "mercell",
    "procurement",
    "public",
    "publicpurchase",
    "rft",
    "site",
    "supplier",
    "tender",
    "tilbudsfrist",
    "udbud",
    "udbudsfrist",
  ]);
  const terms = cleanText(value ?? "", 260)
    .replace(/site:\S+/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[-+()"“”]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 3 && !stop.has(term) && !/^[/:.]+$/.test(term));
  return uniqueStrings(terms, 7).join(" ");
}

function udbudDkSearchSeeds(query: string, queries: string[]) {
  return uniqueStrings(
    [
      sanitizeUdbudDkQuery(query),
      "software udvikling",
      ...queries.map((item) => sanitizeUdbudDkQuery(item)),
      "softwareudvikling",
      "it konsulent",
      "digitalisering",
    ],
    4,
  );
}

function udbudDkNoticeUrl(result: Pick<UdbudDkResult, "noticeId" | "noticeVersion" | "noticePublicationNumber">) {
  const params = new URLSearchParams({
    noticeId: result.noticeId ?? "",
    noticeVersion: result.noticeVersion ?? "01",
    noticePublicationNumber: result.noticePublicationNumber ?? "",
  });
  return `https://udbud.dk/detaljevisning?${params.toString()}`;
}

function parseDanishDisplayDate(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^(\d{2})-(\d{2})-(20\d{2})$/);
  if (!match) return undefined;
  const date = new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function earliestFutureDeadline(values: string[] = []) {
  const now = Date.now() - 12 * 60 * 60 * 1000;
  const dates: Date[] = [];
  for (const value of values) {
    const date = parseMaybeDate(value);
    if (date && date.getTime() >= now) dates.push(date);
  }
  dates.sort((a, b) => a.getTime() - b.getTime());
  return dates[0] ?? null;
}

function udbudDkResultToCandidate(result: UdbudDkResult, query: string): OpportunityCandidate | null {
  const data = result.dataDa ?? result.dataEn;
  if (!data || !result.noticeId) return null;
  const title = cleanText(data.titel ?? "", 220);
  const description = cleanText(data.beskrivelse ?? "", 1400);
  const organization = cleanText(data.ordregiver || data.alleOrdregivere?.[0] || "Udbud.dk", 180);
  const deadline = earliestFutureDeadline(data.tidsfrister ?? []);
  if (!title || !deadline) return null;
  const daysUntilDeadline = (deadline.getTime() - Date.now()) / 86400000;
  const structureText = `${title} ${data.beskrivelse ?? ""} ${data.bkSubType ?? ""}`.toLowerCase();
  if (
    daysUntilDeadline > 540 ||
    isBroadFrameworkTender(structureText) ||
    /dynamisk indkøbssystem|dynamisk indkoebssystem|dynamic purchasing system|\bdis\b|standardsoftware|cirkulær it|cirkulaer it|levetidsforlængende|levetidsforlaengende/.test(
      structureText,
    )
  ) {
    return null;
  }

  const deadlineText = (data.tidsfrister ?? []).join(", ");
  const cpv = [data.cpvKode, data.cpvTitel].filter(Boolean).join(" ");
  const rawContent = cleanText(
    [
      title,
      organization ? `Ordregiver: ${organization}` : "",
      data.publiceringsdato ? `Publiceringsdato: ${data.publiceringsdato}` : "",
      deadlineText ? `Tilbudsfrister: ${deadlineText}` : "",
      cpv ? `CPV: ${cpv}` : "",
      data.formulartype ? `Formulartype: ${data.formulartype}` : "",
      data.bkSubType ? `Bekendtgørelsestype: ${data.bkSubType}` : "",
      description,
    ].join("\n"),
    5000,
  );

  return enrichCandidate({
    title,
    description,
    rawContent,
    url: udbudDkNoticeUrl(result),
    organization,
    country: "DK",
    category: "Tender",
    currency: data.anslaaetVaerdiValuta || "DKK",
    deadline,
    postedAt: parseDanishDisplayDate(data.publiceringsdato),
    applicationRoute: "APPLICATION",
    contacts: organization ? [{ name: organization, role: "Ordregiver" }] : [],
  });
}

async function udbudDkSearch(query: string, maxResults: number): Promise<UdbudDkResult[]> {
  const res = await safeFetch("https://udbud.dk/soegning/public/soegeresultat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": crawlerSettings().userAgent,
    },
    body: JSON.stringify({
      fritekstQuery: query,
      pagineringDto: {
        aktuelSide: 1,
        maksElementer: Math.min(Math.max(maxResults, 1), 25),
        sorteringFelt: "TILBUDSFRIST_DATO",
        retning: "Asc",
      },
      filterDto: {
        formularType: ["EU_UDBUD", "NATIONALE_UDBUD"],
        opgaveType: [],
        procedureType: [],
        smvVenligType: [],
      },
      udbudStatusFilter: "AKTIV",
    }),
    signal: AbortSignal.timeout(SEARCH_PROVIDER_TIMEOUT_MS),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`udbud.dk search failed (${res.status})`);
  }
  const data = JSON.parse(res.text) as UdbudDkSearchResponse;
  return data.resultatElementDtoList ?? [];
}

async function udbudDkCandidates(
  query: string,
  queries: string[],
  user: UserProfile,
  maxResults: number,
  feedbackModel?: FeedbackSignalModel,
): Promise<DiscoveryCandidateDto[]> {
  const candidates: DiscoveryCandidateDto[] = [];
  const seen = new Set<string>();
  const seeds = udbudDkSearchSeeds(query, queries);
  const perQuery = Math.max(6, Math.ceil(maxResults / Math.max(1, seeds.length)));

  for (const seed of seeds) {
    if (candidates.length >= maxResults) break;
    const results = await udbudDkSearch(seed, perQuery);
    for (const result of results) {
      if (candidates.length >= maxResults) break;
      const candidate = udbudDkResultToCandidate(result, seed);
      if (!candidate) continue;
      const key = titleKey(`${candidate.title}:${candidate.organization}:${candidate.deadline}`) ?? candidate.url;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      candidates.push(
        await toDiscoveryDto(
          candidate,
          user,
          {
            sourceName: "udbud.dk",
            sourceKind: "web-search",
            provider: "udbud.dk",
            query: seed,
          },
          feedbackModel,
        ),
      );
    }
  }

  return candidates;
}

async function runProviderSearch(
  provider: SearchProvider,
  apiKey: string,
  queries: string[],
  maxResults: number,
  workspace: Workspace,
): Promise<SearchResult[]> {
  const perQuery = Math.max(3, Math.ceil(maxResults / Math.max(1, queries.length)));
  const out: SearchResult[] = [];
  let lastError: unknown;
  for (const query of queries) {
    try {
      const results =
        provider === "tavily"
          ? await tavilySearch(query, perQuery, apiKey)
          : provider === "brave"
            ? await braveSearch(query, perQuery, apiKey, workspace)
            : await serperSearch(query, perQuery, apiKey, workspace);
      out.push(...results);
    } catch (error) {
      lastError = error;
    }
    if (out.length >= maxResults * 2) break;
  }
  if (!out.length && lastError) {
    throw lastError;
  }
  return out;
}

async function searchResultsToCandidates(
  results: SearchResult[],
  user: UserProfile,
  workspace: Workspace,
  maxResults: number,
  feedbackModel?: FeedbackSignalModel,
): Promise<DiscoveryCandidateDto[]> {
  const candidates: DiscoveryCandidateDto[] = [];
  const seen = new Set<string>();
  let pageFetches = 0;

  for (const result of results) {
    if (candidates.length >= maxResults) break;
    const page = result.url && pageFetches < MAX_PAGE_FETCHES ? await fetchReadablePage(result.url) : {};
    if (result.url) pageFetches++;

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
      attachments: page.attachments,
    } as OpportunityCandidate & { workspace?: Workspace });

    candidates.push(
      await toDiscoveryDto(
        enriched,
        user,
        {
          sourceName: result.sourceName || sourceLabel(result.url),
          sourceKind: "web-search",
          provider: result.provider,
          query: result.query,
        },
        feedbackModel,
      ),
    );
  }
  return candidates;
}

async function scanSources(
  ownerId: string,
  query: string,
  user: UserProfile,
  workspace: Workspace,
  maxResults: number,
  feedbackModel?: FeedbackSignalModel,
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
  const scanTargets = [
    ...sources.map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      type: source.type as SourceType,
      keywords: source.keywords,
      parserKey: source.parserKey,
      country: source.country ?? undefined,
      region: source.region ?? undefined,
      category: source.category ?? undefined,
    })),
    ...(workspace === "DK" ? CURATED_DK_DISCOVERY_SOURCES : []),
  ];
  const candidates: DiscoveryCandidateDto[] = [];
  const queryKeywords = query
    .split(/[,\s]+/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 3)
    .slice(0, 10);

  for (const source of scanTargets) {
    if (!source.url || candidates.length >= maxResults) break;
    try {
      const isCurated = !("id" in source);
      const mergedKeywords = isCurated ? [] : [...new Set([...source.keywords, ...queryKeywords])];
      const raw =
        source.type === "RSS" || source.type === "NEWSLETTER"
          ? await fetchRssCandidates(source.url, mergedKeywords)
          : await fetchWebCandidates(source.url, {
              keywords: mergedKeywords,
              parserKey: source.parserKey,
            });
      for (const item of raw) {
        if (candidates.length >= maxResults) break;
        const enriched = await enrichWithDetailPage(
          enrichCandidate(item, {
            country: source.country ?? (workspace === "DK" ? "DK" : undefined),
            region: source.region ?? undefined,
            category: source.category ?? undefined,
          }),
        );
        candidates.push(
          await toDiscoveryDto(
            enriched,
            user,
            {
              sourceName: source.name,
              sourceKind: "source-scan",
              provider: "saved-sources",
              query,
            },
            feedbackModel,
          ),
        );
      }
      if ("id" in source) {
        await db.source.update({ where: { id: source.id }, data: { lastCheckedAt: new Date() } });
      }
    } catch (e) {
      warnings.push(`${source.name}: ${e instanceof Error ? e.message : "scan failed"}`);
    }
  }
  return { candidates, scanned: scanTargets.length, warnings };
}

async function maybeAiSummary(
  c: OpportunityCandidate,
  user: UserProfile,
  kind: DiscoveryCandidateDto["candidateKind"],
  priceText?: string,
): Promise<string | undefined> {
  if (!process.env.LLM_API_KEY && !user.aiKeys) return undefined;
  try {
    const res = await runAi({
      action: "summarize",
      context: cleanText([c.title, c.description, c.rawContent].filter(Boolean).join("\n"), 6000),
      profile: profileText(user),
      extra: [
        "Skriv på dansk.",
        "Giv 2 korte, konkrete sætninger til en solo full-stack/software leverandør.",
        kind === "source"
          ? "Dette er en kildeside eller liste, ikke en enkelt opgave. Forklar værdien som kilde."
          : "Dette er en konkret mulig opgave/udbud. Nævn gerne frist, pris/budget og hvorfor den passer.",
        priceText ? `Pris/budget fundet: ${priceText}` : "",
      ].filter(Boolean).join(" "),
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
  feedbackModel?: FeedbackSignalModel,
): Promise<DiscoveryCandidateDto> {
  const breakdown = scoreOpportunity(
    { ...c, contacts: c.contacts ?? [] },
    {
      budgetMaxDkk: user.budgetMaxDkk,
      weights: (user.scoringWeights as Partial<ScoreWeights>) || undefined,
    },
  );
  const fit = discoveryFitAdjustment(c);
  const hash = dedupeHash(c);
  const detailText = cleanText(c.rawContent || c.description || "", 7000);
  const candidateKind = isSourceLikeCandidate(c, detailText) ? "source" : "opportunity";
  const priceText = extractPriceText(detailText);
  const deadline = parseMaybeDate(c.deadline);
  const postedAt = parseMaybeDate(c.postedAt);
  const baseSignals = [...new Set([...signalLabels(c), ...fit.signals])].slice(0, 7);
  const feedbackInsight = evaluateFeedbackSignal(feedbackModel, {
    id: hash,
    title: c.title,
    description: c.description,
    rawContent: c.rawContent,
    url: c.url,
    candidateKind,
    category: c.category,
    applicationRoute: c.applicationRoute,
    sourceName: meta.sourceName,
    provider: meta.provider,
    query: meta.query,
    signals: baseSignals,
  });
  const aiSummary = feedbackInsight.suppress
    ? undefined
    : await maybeAiSummary(c, user, candidateKind, priceText);
  const summaryDa = cleanText(aiSummary || buildDanishSummary(c, candidateKind, priceText), 900);
  const adjustedTotal = Math.max(
    0,
    Math.min(100, breakdown.total + fit.delta + feedbackInsight.delta),
  );
  const adjustedBreakdown = { ...breakdown, total: adjustedTotal };
  return {
    id: hash,
    candidateKind,
    title: c.title,
    description: summaryDa || c.description,
    summaryDa,
    rawContent: c.rawContent,
    detailText,
    url: c.url,
    organization: c.organization,
    location: c.location,
    country: c.country,
    region: c.region,
    category: c.category,
    budgetMin: c.budgetMin,
    budgetMax: c.budgetMax,
    currency: c.currency ?? "DKK",
    priceText,
    deadline: deadline ? deadline.toISOString() : undefined,
    postedAt: postedAt ? postedAt.toISOString() : undefined,
    freshness: freshnessFor(c, candidateKind),
    applicationRoute: c.applicationRoute ?? "UNKNOWN",
    contacts: c.contacts ?? [],
    attachments: dedupeAttachments(c.attachments),
    matchScore: adjustedTotal,
    scoreBreakdown: adjustedBreakdown,
    reasons: [...feedbackInsight.notes, ...fit.notes, ...reasonsFromScore(adjustedBreakdown)].slice(0, 5),
    signals: [...new Set([...baseSignals, ...feedbackInsight.signals])].slice(0, 8),
    feedback: feedbackInsight.feedback,
    feedbackSuppressed: feedbackInsight.suppress,
    ...meta,
  };
}

function dedupeCandidates(candidates: DiscoveryCandidateDto[], maxResults: number): DiscoveryCandidateDto[] {
  const seen = new Set<string>();
  const unique: DiscoveryCandidateDto[] = [];
  for (const c of candidates.sort((a, b) => b.matchScore - a.matchScore)) {
    if (c.feedback === "NON_LEAD" || c.feedbackSuppressed) continue;
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

  const [saved, savedSources, feedbackRows] = await Promise.all([
    db.opportunity.findMany({
      where: {
        ownerId,
        OR: [
          hashes.length ? { dedupeHash: { in: hashes } } : undefined,
          urls.length ? { url: { in: urls } } : undefined,
        ].filter(Boolean) as Prisma.OpportunityWhereInput[],
      },
      select: { id: true, title: true, dedupeHash: true, url: true },
    }),
    urls.length
      ? db.source.findMany({
          where: { ownerId, url: { in: urls } },
          select: { id: true, name: true, url: true },
        })
      : Promise.resolve([]),
    hashes.length
      ? withOptionalDiscoveryFeedback(
          () =>
            db.discoveryFeedback.findMany({
              where: { ownerId, candidateId: { in: hashes } },
              select: { candidateId: true, feedback: true },
            }),
          [],
        )
      : Promise.resolve([]),
  ]);
  return candidates.map((c) => {
    const match = saved.find((s) => s.dedupeHash === c.id || (c.url && s.url === c.url));
    const sourceMatch = savedSources.find((s) => c.url && s.url === c.url);
    const feedbackMatch = feedbackRows.find((f) => f.candidateId === c.id);
    return {
      ...c,
      ...(feedbackMatch ? { feedback: feedbackMatch.feedback } : {}),
      ...(match ? { alreadySaved: { id: match.id, title: match.title } } : {}),
      ...(sourceMatch ? { alreadySavedSource: { id: sourceMatch.id, name: sourceMatch.name } } : {}),
    };
  });
}

async function loadSavedDiscoveryIndex(ownerId: string): Promise<SavedDiscoveryIndex> {
  const [opportunities, sources] = await Promise.all([
    db.opportunity.findMany({
      where: { ownerId },
      take: 2500,
      select: { dedupeHash: true, url: true, title: true },
    }),
    db.source.findMany({
      where: { ownerId },
      take: 1000,
      select: { url: true },
    }),
  ]);

  return {
    opportunityHashes: new Set(opportunities.map((opp) => opp.dedupeHash).filter(Boolean) as string[]),
    opportunityUrls: new Set(opportunities.map((opp) => canonicalUrl(opp.url)).filter(Boolean) as string[]),
    opportunityTitleKeys: new Set(opportunities.map((opp) => titleKey(opp.title)).filter(Boolean) as string[]),
    sourceUrls: new Set(sources.map((source) => canonicalUrl(source.url)).filter(Boolean) as string[]),
  };
}

function savedCandidateMatch(
  candidate: DiscoveryCandidateDto,
  savedIndex: SavedDiscoveryIndex,
): "opportunity" | "source" | null {
  const url = canonicalUrl(candidate.url);
  if (candidate.candidateKind === "source" && url && savedIndex.sourceUrls.has(url)) return "source";
  if (candidate.id && savedIndex.opportunityHashes.has(candidate.id)) return "opportunity";
  if (url && savedIndex.opportunityUrls.has(url)) return "opportunity";
  const key = titleKey(candidate.title);
  if (key && savedIndex.opportunityTitleKeys.has(key)) return "opportunity";
  return null;
}

export const __discoveryTesting = {
  buildFeedbackSignalModel,
  buildSearchPlan,
  deterministicSearchPlan,
  evaluateFeedbackSignal,
  feedbackFeaturesFromCandidate,
  savedCandidateMatch,
  sanitizeUdbudDkQuery,
  udbudDkResultToCandidate,
  udbudDkSearchSeeds,
};

export async function runDiscoverySearch(
  ownerId: string,
  input: DiscoverySearchInput,
): Promise<DiscoverySearchResult> {
  const progress = async (message: string) => {
    await input.onProgress?.(message);
  };
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
  const collectionLimit = Math.min(maxResults * 2, 60);
  const providerState = searchProviderFromEnv(input.provider, user.aiKeys);
  const feedbackModel = await loadFeedbackSignalModel(ownerId);
  const [memory, savedIndex] = await Promise.all([
    loadSearchMemory(ownerId, feedbackModel),
    loadSavedDiscoveryIndex(ownerId),
  ]);
  const searchPlan = input.useAiPlanner === false
    ? deterministicSearchPlan(input.query, workspace, input.resultKind ?? "all", memory)
    : await buildSearchPlan(
        input.query,
        workspace,
        input.resultKind ?? "all",
        user,
        memory,
      );
  const queries = withHardSearchModifiers(
    [...(input.queryVariants ?? []), ...searchPlan.queries],
    input.requiredTerms,
    input.excludedTerms,
  );
  await progress(`Built ${queries.length} search probes for ${workspace} discovery.`);
  const effectiveSearchPlan = {
    ...searchPlan,
    queries,
    avoidTerms: uniqueStrings([...(searchPlan.avoidTerms ?? []), ...cleanSearchTerms(input.excludedTerms)], 8),
  };
  const warnings: string[] = [];
  let candidates: DiscoveryCandidateDto[] = [];
  let sourceScanCount = 0;
  const resultKind = input.resultKind ?? "all";
  let usedOfficialTenderIndex = false;

  if (
    workspace === "DK" &&
    input.includeWeb !== false &&
    resultKind !== "sources" &&
    isTenderSearchIntent(input.query, queries)
  ) {
    const udbudStartedAt = Date.now();
    try {
      await progress("Searching udbud.dk public tender index for active notices.");
      const officialCandidates = await udbudDkCandidates(
        input.query,
        queries,
        user,
        collectionLimit,
        feedbackModel,
      );
      usedOfficialTenderIndex = true;
      candidates.push(...officialCandidates);
      await progress(
        `udbud.dk returned ${officialCandidates.length} active tender candidates in ${Math.round((Date.now() - udbudStartedAt) / 1000)}s.`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "udbud.dk search failed";
      warnings.push(message);
      await progress(`udbud.dk search warning: ${message}`);
    }
  }

  if (input.includeWeb !== false && providerState.configured && providerState.provider !== "none") {
    try {
      const webStartedAt = Date.now();
      await progress(`Starting web search with ${queries.length} probes via ${providerState.provider}.`);
      const webResults = await runProviderSearch(
        providerState.provider,
        providerState.apiKey,
        queries,
        collectionLimit,
        workspace,
      );
      const webCandidates = await searchResultsToCandidates(webResults, user, workspace, collectionLimit, feedbackModel);
      candidates.push(...webCandidates);
      const webMs = Date.now() - webStartedAt;
      await progress(`Web search returned ${webCandidates.length} candidates in ${Math.round(webMs / 1000)}s.`);
      if (webMs > 30_000) {
        warnings.push(`Web discovery phase took ${Math.round(webMs / 1000)}s.`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Web search failed";
      warnings.push(message);
      await progress(`Web search warning: ${message}`);
    }
  } else if (input.includeWeb !== false && providerState.provider !== "none") {
    warnings.push(
      "No web search API key configured. Add Tavily, Brave Search, or Serper in Settings -> AI to enable broad web discovery.",
    );
    await progress("Web search skipped because no configured search provider was available.");
  } else if (input.includeWeb !== false) {
    await progress("Generic web search skipped by provider setting.");
  }

  if (input.includeSources !== false) {
    const sourceStartedAt = Date.now();
    const sourceQuery = [input.query, ...searchPlan.focusTerms.slice(0, 8), ...(input.requiredTerms ?? [])].join(" ");
    await progress("Scanning saved sources for matching opportunities.");
    const scanned = await scanSources(ownerId, sourceQuery, user, workspace, collectionLimit, feedbackModel);
    sourceScanCount = scanned.scanned;
    candidates.push(...scanned.candidates);
    warnings.push(...scanned.warnings.slice(0, 4));
    const sourceMs = Date.now() - sourceStartedAt;
    await progress(`Scanned ${scanned.scanned} saved sources in ${Math.round(sourceMs / 1000)}s.`);
    if (sourceMs > 30_000) {
      warnings.push(`Source scan phase took ${Math.round(sourceMs / 1000)}s across ${scanned.scanned} sources.`);
    }
  }

  const beforeKindFilter = candidates.length;
  const kindCandidates = candidates.filter((candidate) => {
    if (resultKind === "opportunities") return candidate.candidateKind === "opportunity";
    if (resultKind === "sources") return candidate.candidateKind === "source";
    return true;
  });
  const kindHiddenCount = beforeKindFilter - kindCandidates.length;
  if (kindHiddenCount > 0 && resultKind !== "all") {
    warnings.push(
      `${kindHiddenCount} ${resultKind === "opportunities" ? "source" : "opportunity"} candidates were hidden by the result filter.`,
    );
  }

  const beforeFreshnessFilter = kindCandidates.length;
  const freshCandidates = kindCandidates.filter(
    (candidate) =>
      candidate.candidateKind === "source" ||
      candidate.freshness === "active" ||
      candidate.freshness === "unknown",
  );
  const hiddenCount = beforeFreshnessFilter - freshCandidates.length;
  if (hiddenCount > 0) {
    warnings.push(`${hiddenCount} expired or stale candidates were hidden from the review list.`);
  }

  const termFiltered = filterBySearchTerms(freshCandidates, input.requiredTerms, input.excludedTerms);
  if (termFiltered.removed > 0) {
    warnings.push(`Filtered ${termFiltered.removed} candidates by required/excluded search terms.`);
  }

  const beforeSavedFilter = termFiltered.candidates.length;
  const unsavedCandidates = termFiltered.candidates.filter((candidate) => !savedCandidateMatch(candidate, savedIndex));
  const savedHiddenCount = beforeSavedFilter - unsavedCandidates.length;
  if (savedHiddenCount > 0) {
    warnings.push(`${savedHiddenCount} already saved results were hidden.`);
  }

  const marked = await markAlreadySaved(ownerId, dedupeCandidates(unsavedCandidates, maxResults));
  const beforeFeedbackFilter = marked.length;
  const unique = marked.filter(
    (candidate) => candidate.feedback !== "NON_LEAD" && !candidate.feedbackSuppressed,
  );
  const feedbackHiddenCount = beforeFeedbackFilter - unique.length;
  if (feedbackHiddenCount > 0) {
    warnings.push(`${feedbackHiddenCount} candidates were hidden by your discovery feedback.`);
  }
  await progress(`Ranked ${unique.length} candidates after filters and dedupe.`);
  const provider = usedOfficialTenderIndex
    ? providerState.provider === "none"
      ? "udbud.dk"
      : `udbud.dk+${providerState.provider}`
    : providerState.provider;
  return {
    candidates: unique,
    queries,
    searchPlan: effectiveSearchPlan,
    provider,
    providerConfigured: providerState.configured,
    sourceScanCount,
    warnings,
  };
}

function sourceTypeForCandidate(candidate: DiscoveryCandidateSaveInput): SourceType {
  const text = `${candidate.title} ${candidate.url ?? ""} ${candidate.description ?? ""} ${candidate.rawContent ?? ""}`.toLowerCase();
  return /udbud|tender|procurement|indkøb|indkoeb|tilbud|herkules|ehsys/.test(text)
    ? "PROCUREMENT"
    : "PUBLIC_WEB";
}

function parserKeyForSource(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host.endsWith("ehsys.dk") && /\/indkoeb\/alle\/?$|\/indkøb\/alle\/?$/.test(path)) {
      return "ehsys-procurement";
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function sourceKeywordsFromCandidate(candidate: DiscoveryCandidateSaveInput, workspace: Workspace): string[] {
  const seed = [
    ...(candidate.signals ?? []),
    candidate.category,
    candidate.query,
    workspace === "DK" ? "software udbud digitalisering teknisk mvp ai" : "software tender mvp ai",
  ].filter(Boolean).join(" ");
  const blocked = new Set(["site", "https", "http", "www", "com", "dk", "the", "and", "eller", "med"]);
  const words = seed
    .toLowerCase()
    .split(/[^a-z0-9æøå]+/i)
    .map((word) => word.trim())
    .filter((word) => word && (word.length >= 3 || word === "ai") && !blocked.has(word));
  return [...new Set(words)].slice(0, 14);
}

function feedbackCandidateId(candidate: DiscoveryCandidateSaveInput): string {
  if (candidate.id) return candidate.id;
  const base = enrichCandidate({
    title: candidate.title,
    description: candidate.summaryDa || candidate.description,
    rawContent: candidate.detailText || candidate.rawContent,
    url: candidate.url,
    organization: candidate.organization || candidate.sourceName,
  });
  return dedupeHash(base);
}

export async function saveDiscoveryFeedback(
  ownerId: string,
  candidate: DiscoveryCandidateSaveInput,
  feedback: "GOOD_RESULT" | "NON_LEAD",
  reason?: string,
) {
  const candidateId = feedbackCandidateId(candidate);
  const features = feedbackFeaturesFromCandidate(candidate);
  const saved = await withOptionalDiscoveryFeedback(
    () =>
      db.discoveryFeedback.upsert({
        where: { ownerId_candidateId: { ownerId, candidateId } },
        update: {
          feedback,
          features,
          reason,
          title: cleanText(candidate.title, 220) || "Untitled result",
          url: candidate.url || null,
          candidateKind: candidate.candidateKind,
          sourceName: candidate.sourceName,
          provider: candidate.provider,
          query: candidate.query,
        },
        create: {
          ownerId,
          candidateId,
          feedback,
          features,
          reason,
          title: cleanText(candidate.title, 220) || "Untitled result",
          url: candidate.url || null,
          candidateKind: candidate.candidateKind,
          sourceName: candidate.sourceName,
          provider: candidate.provider,
          query: candidate.query,
        },
        select: { id: true, candidateId: true, feedback: true },
      }),
    { id: "", candidateId, feedback },
  );
  return { feedback: saved };
}

export async function saveDiscoverySource(
  ownerId: string,
  candidate: DiscoveryCandidateSaveInput,
  workspace: Workspace,
) {
  if (!candidate.url) throw new Error("A source URL is required");
  const url = candidate.url;
  await assertPublicUrl(url);

  const existing = await db.source.findFirst({
    where: { ownerId, url },
    include: { _count: { select: { opportunities: true } } },
  });
  if (existing) return { source: existing, created: false };

  const type = sourceTypeForCandidate(candidate);
  const source = await db.source.create({
    data: {
      ownerId,
      name: cleanText(candidate.title || candidate.sourceName || sourceLabel(url), 160),
      url,
      type,
      workspace,
      frequency: type === "PROCUREMENT" ? "DAILY" : "WEEKLY",
      keywords: sourceKeywordsFromCandidate(candidate, workspace),
      country: candidate.country || (workspace === "DK" ? "DK" : undefined),
      region: candidate.region,
      category: candidate.category || (type === "PROCUREMENT" ? "Tender" : undefined),
      enabled: true,
      parserKey: parserKeyForSource(url),
      notes: cleanText(
        [
          candidate.summaryDa || candidate.description,
          candidate.priceText ? `Prisinfo fundet: ${candidate.priceText}` : "",
          candidate.sourceName ? `Fundet via ${candidate.sourceName}.` : "",
          candidate.query ? `Discovery query: ${candidate.query}` : "",
        ].filter(Boolean).join("\n"),
        1600,
      ),
    },
    include: { _count: { select: { opportunities: true } } },
  });

  return { source, created: true };
}

export async function saveDiscoveryCandidate(
  ownerId: string,
  candidate: DiscoveryCandidateSaveInput,
  workspace: Workspace,
) {
  const base: OpportunityCandidate = enrichCandidate({
    title: candidate.title,
    description: candidate.summaryDa || candidate.description,
    rawContent: candidate.detailText || candidate.rawContent,
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
    attachments: candidate.attachments,
  });
  const hash = dedupeHash(base);

  const existing = await db.opportunity.findFirst({
    where: {
      ownerId,
      OR: [{ dedupeHash: hash }, ...(base.url ? [{ url: base.url }] : [])],
    },
    select: { id: true, title: true },
  });
  if (existing) {
    await saveDiscoveryFeedback(ownerId, candidate, "GOOD_RESULT");
    return { opportunity: existing, created: false };
  }

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
      aiSummary: candidate.summaryDa || candidate.description,
      whyRelevant: candidate.priceText,
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
      attachments: base.attachments?.length
        ? {
            create: dedupeAttachments(base.attachments).map((attachment) => ({
              label: attachment.label,
              url: attachment.url,
              kind: attachment.kind,
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
            candidateKind: candidate.candidateKind ?? "opportunity",
            freshness: candidate.freshness ?? "unknown",
            attachments: candidate.attachments?.length ?? 0,
          },
        },
      },
    },
    select: { id: true, title: true },
  });

  await ensureEmbedding(opportunity.id);
  await saveDiscoveryFeedback(ownerId, candidate, "GOOD_RESULT");

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
