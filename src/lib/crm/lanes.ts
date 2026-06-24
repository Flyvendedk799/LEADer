import { db } from "@/lib/db";
import { hasConcreteSoftwareTenderScope, isBroadFrameworkTender, isResearchPolicyTender } from "@/lib/discovery/tender-quality";
import type { SourceType, Workspace } from "@/lib/types";

export interface LaneDefinition {
  slug: string;
  name: string;
  description: string;
  workspace: Workspace;
  sourceTypes: SourceType[];
  queryTemplates: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  scoringConfig: Record<string, number>;
  evidenceRequirements: string[];
  conversionGuidance: string;
}

export type LaneLike = Pick<
  LaneDefinition,
  | "slug"
  | "name"
  | "queryTemplates"
  | "positiveKeywords"
  | "negativeKeywords"
  | "evidenceRequirements"
>;

export type CandidateLike = {
  title?: string | null;
  description?: string | null;
  rawContent?: string | null;
  url?: string | null;
  organization?: string | null;
  sourceName?: string | null;
  sourceKind?: string | null;
  category?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  deadline?: string | Date | null;
  candidateKind?: string | null;
  status?: string | null;
  applicationRoute?: string | null;
};

export interface LaneFitResult {
  delta: number;
  confidenceBonus: number;
  priority: number;
  matchedKeywords: string[];
  blockedKeywords: string[];
  evidenceMatches: string[];
  missingEvidence: string[];
  reasons: string[];
  signals: string[];
}

export type LaneCandidateGateResult = {
  allowed: boolean;
  reason?: string;
};

export const DEFAULT_DISCOVERY_LANES: LaneDefinition[] = [
  {
    slug: "funded-work",
    name: "Funded work",
    description:
      "Grants, vouchers and procurement-like supplier assignments that can convert into scoped technical projects.",
    workspace: "DK",
    sourceTypes: ["PUBLIC_WEB", "RSS", "PROCUREMENT", "ACCELERATOR", "NEWSLETTER"],
    queryTemplates: [
      "funded software MVP AI automation voucher Denmark",
      "SMV Digital digitalisering rådgiver software AI",
      "InnoBooster startup technical supplier MVP",
    ],
    positiveKeywords: ["voucher", "tilskud", "grant", "funded", "MVP", "AI", "software", "automation"],
    negativeKeywords: ["unpaid", "equity only", "masterclass", "training only"],
    scoringConfig: { budgetFit: 1, deadline: 1, fundingSignal: 1 },
    evidenceRequirements: ["budget or funding signal", "deadline or active call", "clear buyer or programme"],
    conversionGuidance:
      "Emphasize your track record landing funded customers, tight scoping, and low-risk delivery.",
  },
  {
    slug: "direct-startup-mvp",
    name: "Direct startup / MVP clients",
    description:
      "Founders and early teams that need a builder, technical partner or product-minded MVP sprint.",
    workspace: "DK",
    sourceTypes: ["PUBLIC_WEB", "ACCELERATOR", "NEWSLETTER", "MANUAL"],
    queryTemplates: [
      "startup founder needs MVP developer Denmark",
      "founder looking for technical partner prototype AI",
      "pre-seed startup product roadmap fullstack",
    ],
    positiveKeywords: ["founder", "startup", "MVP", "prototype", "technical partner", "fullstack", "roadmap"],
    negativeKeywords: ["cofounder only", "internship", "job posting only"],
    scoringConfig: { founderIntent: 1, technicalNeed: 1, budgetClarity: 0.7 },
    evidenceRequirements: ["explicit product or technical need", "reachable founder/company", "reason to act now"],
    conversionGuidance:
      "Lead with rapid product clarity, senior technical judgment and an MVP path that does not overbuild.",
  },
  {
    slug: "sme-ai-automation",
    name: "SME AI automation",
    description:
      "SMEs with workflow, data, reporting, internal-tooling or LLM automation pain.",
    workspace: "DK",
    sourceTypes: ["PUBLIC_WEB", "RSS", "NEWSLETTER", "MANUAL"],
    queryTemplates: [
      "SME AI automation workflow Denmark",
      "company wants automate reporting data dashboard",
      "digitalisering AI chatbot internal tools SME",
    ],
    positiveKeywords: ["automation", "AI", "workflow", "reporting", "dashboard", "internal tool", "digitalisering"],
    negativeKeywords: ["course", "conference", "webinar", "hardware only"],
    scoringConfig: { painSignal: 1, automationFit: 1, reachableBuyer: 0.8 },
    evidenceRequirements: ["business pain", "automation or data need", "reachable buyer"],
    conversionGuidance: "Position a small proof-of-value sprint before a larger system build.",
  },
  {
    slug: "tenders-procurement",
    name: "Tenders / procurement",
    description:
      "Formal public or private procurement opportunities that match a solo/small technical supplier.",
    workspace: "DK",
    sourceTypes: ["PROCUREMENT", "PUBLIC_WEB", "RSS"],
    queryTemplates: [
      "site:udbud.dk/detaljevisning software udvikling drift support tilbudsfrist",
      "site:eu.eu-supply.com/ctm/Supplier/PublicPurchase software udvikling drift support public rft",
      "site:mercell.com/da-dk/udbud software udvikling drift vedligeholdelse udbud",
      "site:ethics.dk/ethics/eo#/tender software udvikling digitalisering udbud",
    ],
    positiveKeywords: ["udbud", "tender", "procurement", "software", "IT", "webapp", "digitalisering"],
    negativeKeywords: [
      "arkiv",
      "archive",
      "cofounder",
      "enterprise",
      "hardware",
      "job",
      "jobs",
      "linkedin",
      "million",
      "portal",
      "rammeaftale",
      "recruitment",
      "the hub",
      "udbud.co",
    ],
    scoringConfig: { formalFit: 1, scopeFit: 1, deadline: 1 },
    evidenceRequirements: ["scope", "submission route", "deadline", "buyer"],
    conversionGuidance:
      "Only pursue when scope is small enough and the submission overhead is justified.",
  },
  {
    slug: "community-manual",
    name: "Community / manual leads",
    description:
      "Manual-only posts, communities and user-captured leads. This lane is never server-scraped.",
    workspace: "DK",
    sourceTypes: ["FACEBOOK_MANUAL", "UPLOAD", "MANUAL"],
    queryTemplates: ["manual paste founder post MVP developer", "community lead technical help startup"],
    positiveKeywords: ["looking for", "MVP", "developer", "AI", "automation", "founder"],
    negativeKeywords: ["job ad", "unpaid", "equity only"],
    scoringConfig: { manualSignal: 1, contactability: 1 },
    evidenceRequirements: ["user-supplied content", "contact or author", "explicit need"],
    conversionGuidance:
      "Use the human context from the post and respond with a specific, low-friction next step.",
  },
  {
    slug: "warm-network",
    name: "Warm-network follow-ups",
    description:
      "Dormant relationships, past customers and known contacts that deserve a timely follow-up.",
    workspace: "DK",
    sourceTypes: ["MANUAL", "NEWSLETTER"],
    queryTemplates: ["past customer follow-up AI automation", "warm lead product roadmap check-in"],
    positiveKeywords: ["past customer", "warm intro", "follow-up", "dormant", "referral"],
    negativeKeywords: ["cold scraped", "mass campaign"],
    scoringConfig: { relationshipWarmth: 1, timing: 1 },
    evidenceRequirements: ["relationship context", "reason to reconnect", "clear next action"],
    conversionGuidance:
      "Reference the relationship and propose a useful, specific conversation rather than a generic sales pitch.",
  },
];

export async function ensureDefaultDiscoveryLanes(ownerId: string) {
  await Promise.all(
    DEFAULT_DISCOVERY_LANES.map((lane) =>
      db.discoveryLane.upsert({
        where: { ownerId_slug: { ownerId, slug: lane.slug } },
        update: {
          name: lane.name,
          description: lane.description,
          workspace: lane.workspace,
          sourceTypes: lane.sourceTypes,
          queryTemplates: lane.queryTemplates,
          positiveKeywords: lane.positiveKeywords,
          negativeKeywords: lane.negativeKeywords,
          scoringConfig: lane.scoringConfig,
          evidenceRequirements: lane.evidenceRequirements,
          conversionGuidance: lane.conversionGuidance,
          active: true,
        },
        create: {
          ownerId,
          ...lane,
          scoringConfig: lane.scoringConfig,
        },
      }),
    ),
  );
}

export function missionQuery(lane: {
  queryTemplates: string[];
  positiveKeywords: string[];
  name: string;
}, extra?: string) {
  const base = lane.queryTemplates[0] || lane.positiveKeywords.join(" ") || lane.name;
  return [base, extra?.trim()].filter(Boolean).join(" ");
}

function cleanQuery(value?: string | null, max = 260) {
  return value?.replace(/\s+/g, " ").trim().slice(0, max) || "";
}

function uniqueStrings(values: string[], limit = values.length) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = cleanQuery(value);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}

export function laneMissionQueries(lane: LaneLike, extra?: string, limit = 4) {
  const refinement = cleanQuery(extra);
  const templates = lane.queryTemplates.length
    ? lane.queryTemplates
    : [lane.positiveKeywords.join(" ") || lane.name];
  const positiveCore = lane.positiveKeywords.slice(0, 6).join(" ");
  const seeds = [
    ...templates.map((template) => [template, refinement].filter(Boolean).join(" ")),
    refinement ? `${refinement} ${positiveCore}` : "",
    `${lane.name} ${positiveCore}`,
  ];
  return uniqueStrings(seeds, Math.max(1, limit));
}

function candidateText(candidate: CandidateLike) {
  return [
    candidate.title,
    candidate.description,
    candidate.rawContent,
    candidate.organization,
    candidate.sourceName,
    candidate.category,
    candidate.url,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function candidateEvidenceText(candidate: CandidateLike) {
  const fields = candidate.rawContent
    ? [
        candidate.title,
        candidate.rawContent,
        candidate.organization,
        candidate.sourceName,
        candidate.category,
        candidate.url,
      ]
    : [
        candidate.title,
        candidate.description,
        candidate.organization,
        candidate.sourceName,
        candidate.category,
        candidate.url,
      ];
  return fields.filter(Boolean).join(" ").toLowerCase();
}

function candidateUrlParts(url?: string | null) {
  if (!url) return { host: "", path: "", url: "" };
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname.replace(/^www\./, "").toLowerCase(),
      path: parsed.pathname.toLowerCase(),
      url: parsed.toString().toLowerCase(),
    };
  } catch {
    return { host: "", path: "", url: url.toLowerCase() };
  }
}

function isConcreteTenderUrl(host: string, path: string, url: string) {
  if (!url || /\/(?:arkiv|archive)(?:\/|$)/.test(url)) return false;
  const hasNoticeId = /[?&]noticeid=/.test(url);
  return (
    (host === "udbud.dk" && path === "/detaljevisning" && hasNoticeId) ||
    (host === "eu.eu-supply.com" && /\/ctm\/supplier\/publicpurchase\/|\/app\/rfq\//.test(path)) ||
    (host.endsWith("mercell.com") && /\/udbud\/\d+\//.test(path)) ||
    (host.endsWith("ethics.dk") && /\/ethics\/eo#\/tender/.test(url)) ||
    (host.endsWith("comdia.com") && /\/tender\//.test(path)) ||
    (host === "ted.europa.eu" && /\/notice\//.test(path)) ||
    /\/indkoeb\/tilbud\/indsend\/|\/indkøb\/tilbud\/indsend\/|\/tender\/\d+|\/rfp\/\d+/.test(path)
  );
}

function isLegacyUdbudTenderUrl(host: string, path: string) {
  return host.endsWith("udbud.dk") && /\/pages\/tenders\/showtender/.test(path);
}

function isTenderAttachmentUrl(path: string, url: string) {
  return /\/handlers\/file\.ashx|\/vedhaeftning\/|\.(?:pdf|docx?|xlsx?)(?:[?#]|$)/.test(`${path} ${url}`);
}

function isNonProductionTenderUrl(host: string) {
  return /^(pre|test|staging)\./.test(host);
}

function parsedDeadline(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasActiveDeadlineValue(value?: string | Date | null) {
  const date = parsedDeadline(value);
  if (!date) return false;
  return date.getTime() >= Date.now() - 12 * 60 * 60 * 1000;
}

function hasDatedDeadlineCue(text: string) {
  const deadlineWords = /tilbudsfrist|udbudsfrist|frist for tilbud|submission deadline|deadline|response deadline|tender deadline/;
  const datePattern =
    /(?:20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]20\d{2}|\d{1,2}\.?\s+(?:januar|februar|marts|april|maj|juni|juli|august|september|oktober|november|december|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|dec)\s+20\d{2})/;
  return deadlineWords.test(text) && datePattern.test(text);
}

function hasTenderDeadlineEvidence(candidate: CandidateLike, text: string) {
  return hasActiveDeadlineValue(candidate.deadline) || hasDatedDeadlineCue(text);
}

function hasLongRunningTenderHorizon(candidate: CandidateLike) {
  const deadline = parsedDeadline(candidate.deadline);
  if (!deadline) return false;
  const days = (deadline.getTime() - Date.now()) / 86400000;
  return days > 540;
}

function hasTenderCue(text: string, url: string) {
  return /udbud|udbudsfrist|tilbudsfrist|afgiv tilbud|indsend tilbud|public rft|request for tender|contract notice|procurement|tender|noticeid|publicpurchase|mercell|eu-supply|ethics|comdia|ted\.europa\.eu|e-avrop/.test(
    `${text} ${url}`,
  );
}

function hasTenderConcreteCue(candidate: CandidateLike, text: string, url: string, concreteTenderUrl: boolean) {
  const hasDeadline = hasTenderDeadlineEvidence(candidate, text);
  const hasSubmissionRoute =
    candidate.applicationRoute === "APPLICATION" ||
    /tilbudsfrist|udbudsfrist|frist for tilbud|afgiv tilbud|indsend tilbud|send tilbud|submit (?:a )?(?:bid|tender|proposal)|public rft|rfq|noticeid|noticepublicationnumber|publicpurchase|\/ctm\/supplier\/publicpurchase|\/app\/rfq\//.test(
      `${text} ${url}`,
    );
  return (
    hasDeadline &&
    (hasSubmissionRoute || concreteTenderUrl)
  );
}

function hasTechnicalTenderScope(text: string) {
  return hasConcreteSoftwareTenderScope(text);
}

function isJobOrRecruitingResult(text: string, host: string, path: string) {
  return /thehub\.io/.test(host) ||
    /\/jobs?\b|\/careers?\b|\/stillinger?\b|\/jobopslag\b/.test(path) ||
    /job posting|jobannonce|job ad|startup jobs|how to get .*job|full.?time|part.?time|internship|praktik|cofounder|co-founder|equity.?based|recruitment|hiring|søger en developer|søger developer|webudvikler til|technical cofounder|cto role|jobmakker/.test(
      text,
    );
}

function isConcreteSupplierOpportunityUrl(host: string, path: string) {
  return (
    (host.endsWith("ehsys.dk") && /\/indkoeb\/tilbud\/indsend\//.test(path)) ||
    /\/opportunit(?:y|ies)\/|\/rfp\/\d+|\/request-for-proposal\//.test(path)
  );
}

function hasStartupOpportunityIntent(candidate: CandidateLike, text: string, host: string, path: string) {
  const concreteSupplierRoute = isConcreteSupplierOpportunityUrl(host, path);
  const intentText = candidate.rawContent
    ? [
        candidate.title,
        candidate.rawContent,
        candidate.organization,
        candidate.sourceName,
        candidate.category,
        candidate.url,
      ].filter(Boolean).join(" ").toLowerCase()
    : text;
  const commentaryText = `${candidate.description ?? ""} ${intentText}`.toLowerCase();

  if (
    /ikke (?:en )?konkret opgave|ikke et konkret lead|ikke en konkret leverance|ingen konkret (?:frist|opgave|leverance|budget)|not (?:a )?concrete (?:opportunity|task|assignment|lead)|no concrete (?:opportunity|task|assignment|deadline|budget)/.test(
      commentaryText,
    )
  ) {
    return false;
  }

  if (/looking for \d+ startups|søger \d+ startups|applications from startups|receive applications from startups|startup programme|startup program|championship in entrepreneurship/.test(intentText)) {
    return false;
  }

  const hasDeadline = hasActiveDeadlineValue(candidate.deadline) || hasDatedDeadlineCue(intentText);
  const technicalNeed =
    /mvp|prototype|proof.?of.?concept|poc|product roadmap|technical roadmap|teknisk roadmap|software|webapp|\bapp\b|platform|automation|automatisering|\bai\b|kunstig intelligens|fullstack|developer|udvikler|udvikling|technical partner|teknisk partner/.test(
      intentText,
    );
  const buyerIntent =
    /looking for|seeking|needs?|wants?|requires?|request(?:ing)?|søger|leder efter|mangler|brug for|hjælp til|help with|skal bruge|leverandør til|supplier opportunity|partner til|tilbud|indsend tilbud|submission|deadline|frist/.test(
      intentText,
    );
  const fundedOrCommercial =
    /funded|grant|voucher|tilskud|innobooster|beyond beta|ehsys|budget|paid|betalt|purchase|procurement|supplier lead/.test(
      intentText,
    );

  return (
    (concreteSupplierRoute && (technicalNeed || fundedOrCommercial || hasDeadline)) ||
    (technicalNeed && (buyerIntent || fundedOrCommercial || hasDeadline))
  );
}

function isGenericTenderSource(text: string, host: string, path: string) {
  const genericListingPath =
    path === "/" ||
    /\/(?:alle|sources?|kilder?|udbud|indkoeb\/alle|indkøb\/alle)\/?$/.test(path);
  return /tenderimpulse|bidsandtenders|in-tend|procuman|herkules|udbudsportalen|info\.mercell|(?:^|\.)udbud\.co$/.test(host) ||
    genericListingPath ||
    /find tenders?|tender portal|procurement platform|udbudsportal|udbudsliste|alle udbud|liste over|oversigt over|database|markedsplads|offentlige udbud|søg efter udbud|soeg efter udbud|komplette guide|guide til offentlige indkøb|udbudsindsigter/.test(
      text,
    );
}

function isPurchasingSystemOrCatalogue(text: string) {
  return /dynamisk indkøbssystem|dynamisk indkoebssystem|dynamic purchasing system|\bdis\b|standardsoftware|cirkulær it|cirkulaer it|levetidsforlængende|levetidsforlaengende/.test(
    text,
  );
}

function isGenericTenderTitle(text: string) {
  return /^(?:udbud\.dk|digitale udbud|mercell|public rft|e-procurement|procurement solutions)\b/.test(text.trim());
}

function hasTenderBuyerEvidence(candidate: CandidateLike, text: string) {
  const org = `${candidate.organization ?? ""} ${candidate.sourceName ?? ""}`.toLowerCase().trim();
  const genericOrg = !org || /^(?:udbud|udbud\.dk|mercell|eu-supply|tender impulse|bidsandtenders|in-tend|procuman|linkedin|the hub)\b/.test(org);
  return !genericOrg || /ordregiver|contracting authority|offentlig ordregiver|kommune|municipality|styrelse|ministeriet|ministry|region\b|universitet|university|hospital|agency/.test(text);
}

export function laneCandidateGate(lane: LaneLike, candidate: CandidateLike): LaneCandidateGateResult {
  const text = candidateText(candidate);
  const evidenceText = candidateEvidenceText(candidate);
  const { host, path, url } = candidateUrlParts(candidate.url);

  if (lane.slug === "direct-startup-mvp" && isJobOrRecruitingResult(text, host, path)) {
    return { allowed: false, reason: "job/recruiting result" };
  }

  if (lane.slug === "direct-startup-mvp" && !hasStartupOpportunityIntent(candidate, text, host, path)) {
    return { allowed: false, reason: "missing explicit startup opportunity" };
  }

  if (lane.slug !== "tenders-procurement") return { allowed: true };

  const concreteTenderUrl = isConcreteTenderUrl(host, path, url);

  if (isJobOrRecruitingResult(text, host, path)) {
    return { allowed: false, reason: "job/recruiting result" };
  }

  if (isNonProductionTenderUrl(host)) {
    return { allowed: false, reason: "non-production tender URL" };
  }

  if (/\/(?:arkiv|archive)(?:\/|$)/.test(url)) {
    return { allowed: false, reason: "archived tender URL" };
  }

  if (isLegacyUdbudTenderUrl(host, path)) {
    return { allowed: false, reason: "legacy udbud.dk archive URL" };
  }

  if (isTenderAttachmentUrl(path, url)) {
    return { allowed: false, reason: "tender attachment, not notice page" };
  }

  if (candidate.candidateKind === "source" && !concreteTenderUrl) {
    return { allowed: false, reason: "generic tender source, not a concrete opportunity" };
  }

  if (!concreteTenderUrl && isGenericTenderSource(text, host, path)) {
    return { allowed: false, reason: "generic tender source, not a concrete opportunity" };
  }

  if (isGenericTenderTitle(`${candidate.title ?? ""}`.toLowerCase()) && !hasTenderDeadlineEvidence(candidate, text)) {
    return { allowed: false, reason: "generic tender title without active deadline" };
  }

  if (!hasTenderCue(text, url)) {
    return { allowed: false, reason: "missing tender evidence" };
  }

  if (!hasTenderDeadlineEvidence(candidate, text)) {
    return { allowed: false, reason: "missing active tender deadline" };
  }

  if (hasLongRunningTenderHorizon(candidate) || isPurchasingSystemOrCatalogue(text)) {
    return { allowed: false, reason: "long-running procurement system/catalogue" };
  }

  if (isBroadFrameworkTender(text)) {
    return { allowed: false, reason: "broad framework agreement" };
  }

  if (isResearchPolicyTender(evidenceText)) {
    return { allowed: false, reason: "research/policy services, not software delivery" };
  }

  if (!hasTenderConcreteCue(candidate, text, url, concreteTenderUrl)) {
    return { allowed: false, reason: "missing concrete submission/deadline evidence" };
  }

  if (!hasTechnicalTenderScope(evidenceText)) {
    return { allowed: false, reason: "missing software/technical scope" };
  }

  return { allowed: true };
}

export function filterLaneCandidates<T extends CandidateLike>(
  lane: LaneLike,
  candidates: T[],
): { candidates: T[]; removed: number; reasons: string[] } {
  const reasonCounts = new Map<string, number>();
  const filtered: T[] = [];

  for (const candidate of candidates) {
    const gate = laneCandidateGate(lane, candidate);
    if (gate.allowed) {
      filtered.push(candidate);
      continue;
    }
    const reason = gate.reason ?? "lane guard";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const reasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${count} ${reason}`);

  return {
    candidates: filtered,
    removed: candidates.length - filtered.length,
    reasons,
  };
}

export function filterVisibleLaneCandidates<T extends CandidateLike & { lane?: LaneLike | null }>(
  candidates: T[],
): T[] {
  return candidates.filter((candidate) => {
    if (!candidate.lane) return true;
    return laneCandidateGate(candidate.lane, candidate).allowed;
  });
}

function includesTerm(text: string, term: string) {
  const t = term.toLowerCase().trim();
  if (!t) return false;
  if (/^[a-z0-9æøå]{1,3}$/i.test(t)) {
    return new RegExp(`(^|[^a-z0-9æøå])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9æøå]|$)`, "i")
      .test(text);
  }
  return text.includes(t);
}

function evidenceSatisfied(lane: LaneLike, requirement: string, candidate: CandidateLike, text: string) {
  const req = requirement.toLowerCase();
  const hasBudget = candidate.budgetMin != null || candidate.budgetMax != null;
  const hasDeadline = Boolean(candidate.deadline);
  const hasOrg = Boolean(candidate.organization || candidate.sourceName);
  const hasUrl = Boolean(candidate.url);
  const contactable = hasUrl || /@|contact|kontakt|reach|email|e-mail|linkedin/.test(text);
  const funding = /grant|funded|voucher|tilskud|bevilling|smv.?digital|innobooster|funding/.test(text);
  const technicalNeed = /mvp|prototype|poc|software|app|webapp|ai|llm|automation|automatisering|data|dashboard|workflow|internal tool|digitalisering/.test(text);
  const buyer = hasOrg || /buyer|kunde|company|startup|founder|programme|program|ordning|kommune|municipality/.test(text);
  const relationship = /past customer|warm intro|referral|follow-up|dormant|known contact|tidligere kunde|netværk/.test(text);
  const sourceContext = Boolean(candidate.rawContent || candidate.description);

  if (lane.slug === "tenders-procurement") {
    if (/scope/.test(req)) return hasTechnicalTenderScope(candidateEvidenceText(candidate));
    if (/deadline|active call/.test(req)) return hasTenderDeadlineEvidence(candidate, text);
    if (/submission|route|frist/.test(req)) {
      const { host, path, url } = candidateUrlParts(candidate.url);
      return hasTenderConcreteCue(candidate, text, url, isConcreteTenderUrl(host, path, url));
    }
    if (/buyer|ordregiver/.test(req)) return hasTenderBuyerEvidence(candidate, text);
  }

  if (/budget|funding|funded|tilskud|grant|programme|program/.test(req)) return hasBudget || funding || buyer;
  if (/deadline|active call|submission|frist|route/.test(req)) return hasDeadline || /deadline|frist|apply|application|submit|ansøg|tilbud/.test(text);
  if (/buyer|programme|company|account|founder|author|contact|reachable/.test(req)) return buyer || contactable;
  if (/product|technical|automation|data|business pain|explicit need|reason to act/.test(req)) return technicalNeed;
  if (/user-supplied|relationship|reconnect|manual|context/.test(req)) return sourceContext || relationship;
  if (/next action/.test(req)) return /follow-up|call|meeting|intro|proposal|scope|demo/.test(text);
  return includesTerm(text, req);
}

export function laneFit(lane: LaneLike, candidate: CandidateLike): LaneFitResult {
  const text = candidateText(candidate);
  const matchedKeywords = uniqueStrings(
    lane.positiveKeywords.filter((term) => includesTerm(text, term)),
    8,
  );
  const blockedKeywords = uniqueStrings(
    lane.negativeKeywords.filter((term) => includesTerm(text, term)),
    6,
  );
  const evidenceMatches = uniqueStrings(
    lane.evidenceRequirements.filter((requirement) => evidenceSatisfied(lane, requirement, candidate, text)),
    6,
  );
  const missingEvidence = uniqueStrings(
    lane.evidenceRequirements.filter((requirement) => !evidenceMatches.includes(requirement)),
    4,
  );

  const evidenceRatio = lane.evidenceRequirements.length
    ? evidenceMatches.length / lane.evidenceRequirements.length
    : 0.6;
  let delta = 0;

  if (matchedKeywords.length >= 4) delta += 18;
  else if (matchedKeywords.length >= 2) delta += 10;
  else if (matchedKeywords.length === 1) delta += 4;
  else delta -= 10;

  if (evidenceRatio >= 0.8) delta += 12;
  else if (evidenceRatio >= 0.5) delta += 6;
  else if (lane.evidenceRequirements.length) delta -= 8;

  if (candidate.sourceKind === "source-scan") delta += 3;
  if (candidate.budgetMin != null || candidate.budgetMax != null) delta += 4;
  if (candidate.deadline) delta += 3;
  if (blockedKeywords.length) delta -= Math.min(34, 18 + (blockedKeywords.length - 1) * 6);

  const confidenceBonus = Math.max(0, Math.min(14, evidenceMatches.length * 3 + (matchedKeywords.length >= 2 ? 3 : 0)));
  const priority = evidenceRatio >= 0.8 && matchedKeywords.length >= 3 && blockedKeywords.length === 0
    ? 2
    : evidenceRatio >= 0.5 && matchedKeywords.length >= 2
      ? 1
      : 0;
  const reasons = [
    matchedKeywords.length ? `Lane match: ${matchedKeywords.slice(0, 4).join(", ")}` : "Weak lane keyword match",
    evidenceMatches.length ? `Evidence met: ${evidenceMatches.slice(0, 3).join(", ")}` : "",
    missingEvidence.length ? `Missing evidence: ${missingEvidence.slice(0, 2).join(", ")}` : "",
    blockedKeywords.length ? `Negative signal: ${blockedKeywords.slice(0, 3).join(", ")}` : "",
  ].filter(Boolean);
  const signals = [
    `lane:${lane.slug}`,
    ...matchedKeywords.slice(0, 5).map((keyword) => `match:${keyword}`),
    ...evidenceMatches.slice(0, 3).map((requirement) => `evidence:${requirement}`),
    ...blockedKeywords.slice(0, 3).map((keyword) => `avoid:${keyword}`),
  ];

  return {
    delta: Math.max(-45, Math.min(35, delta)),
    confidenceBonus,
    priority,
    matchedKeywords,
    blockedKeywords,
    evidenceMatches,
    missingEvidence,
    reasons,
    signals,
  };
}
