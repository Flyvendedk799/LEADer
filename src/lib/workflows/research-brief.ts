import type { TaskPriority, Workspace } from "@prisma/client";

export type ResearchSubjectType = "person" | "company" | "unknown";
export type ResearchObjective = "find-contact" | "qualify-lead" | "map-opportunity" | "verify-identity" | "general";
export type ResearchDepth = "quick" | "standard" | "deep";

export type ResearchBriefOptions = {
  subject: string;
  subjectType?: ResearchSubjectType;
  objective?: ResearchObjective;
  depth?: ResearchDepth;
  accountId?: string;
  personId?: string;
  dealId?: string;
  candidateId?: string;
  createTasks?: boolean;
};

export type NormalizedResearchBriefOptions = Required<
  Pick<ResearchBriefOptions, "subject" | "subjectType" | "objective" | "depth" | "createTasks">
> & Pick<ResearchBriefOptions, "accountId" | "personId" | "dealId" | "candidateId">;

export type ResearchChecklistItem = {
  stage: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dueInDays: number;
  searchPrompts: string[];
  acceptanceCriteria: string[];
};

export type ResearchWorksheetField = {
  id: string;
  label: string;
  capture: string;
  evidence: string;
  sourcePrompts: string[];
};

export type ResearchWorksheetSection = {
  id: string;
  title: string;
  purpose: string;
  fields: ResearchWorksheetField[];
};

export type ResearchRunbookStep = {
  id: string;
  title: string;
  goal: string;
  searchPrompts: string[];
  capture: string[];
  stopWhen: string;
  routePriority?: string[];
};

export type ResearchDecisionField = {
  id: string;
  label: string;
  prompt: string;
  evidence: string;
  sourcePrompts: string[];
};

export type ResearchDecisionFrame = {
  id: string;
  title: string;
  purpose: string;
  outcomes: string[];
  confidenceScale: string[];
  fields: ResearchDecisionField[];
};

type ResearchStepTemplate = [
  stage: string,
  title: string,
  description: string,
  priority: TaskPriority,
  searchPrompts: string[],
];

type SubjectClues = {
  emails: string[];
  phones: string[];
  domains: string[];
  handles: string[];
  nameHints: string[];
};

export type ResearchSubjectClueSummary = {
  id: "email" | "phone" | "domain" | "name-hint";
  label: string;
  value: string;
};

const SUBJECT_TYPES = new Set<ResearchSubjectType>(["person", "company", "unknown"]);
const OBJECTIVES = new Set<ResearchObjective>([
  "find-contact",
  "qualify-lead",
  "map-opportunity",
  "verify-identity",
  "general",
]);
const DEPTHS = new Set<ResearchDepth>(["quick", "standard", "deep"]);

function cleanText(value: unknown, limit = 240) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function typedValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T) {
  return typeof value === "string" && allowed.has(value as T) ? (value as T) : fallback;
}

function researchObjectiveCue(value: string): ResearchObjective | undefined {
  const lower = value.toLowerCase();
  if (/verify|confirm|identity|same person|same company|hvem er|who is/.test(lower)) return "verify-identity";
  if (/opportunity|tender|procurement|udbud|buying signal|lead map|map.*lead|find more|explore/.test(lower)) {
    return "map-opportunity";
  }
  if (/phone|telefon|mobile|email|e-mail|contact|kontakt|linkedin|reach/.test(lower)) return "find-contact";
  return undefined;
}

function researchDepthCue(value: string): ResearchDepth | undefined {
  const lower = value.toLowerCase();
  if (/deep|thorough|thorougher|top to bottom|everything|full|complete|explore/.test(lower)) return "deep";
  if (/quick|fast|light|brief/.test(lower)) return "quick";
  return undefined;
}

function researchSubjectTypeCue(value: string): ResearchSubjectType | undefined {
  const lower = value.toLowerCase();
  if (/person|name|founder|ceo|cto|owner|kontaktperson|medarbejder|employee/.test(lower)) return "person";
  if (/company|account|buyer|business|organisation|organization|virksomhed|firma|kunde/.test(lower)) return "company";
  return undefined;
}

function cleanOperatorSubject(value: string) {
  return cleanText(value, 220)
    .replace(/^["'“”]+|["'“”.,;:!?]+$/g, "")
    .replace(/\b(?:please|pls|tak|thanks)\b/gi, "")
    .replace(/\b(?:quick|standard|deep|thorough|thorougher|top to bottom|everything|full|complete|brief)\b/gi, "")
    .replace(/^(?:for|of|on|about|around|to)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function researchSubjectFromOperatorText(value: string) {
  const text = cleanText(value, 500);
  const patterns = [
    /\b(?:find|get|look up|lookup|research|verify|map|explore)\s+(?:me\s+)?(?:the\s+)?(?:phone number|telefonnummer|phone|telefon|mobile|email|e-mail|contact route|contact details|contact info|contact|kontakt|linkedin|profile|identity)\s+(?:for|of|on|about|to)\s+(.+)$/i,
    /\b(?:find|get|look up|lookup)\s+(.+?)\s+(?:phone number|telefonnummer|phone|telefon|mobile|email|e-mail|contact route|contact details|contact info|contact|kontakt|linkedin|profile)$/i,
    /\b(?:research|osint|verify|map|explore)\s+(?:the\s+)?(?:person|company|account|buyer|lead|opportunity|contact)?\s*(?:for|on|about|around)?\s+(.+)$/i,
    /\b(?:who is|hvem er)\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const subject = cleanOperatorSubject(text.match(pattern)?.[1] ?? "");
    if (subject.length >= 2) return subject;
  }

  return cleanOperatorSubject(text);
}

function normalizeResearchSubjectInput(value: unknown) {
  const raw = cleanText(value, 500);
  const objective = researchObjectiveCue(raw);
  const depth = researchDepthCue(raw);
  const subjectType = researchSubjectTypeCue(raw) ?? (objective === "map-opportunity" ? "company" : undefined);
  const subject = researchSubjectFromOperatorText(raw);
  return {
    subject: cleanText(subject || raw, 160),
    objective,
    depth,
    subjectType,
  };
}

function quoted(subject: string) {
  return `"${subject.replace(/"/g, "")}"`;
}

function cleanDomain(value?: string | null) {
  const raw = value?.trim().toLowerCase();
  if (!raw) return "";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0] ?? "";
  }
}

function subjectClues(subject: string): SubjectClues {
  const emails = uniqueLoose(
    [...subject.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)].map((match) => match[0].toLowerCase()),
    3,
  );
  const urlDomains = [...subject.matchAll(/https?:\/\/[^\s]+/gi)]
    .map((match) => cleanDomain(match[0]))
    .filter(Boolean);
  const bareDomains = [...subject.matchAll(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi)]
    .filter((match) => {
      const index = match.index ?? 0;
      const before = subject[index - 1] ?? "";
      const after = subject[index + match[0].length] ?? "";
      return before !== "@" && after !== "@";
    })
    .map((match) => cleanDomain(match[0]))
    .filter((domain) => domain && !emails.some((email) => email.endsWith(`@${domain}`)));
  const domains = uniqueLoose([...emails.map((email) => email.split("@")[1]), ...urlDomains, ...bareDomains], 4);
  const phones = uniqueLoose(
    [...subject.matchAll(/(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){2,}\d{2,4}/g)]
      .map((match) => match[0].replace(/\s+/g, " ").trim())
      .filter((value) => value.replace(/\D/g, "").length >= 7),
    3,
  );
  const handles = uniqueLoose(
    emails
      .map((email) => email.split("@")[0])
      .map((handle) => handle.replace(/[._%+-]+/g, " ").trim())
      .filter((handle) => handle.length >= 2),
    3,
  );
  const nameHints = uniqueLoose(
    handles
      .map((handle) => handle.replace(/\d+/g, "").replace(/\s+/g, " ").trim())
      .filter((handle) => /[a-z]/i.test(handle) && handle.length >= 3),
    3,
  );
  return { emails, phones, domains, handles, nameHints };
}

export function researchSubjectClueSummary(subject: string): ResearchSubjectClueSummary[] {
  const clues = subjectClues(cleanText(subject, 500));
  return [
    ...clues.emails.map((value) => ({ id: "email" as const, label: "Email", value })),
    ...clues.phones.map((value) => ({ id: "phone" as const, label: "Phone", value })),
    ...clues.domains.map((value) => ({ id: "domain" as const, label: "Domain", value })),
    ...clues.nameHints.map((value) => ({ id: "name-hint" as const, label: "Name hint", value })),
  ].slice(0, 8);
}

function isGenericEmailLocal(local: string) {
  return /^(?:admin|contact|hello|hi|info|kontakt|mail|office|post|sales|support|kundeservice)$/i.test(local.trim());
}

function hasCompanyCue(subject: string) {
  return /\b(?:a\/s|aps|i\/s|ab|agency|bureau|company|consulting|digital|gmbh|group|hospital|inc|kommune|ltd|ministeriet|municipality|oy|region|saas|school|skole|solutions|styrelsen|systems|technologies|university|universitet|virksomhed)\b/i.test(
    subject,
  );
}

function isPersonNameLike(subject: string) {
  const cleaned = cleanText(subject, 160);
  if (!cleaned || hasCompanyCue(cleaned)) return false;
  if (/[0-9@:/\\]|\.com\b|\.dk\b|\.net\b|\.org\b/i.test(cleaned)) return false;
  return /^[\p{L}'’-]+(?:\s+[\p{L}'’-]+){1,3}$/u.test(cleaned);
}

function inferredSubjectType(subject: string, requested: ResearchSubjectType): ResearchSubjectType {
  if (requested !== "unknown") return requested;
  const clues = subjectClues(subject);
  if (clues.emails.length) {
    const local = clues.emails[0].split("@")[0]?.replace(/[._%+-]+/g, " ").trim() ?? "";
    return local && !isGenericEmailLocal(local) && local.split(/\s+/).length >= 2 ? "person" : "company";
  }
  if (clues.domains.length || hasCompanyCue(subject)) return "company";
  if (isPersonNameLike(subject)) return "person";
  return "unknown";
}

function inferredObjective(
  subject: string,
  subjectType: ResearchSubjectType,
  requested: ResearchObjective,
): ResearchObjective {
  if (requested !== "qualify-lead") return requested;
  const clues = subjectClues(subject);
  if (clues.phones.length && !clues.emails.length && !clues.domains.length) return "verify-identity";
  if (subjectType === "person") return "find-contact";
  if (subjectType === "company" && (clues.emails.length || clues.domains.length)) return "find-contact";
  return requested;
}

function uniqueLoose(values: (string | undefined | null)[], limit = values.length) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value, 120);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= limit) break;
  }
  return out;
}

function cluePrompts(subject: string, workspace: Workspace) {
  const clues = subjectClues(subject);
  return uniqueLoose([
    ...clues.emails.map((email) => quoted(email)),
    ...clues.phones.map((phone) => quoted(phone)),
    ...clues.domains.flatMap((domain) => [
      `site:${domain}`,
      `${domain} contact`,
      workspace === "DK" ? `${domain} kontakt` : `${domain} team`,
      ...(workspace === "GLOBAL" ? [`${domain} kontakt`] : []),
    ]),
    ...clues.nameHints.flatMap((name) => [
      quoted(name),
      ...clues.domains.map((domain) => `${quoted(name)} site:${domain}`),
    ]),
  ], 10);
}

function domainSurfacePrompts(subject: string, workspace: Workspace) {
  const clues = subjectClues(subject);
  return uniqueLoose(
    clues.domains.flatMap((domain) => [
      `site:${domain} ${quoted(subject)}`,
      ...clues.nameHints.map((name) => `${quoted(name)} site:${domain}`),
      workspace === "DK" ? `site:${domain} kontakt` : `site:${domain} contact`,
      workspace === "DK" ? `site:${domain} medarbejdere` : `site:${domain} team`,
      workspace === "DK" ? `site:${domain} presse` : `site:${domain} press`,
      workspace === "DK" ? `${domain} telefon` : `${domain} phone`,
      ...(workspace === "GLOBAL"
        ? [`site:${domain} kontakt`, `site:${domain} medarbejdere`, `site:${domain} presse`, `${domain} telefon`]
        : []),
      `${domain} email pattern`,
    ]),
    12,
  );
}

function personSurfacePrompts(subject: string, workspace: Workspace) {
  const publicSurfaces =
    workspace === "DK"
      ? [
          `${quoted(subject)} site:linkedin.com/in`,
          `${quoted(subject)} LinkedIn nuværende organisation`,
          `${quoted(subject)} medarbejder`,
          `${quoted(subject)} team`,
          `${quoted(subject)} organisation`,
          `${quoted(subject)} site:proff.dk`,
          `${quoted(subject)} site:datacvr.virk.dk`,
        ]
      : [
          `${quoted(subject)} site:linkedin.com/in`,
          `${quoted(subject)} LinkedIn current organization`,
          `${quoted(subject)} LinkedIn nuværende organisation`,
          `${quoted(subject)} current employer`,
          `${quoted(subject)} nuværende rolle`,
          `${quoted(subject)} staff`,
          `${quoted(subject)} medarbejder`,
          `${quoted(subject)} team`,
          `${quoted(subject)} organization`,
          `${quoted(subject)} organisation`,
          `${quoted(subject)} professional profile`,
        ];
  return uniqueLoose([...publicSurfaces, ...domainSurfacePrompts(subject, workspace), ...cluePrompts(subject, workspace)], 14);
}

function clueCapture(subject: string) {
  const clues = subjectClues(subject);
  const parts = [
    clues.emails.length ? `email: ${clues.emails.join(", ")}` : "",
    clues.phones.length ? `phone: ${clues.phones.join(", ")}` : "",
    clues.domains.length ? `domain: ${clues.domains.join(", ")}` : "",
    clues.nameHints.length ? `name hint: ${clues.nameHints.join(", ")}` : "",
  ].filter(Boolean);
  return parts.length ? `Structured input pivots (${parts.join("; ")})` : "";
}

function officialPrompts(subject: string, workspace: Workspace, subjectType: ResearchSubjectType) {
  const pivots = cluePrompts(subject, workspace);
  const base = workspace === "DK"
    ? [
        `${quoted(subject)} officiel hjemmeside`,
        `${quoted(subject)} kontakt`,
        `${quoted(subject)} LinkedIn`,
      ]
    : [
        `${quoted(subject)} official website`,
        `${quoted(subject)} contact`,
        `${quoted(subject)} officiel hjemmeside`,
        `${quoted(subject)} kontakt`,
        `${quoted(subject)} LinkedIn`,
      ];
  if (pivots.length) {
    base.unshift(...pivots);
  }
  if (workspace === "DK") {
    base.push(`${quoted(subject)} CVR`, `${quoted(subject)} virk.dk`);
  }
  if (subjectType === "company") {
    base.push(
      workspace === "DK" ? `${quoted(subject)} ledelse` : `${quoted(subject)} management`,
      workspace === "DK" ? `${quoted(subject)} pressemeddelelse` : `${quoted(subject)} press release`,
      ...(workspace === "GLOBAL" ? [`${quoted(subject)} ledelse`, `${quoted(subject)} pressemeddelelse`] : []),
    );
  }
  if (subjectType === "person") {
    base.push(
      `${quoted(subject)} rolle organisation`,
      ...(workspace === "GLOBAL" ? [`${quoted(subject)} current organization`, `${quoted(subject)} current role`] : []),
      `${quoted(subject)} email site:linkedin.com/in`,
    );
  }
  return base;
}

function contactPrompts(subject: string, workspace: Workspace) {
  const pivots = cluePrompts(subject, workspace);
  return uniqueLoose([
    `${quoted(subject)} kontakt`,
    `${quoted(subject)} email`,
    ...pivots,
    ...domainSurfacePrompts(subject, workspace),
    `${quoted(subject)} phone`,
    `${quoted(subject)} telefon`,
    `${quoted(subject)} contact form`,
    `${quoted(subject)} switchboard`,
    workspace === "DK" ? `${quoted(subject)} CVR telefon` : `${quoted(subject)} company switchboard`,
  ], 18);
}

function affiliationPrompts(subject: string, workspace: Workspace) {
  const pivots = cluePrompts(subject, workspace);
  const base = workspace === "DK"
    ? [
        `${quoted(subject)} LinkedIn`,
        `${quoted(subject)} rolle organisation`,
        `${quoted(subject)} nuværende rolle`,
        `${quoted(subject)} firma`,
        `${quoted(subject)} virksomhed`,
        `${quoted(subject)} email site:linkedin.com/in`,
      ]
    : [
        `${quoted(subject)} LinkedIn`,
        `${quoted(subject)} role organization`,
        `${quoted(subject)} rolle organisation`,
        `${quoted(subject)} current role`,
        `${quoted(subject)} nuværende rolle`,
        `${quoted(subject)} company`,
        `${quoted(subject)} firma`,
        `${quoted(subject)} virksomhed`,
        `${quoted(subject)} email site:linkedin.com/in`,
      ];
  base.push(...pivots);
  if (workspace === "DK") {
    base.push(`${quoted(subject)} proff`, `${quoted(subject)} CVR`);
  }
  return base;
}

function opportunityPrompts(subject: string, workspace: Workspace) {
  const clues = subjectClues(subject);
  return [
    `${quoted(subject)} digitalisering`,
    `${quoted(subject)} software`,
    `${quoted(subject)} automation`,
    workspace === "DK" ? `${quoted(subject)} udbud` : `${quoted(subject)} tender`,
    workspace === "DK" ? `${quoted(subject)} offentligt indkøb` : `${quoted(subject)} procurement`,
    ...(workspace === "GLOBAL"
      ? [`${quoted(subject)} udbud`, `${quoted(subject)} offentligt indkøb`, `${quoted(subject)} opgave`, `${quoted(subject)} leverandør`]
      : []),
    ...clues.domains.map((domain) => (workspace === "DK" ? `${domain} udbud` : `${domain} procurement`)),
    ...(workspace === "GLOBAL" ? clues.domains.flatMap((domain) => [`${domain} udbud`, `${domain} leverandør`]) : []),
  ];
}

function registryPrompts(subject: string, workspace: Workspace) {
  return workspace === "DK"
    ? [`${quoted(subject)} site:proff.dk OR site:datacvr.virk.dk`]
    : [`${quoted(subject)} company registry`, `${quoted(subject)} virksomhedsregister`, `${quoted(subject)} official domain`];
}

function worksheetField(
  id: string,
  label: string,
  capture: string,
  evidence: string,
  sourcePrompts: string[],
): ResearchWorksheetField {
  return {
    id,
    label,
    capture,
    evidence,
    sourcePrompts: sourcePrompts.slice(0, 5),
  };
}

function decisionField(
  id: string,
  label: string,
  prompt: string,
  evidence: string,
  sourcePrompts: string[],
): ResearchDecisionField {
  return {
    id,
    label,
    prompt,
    evidence,
    sourcePrompts: sourcePrompts.slice(0, 5),
  };
}

function runbookStep(
  id: string,
  title: string,
  goal: string,
  searchPrompts: string[],
  capture: string[],
  stopWhen: string,
  routePriority?: string[],
): ResearchRunbookStep {
  return {
    id,
    title,
    goal,
    searchPrompts: searchPrompts.slice(0, 6),
    capture,
    stopWhen,
    ...(routePriority?.length ? { routePriority } : {}),
  };
}

function dueInDays(index: number, depth: ResearchDepth) {
  if (depth === "quick") return index === 0 ? 0 : 1;
  if (depth === "deep") return Math.min(4, Math.floor(index / 2));
  return Math.min(2, Math.floor(index / 3));
}

function acceptanceCriteria(stage: string, objective: ResearchObjective, workspace: Workspace): string[] {
  const common = [
    "Record every useful source URL, date checked, and why the source belongs to this subject.",
    "Mark weak, uncertain, or conflicting evidence instead of silently treating it as true.",
  ];
  const byStage: Record<string, string[]> = {
    identity: [
      "At least two independent public signals point to the same person or organization.",
      "Known false matches or same-name lookalikes are noted.",
    ],
    sources: [
      "Official website, registry/profile, or authoritative public page is saved.",
      workspace === "DK"
        ? "CVR/virk/proff-style registry evidence is checked when the subject is a Danish company."
        : "Country, legal entity, and official domain are checked when available.",
    ],
    contact: [
      "Contact route is public and compliant: switchboard, contact form, role inbox, official page, or public professional profile.",
      "Direct phone/email is only used when it appears on an official or intentionally public professional source.",
    ],
    affiliation: [
      "Current organization and role are identified before direct phone/email hits are trusted.",
      "At least one public source links the person to that organization or role.",
      "If no current organization is found, the result says so and uses only general public contact routes.",
    ],
    "route-validation": [
      "Each candidate phone/email/profile is tied back to the right organization or role.",
      "Domain/email pattern candidates are marked unverified unless a public source confirms ownership.",
      "A primary route and fallback route are chosen, with confidence noted.",
    ],
    context: [
      "Buying responsibility, likely trigger, and relevant recent activity are summarized separately from guesses.",
      "If no buying signal exists, the next action says so plainly.",
    ],
    fit: [
      "Opportunity hypothesis names problem, trigger, buyer, route, confidence, and missing evidence.",
      "The hypothesis distinguishes source-backed facts from assumptions.",
    ],
    outreach: [
      "First message references one verified source-backed reason for contact.",
      "Channel, fallback channel, and next best action are clear.",
    ],
    "source-log": [
      "Useful clues and dead ends are both listed so the work can be resumed later.",
      "Screenshots or copied snippets are summarized without storing sensitive private data.",
    ],
    aliases: [
      "Spelling variants, former organizations, and same-name false positives are listed.",
      "At least one rule-out signal is captured for confusing matches.",
    ],
    procurement: [
      "Active tenders/grants/buying signals are separated from expired archives and generic portals.",
      "Submission route and deadline are checked before treating anything as an opportunity.",
    ],
    timeline: [
      "Recent dated events are ordered newest-first with source links.",
      "Signals older than 12 months are marked as background, not current intent.",
    ],
    network: [
      "Adjacent contacts are public, role-relevant, and linked to the same organization.",
      "Fallback contact route does not rely on private or leaked personal data.",
    ],
  };
  const objectiveSpecific =
    objective === "find-contact"
      ? ["The final answer includes the safest usable contact route, not just raw search hits."]
      : objective === "map-opportunity"
        ? ["The final answer says whether there is a concrete opportunity, a weak signal, or no opportunity yet."]
        : objective === "verify-identity"
          ? ["The final answer states what would change your confidence up or down."]
          : [];
  return [...(byStage[stage] ?? common), ...objectiveSpecific].slice(0, 4);
}

function item(
  subject: string,
  index: number,
  depth: ResearchDepth,
  objective: ResearchObjective,
  workspace: Workspace,
  stage: string,
  title: string,
  description: string,
  priority: TaskPriority,
  searchPrompts: string[],
): ResearchChecklistItem {
  const criteria = acceptanceCriteria(stage, objective, workspace);
  return {
    stage,
    title: `Research ${stage.toLowerCase()}: ${subject}`,
    description: `${title}\n\n${description}\n\nDone when:\n${criteria.map((criterion) => `- ${criterion}`).join("\n")}\n\nSearch prompts:\n${searchPrompts.map((prompt) => `- ${prompt}`).join("\n")}`,
    priority,
    dueInDays: dueInDays(index, depth),
    searchPrompts,
    acceptanceCriteria: criteria,
  };
}

export function normalizeResearchBriefOptions(
  options: Partial<ResearchBriefOptions> | null | undefined,
): NormalizedResearchBriefOptions {
  const parsed = normalizeResearchSubjectInput(options?.subject);
  const subject = parsed.subject;
  const requestedSubjectType = typedValue(options?.subjectType, SUBJECT_TYPES, "unknown");
  const requestedObjective = typedValue(options?.objective, OBJECTIVES, "qualify-lead");
  const requestedDepth = typedValue(options?.depth, DEPTHS, "standard");
  const objectiveSeed =
    requestedObjective === "qualify-lead" && parsed.objective ? parsed.objective : requestedObjective;
  const subjectTypeSeed =
    requestedSubjectType === "unknown" && parsed.subjectType
      ? parsed.subjectType
      : requestedSubjectType === "unknown" && objectiveSeed === "map-opportunity"
        ? "company"
        : requestedSubjectType;
  const subjectType = inferredSubjectType(subject, subjectTypeSeed);
  const objective = inferredObjective(subject, subjectType, objectiveSeed);
  return {
    subject,
    subjectType,
    objective,
    depth: requestedDepth === "standard" && parsed.depth ? parsed.depth : requestedDepth,
    accountId: cleanText(options?.accountId, 120) || undefined,
    personId: cleanText(options?.personId, 120) || undefined,
    dealId: cleanText(options?.dealId, 120) || undefined,
    candidateId: cleanText(options?.candidateId, 120) || undefined,
    createTasks: options?.createTasks !== false,
  };
}

export function buildResearchChecklist(
  options: NormalizedResearchBriefOptions,
  workspace: Workspace,
): ResearchChecklistItem[] {
  const { subject, subjectType, objective, depth } = options;
  const prompts = {
    official: officialPrompts(subject, workspace, subjectType),
    affiliation: affiliationPrompts(subject, workspace),
    contact: contactPrompts(subject, workspace),
    opportunity: opportunityPrompts(subject, workspace),
    surface: subjectType === "person" ? personSurfacePrompts(subject, workspace) : domainSurfacePrompts(subject, workspace),
  };

  const steps: ResearchStepTemplate[] = [
    [
      "identity",
      "Disambiguate the subject",
      "Confirm the exact person or organization with at least two public signals before saving contact details or outreach assumptions.",
      "HIGH",
      prompts.official,
    ],
    ...(subjectType === "person"
      ? ([
          [
            "affiliation",
            "Find current organization and role",
            "Before trusting contact details, establish where this person currently works, what role they hold, and which public source ties them to that organization. Treat same-name profiles as unverified until they match role, geography, or organization.",
            objective === "find-contact" ? "URGENT" : "HIGH",
            prompts.affiliation,
          ],
        ] satisfies ResearchStepTemplate[])
      : []),
    [
      "sources",
      "Map authoritative public sources",
      "Record the official website, organization domain, registry/profile, staff/team page, public profile, and any relevant source URL with the date checked.",
      "HIGH",
      [...prompts.surface, ...prompts.official, ...registryPrompts(subject, workspace)],
    ],
    [
      "contact",
      "Find compliant contact routes",
      "Build a route ladder: official switchboard or form first, then staff/team or department page, role inbox, public professional profile, and only then intentionally published direct phone/email. Do not use private leaked or scraped-only personal data.",
      objective === "find-contact" ? "URGENT" : "HIGH",
      prompts.contact,
    ],
    [
      "route-validation",
      "Validate contact ownership",
      "Check that each possible email, phone number, profile, domain pattern, or department route belongs to the exact subject and current organization before using it.",
      objective === "find-contact" ? "URGENT" : "HIGH",
      [...prompts.contact, ...prompts.surface, `${quoted(subject)} role`, `${quoted(subject)} department`],
    ],
    [
      "context",
      "Establish buying context",
      "Capture role, current organization, likely responsibility, recent projects, hiring/procurement signals, and why this person or account could plausibly buy.",
      "MEDIUM",
      [...prompts.opportunity, `${quoted(subject)} news`, `${quoted(subject)} case study`],
    ],
    [
      "source-log",
      "Keep an evidence ledger",
      "Track useful clues, dead ends, source dates, confidence, and what each source proves. This makes the research resumable after tab close or handoff.",
      "MEDIUM",
      [`${quoted(subject)} official`, `${quoted(subject)} profile`, `${quoted(subject)} news`],
    ],
    [
      "fit",
      "Write the opportunity hypothesis",
      "Summarize problem, likely trigger, reachable buyer, possible budget/urgency, and what evidence is still missing.",
      "MEDIUM",
      prompts.opportunity,
    ],
    [
      "outreach",
      "Prepare the next outreach action",
      "Draft one concise first move with the source-backed reason for contact, channel, fallback channel, and confidence level.",
      "HIGH",
      [`${quoted(subject)} contact form`, `${quoted(subject)} LinkedIn`, `${quoted(subject)} email`],
    ],
  ];

  if (objective === "verify-identity") {
    steps.splice(3, 0, [
      "aliases",
      "Check aliases and false matches",
      "List spelling variants, similarly named people/companies, former organizations, and signals that rule them in or out.",
      "HIGH",
      [`${quoted(subject)} alias`, `${quoted(subject)} former`, `${quoted(subject)} profil`],
    ]);
  }

  if (objective === "map-opportunity") {
    steps.splice(4, 0, [
      "procurement",
      "Check tenders, grants, and buying signals",
      "Look for active or recent tenders, awarded contracts, grant programs, vendor pages, and public buying needs tied to the subject.",
      "HIGH",
      prompts.opportunity,
    ]);
  }

  if (depth === "deep") {
    steps.splice(2, 0, [
      "timeline",
      "Build a recent activity timeline",
      "Collect dated public signals from the last 12 months: launches, hires, tenders, press, partnerships, funding, reports, or public posts.",
      "MEDIUM",
      [`${quoted(subject)} 2026`, `${quoted(subject)} 2025`, `${quoted(subject)} announcement`],
    ]);
    steps.splice(5, 0, [
      "network",
      "Map adjacent contacts",
      "Identify public colleagues, department aliases, switchboard routes, partners, and one fallback contact if the primary route is weak.",
      "MEDIUM",
      [`${quoted(subject)} team`, `${quoted(subject)} medarbejdere`, `${quoted(subject)} organisation`],
    ]);
  }

  const selected =
    depth === "quick" && subjectType === "person" && objective === "find-contact"
      ? steps.filter((step) => ["identity", "affiliation", "contact", "route-validation"].includes(step[0]))
      : depth === "quick"
        ? steps.slice(0, 4)
        : steps;
  return selected.map((step, index) => item(subject, index, depth, objective, workspace, ...step));
}

export function buildResearchWorksheet(
  options: NormalizedResearchBriefOptions,
  workspace: Workspace,
): ResearchWorksheetSection[] {
  const { subject, subjectType, objective, depth } = options;
  const inputClue = clueCapture(subject);
  const prompts = {
    official: officialPrompts(subject, workspace, subjectType),
    affiliation: affiliationPrompts(subject, workspace),
    contact: contactPrompts(subject, workspace),
    opportunity: opportunityPrompts(subject, workspace),
    surface: subjectType === "person" ? personSurfacePrompts(subject, workspace) : domainSurfacePrompts(subject, workspace),
  };
  const sections: ResearchWorksheetSection[] = [
    {
      id: "identity",
      title: "Identity decision",
      purpose: "Resolve the exact person, company, or clue before trusting contact details.",
      fields: [
        ...(inputClue
          ? [
              worksheetField(
                "input-pivots",
                "Input pivots",
                `${inputClue}. Treat each pivot as a lead to verify, not a fact to trust blindly.`,
                "Each email, phone, domain, handle, or name hint is tied back to an official or intentionally public source before use.",
                cluePrompts(subject, workspace),
              ),
            ]
          : []),
        worksheetField(
          "canonical-subject",
          "Confirmed subject",
          "Canonical name, current organization/legal entity, country, and public profile/domain.",
          "Two independent public signals or one official registry/profile plus one corroborating source.",
          prompts.official,
        ),
        worksheetField(
          "confidence",
          "Confidence and ambiguity",
          "High/medium/low confidence, same-name risks, and what would change the conclusion.",
          "Matched facts and conflicting facts are recorded separately.",
          [`${quoted(subject)} alias`, `${quoted(subject)} former`, ...prompts.official],
        ),
        worksheetField(
          "false-positives",
          "Ruled-out matches",
          "People, companies, domains, or profiles that look similar but are not the target.",
          "Each rule-out has a source-backed reason such as wrong role, geography, domain, or date.",
          [`${quoted(subject)} LinkedIn`, `${quoted(subject)} profile`, `${quoted(subject)} CVR`],
        ),
      ],
    },
    {
      id: "source-ledger",
      title: "Source ledger",
      purpose: "Keep the work resumable and separate facts from guesses.",
      fields: [
        worksheetField(
          "authoritative-sources",
          "Authoritative sources",
          "Official website, organization domain, registry, staff/team page, public profile, and dated source URLs.",
          "Every source notes what it proves, date checked, and confidence.",
          [...prompts.surface, ...prompts.official, `${quoted(subject)} official`],
        ),
        worksheetField(
          "dead-ends",
          "Dead ends",
          "Searches that produced no usable public evidence or only weak/private-looking data.",
          "Dead ends include the query used and why the hit should not be used.",
          [`${quoted(subject)} email`, `${quoted(subject)} phone`, `${quoted(subject)} contact`],
        ),
      ],
    },
  ];

  if (subjectType === "person") {
    sections.splice(1, 0, {
      id: "affiliation",
      title: "Current affiliation",
      purpose: "Tie the person to a current organization or role before using direct routes.",
      fields: [
        worksheetField(
          "current-role",
          "Current role",
          "Employer, role/title, department, geography, and how recently the source was updated.",
          "At least one public source links the person to the organization or role.",
          prompts.affiliation,
        ),
        worksheetField(
          "role-relevance",
          "Role relevance",
          "Why this person is likely relevant to buying, partnership, procurement, or referral.",
          "Responsibility is source-backed or explicitly marked as an assumption.",
          [...prompts.opportunity, `${quoted(subject)} responsibility`],
        ),
      ],
    });
  }

  if (objective === "find-contact" || objective === "general") {
    sections.push({
      id: "contact-route",
      title: "Contact route ladder",
      purpose: "Choose a compliant primary route and fallback route, not just a raw phone/email hit.",
      fields: [
        worksheetField(
          "primary-route",
          "Primary route",
          "Official switchboard, contact form, staff/team page, role inbox, or public professional profile to use first.",
          "The route appears on an official or intentionally public professional source.",
          prompts.contact,
        ),
        worksheetField(
          "route-owner",
          "Route ownership",
          "Why the route belongs to this exact person, role, organization, or department instead of a same-name match.",
          "Ownership is tied back to current affiliation, official domain, staff page, or public professional profile.",
          [...prompts.surface, ...prompts.contact],
        ),
        worksheetField(
          "domain-pattern",
          "Domain or email pattern",
          "Official domain, public email pattern seen on staff/role pages, and whether the pattern is confirmed or only a candidate.",
          "Patterns are inferred only from public organization pages and remain unverified until a public direct address or accepted route confirms them.",
          domainSurfacePrompts(subject, workspace).length ? domainSurfacePrompts(subject, workspace) : prompts.contact,
        ),
        worksheetField(
          "phone",
          "Phone or switchboard",
          "Direct phone, main switchboard, department number, or reason no public phone was found.",
          "Phone number is tied to the subject or organization by an official/public source.",
          [`${quoted(subject)} phone`, `${quoted(subject)} telefon`, `${quoted(subject)} CVR telefon`],
        ),
        worksheetField(
          "email",
          "Email or role inbox",
          "Direct email, role inbox, contact form, pattern candidate, or reason email is not usable.",
          "Direct email is public and tied to the exact person/organization; guessed patterns stay unverified.",
          [`${quoted(subject)} email`, `${quoted(subject)} kontakt`, `${quoted(subject)} contact form`],
        ),
        worksheetField(
          "fallback-route",
          "Fallback route",
          "Second-best channel and when to use it.",
          "Fallback is public, role-relevant, and does not rely on private/leaked data.",
          [`${quoted(subject)} LinkedIn`, `${quoted(subject)} team`, `${quoted(subject)} switchboard`, ...prompts.surface],
        ),
      ],
    });
  }

  if (objective === "map-opportunity" || objective === "qualify-lead") {
    sections.push({
      id: "opportunity",
      title: "Opportunity hypothesis",
      purpose: "Separate a concrete opportunity from a weak signal or generic source.",
      fields: [
        worksheetField(
          "trigger",
          "Trigger",
          "Recent project, tender, grant, hire, press item, technology change, or public buying signal.",
          "Trigger is dated and linked to a public source.",
          [...prompts.opportunity, `${quoted(subject)} news`, `${quoted(subject)} announcement`],
        ),
        worksheetField(
          "need",
          "Need and fit",
          "Problem, likely buyer, technical fit, urgency, and what is still missing.",
          "Facts and assumptions are separated; confidence is explicit.",
          prompts.opportunity,
        ),
        worksheetField(
          "procurement-route",
          "Procurement or buying route",
          "Submission route, contact route, tender/grant deadline, or reason there is no route yet.",
          "Active route and deadline are checked before treating it as an opportunity.",
          [
            workspace === "DK" ? `${quoted(subject)} udbud` : `${quoted(subject)} tender`,
            workspace === "DK" ? `${quoted(subject)} offentligt indkøb` : `${quoted(subject)} procurement`,
            ...(workspace === "GLOBAL" ? [`${quoted(subject)} udbud`, `${quoted(subject)} offentligt indkøb`] : []),
            `${quoted(subject)} contact`,
          ],
        ),
      ],
    });
  }

  if (objective === "verify-identity") {
    sections.push({
      id: "verification",
      title: "Verification decision",
      purpose: "Make the match/no-match call explicit.",
      fields: [
        worksheetField(
          "matched-facts",
          "Matched facts",
          "Facts that support this being the correct subject.",
          "Each fact cites a source and can be checked later.",
          prompts.official,
        ),
        worksheetField(
          "conflicts",
          "Conflicts",
          "Facts that weaken the match, including stale roles, wrong country, duplicate names, or domain mismatch.",
          "Each conflict cites a source or says it is unresolved.",
          [`${quoted(subject)} former`, `${quoted(subject)} profile`, `${quoted(subject)} LinkedIn`],
        ),
      ],
    });
  }

  if (depth === "deep") {
    sections.push({
      id: "timeline-network",
      title: "Timeline and adjacent routes",
      purpose: "Capture the broader map without losing the main decision.",
      fields: [
        worksheetField(
          "timeline",
          "Recent activity timeline",
          "Dated public signals from the last 12 months and how each affects priority.",
          "Older signals are marked as background unless they still affect the route.",
          [`${quoted(subject)} 2026`, `${quoted(subject)} 2025`, `${quoted(subject)} announcement`],
        ),
        worksheetField(
          "adjacent-contacts",
          "Adjacent contacts",
          "Public colleagues, department aliases, partners, or switchboard routes if the primary route is weak.",
          "Adjacent contacts are role-relevant and linked to the same organization.",
          [`${quoted(subject)} team`, `${quoted(subject)} medarbejdere`, `${quoted(subject)} organisation`],
        ),
      ],
    });
  }

  sections.push({
    id: "next-action",
    title: "Next action",
    purpose: "End with a usable operator decision.",
    fields: [
      worksheetField(
        "recommended-action",
        "Recommended action",
        "Use route, keep researching, save as low-confidence, or stop because evidence is too weak.",
        "Decision references the strongest source-backed reason and the largest remaining risk.",
        [`${quoted(subject)} contact`, `${quoted(subject)} LinkedIn`, `${quoted(subject)} official`],
      ),
      worksheetField(
        "first-message",
        "First message angle",
        "One concise source-backed reason for contact and the fallback channel.",
        "The message does not mention unverified assumptions as facts.",
        [...prompts.opportunity, ...prompts.contact],
      ),
    ],
  });

  return sections;
}

export function buildResearchDecisionFrame(
  options: NormalizedResearchBriefOptions,
  workspace: Workspace,
): ResearchDecisionFrame {
  const { subject, subjectType, objective } = options;
  const prompts = {
    official: officialPrompts(subject, workspace, subjectType),
    affiliation: affiliationPrompts(subject, workspace),
    contact: contactPrompts(subject, workspace),
    opportunity: opportunityPrompts(subject, workspace),
    surface: subjectType === "person" ? personSurfacePrompts(subject, workspace) : domainSurfacePrompts(subject, workspace),
  };
  const fields: ResearchDecisionField[] = [
    decisionField(
      "outcome",
      "Outcome",
      "Choose the final label for this research pass.",
      "The label follows from the evidence captured below, not from a hunch.",
      [`${quoted(subject)} official`, `${quoted(subject)} profile`, `${quoted(subject)} contact`],
    ),
  ];

  if (objective === "find-contact" || objective === "general") {
    fields.push(
      decisionField(
        "primary-route",
        "Primary route",
        "The safest public route to use first.",
        "Official contact page, switchboard, staff/team page, role inbox, or public professional profile tied to the subject.",
        prompts.contact,
      ),
      decisionField(
        "fallback-route",
        "Fallback route",
        "The second route if the primary route fails.",
        "Fallback is public, role-relevant, and does not rely on private or leaked data.",
        [...prompts.surface, ...prompts.contact],
      ),
      decisionField(
        "phone-or-switchboard",
        "Phone or switchboard",
        "Public direct phone, department number, main switchboard, or reason no phone should be used.",
        "Phone is tied to the exact person, role, department, or organization by an official/public source.",
        [`${quoted(subject)} telefon`, `${quoted(subject)} phone`, `${quoted(subject)} CVR telefon`, ...prompts.contact],
      ),
      decisionField(
        "email-or-inbox",
        "Email or inbox",
        "Direct email, role inbox, contact form, domain pattern candidate, or reason email should not be used.",
        "Direct email is intentionally public and ownership is confirmed; guessed patterns stay marked unverified.",
        [`${quoted(subject)} email`, `${quoted(subject)} kontakt`, `${quoted(subject)} contact form`, ...domainSurfacePrompts(subject, workspace)],
      ),
      decisionField(
        "route-ownership",
        "Route ownership",
        "Why this route belongs to the exact person, role, company, or department.",
        "Ownership is backed by current affiliation, official domain, staff page, public profile, or registry evidence.",
        [...prompts.affiliation, ...prompts.surface],
      ),
    );
  }

  if (objective === "map-opportunity" || objective === "qualify-lead") {
    fields.push(
      decisionField(
        "opportunity-status",
        "Opportunity status",
        "Concrete opportunity, weak signal, monitor only, or no opportunity.",
        "Concrete opportunities have trigger, buyer, route, deadline or reason to act, and source-backed technical fit.",
        prompts.opportunity,
      ),
      decisionField(
        "buyer-trigger",
        "Buyer and trigger",
        "Likely buyer/team and the public event or pain signal that makes outreach timely.",
        "Trigger is dated or tied to a current public source; assumptions are marked separately.",
        [...prompts.opportunity, `${quoted(subject)} news`, `${quoted(subject)} announcement`],
      ),
      decisionField(
        "buying-route",
        "Buying route",
        "Procurement route, tender/grant deadline, contact route, or why no route exists yet.",
        "Route and deadline are checked before treating the lead as actionable.",
        [
          workspace === "DK" ? `${quoted(subject)} udbud` : `${quoted(subject)} tender`,
          workspace === "DK" ? `${quoted(subject)} offentligt indkøb` : `${quoted(subject)} procurement`,
          `${quoted(subject)} contact`,
          ...(workspace === "GLOBAL" ? [`${quoted(subject)} udbud`, `${quoted(subject)} offentligt indkøb`] : []),
        ],
      ),
    );
  }

  if (objective === "verify-identity") {
    fields.push(
      decisionField(
        "match-decision",
        "Match decision",
        "Match, mismatch, or unresolved.",
        "Decision is based on matching and conflicting facts, not only name similarity.",
        prompts.official,
      ),
      decisionField(
        "matched-facts",
        "Matched facts",
        "Facts that support this being the correct subject.",
        "Each fact has a source and can be rechecked later.",
        [...prompts.official, ...prompts.affiliation],
      ),
      decisionField(
        "conflicts",
        "Conflicts",
        "Facts that weaken or block the match.",
        "Wrong geography, stale role, duplicate name, domain mismatch, or source conflict is recorded explicitly.",
        [`${quoted(subject)} former`, `${quoted(subject)} alias`, `${quoted(subject)} profile`],
      ),
    );
  }

  fields.push(
    decisionField(
      "strongest-evidence",
      "Strongest evidence",
      "The one or two source-backed facts that matter most.",
      "Source URL, date checked, and what the source proves are captured.",
      [...prompts.official, ...prompts.surface],
    ),
    decisionField(
      "largest-risk",
      "Largest risk",
      "The biggest reason this could still be wrong.",
      "Same-name risk, stale data, weak ownership, private-data concern, or missing route is named.",
      [`${quoted(subject)} alias`, `${quoted(subject)} former`, `${quoted(subject)} profile`],
    ),
    decisionField(
      "confidence",
      "Confidence",
      "High, medium, or low, plus what would change it.",
      "Confidence is tied to number, quality, recency, and independence of public sources.",
      [...prompts.official, ...prompts.contact],
    ),
    decisionField(
      "next-action",
      "Next action",
      "One sentence with channel, reason, confidence, and fallback.",
      "The action references a verified source-backed reason and avoids unverified assumptions.",
      [`${quoted(subject)} contact`, `${quoted(subject)} LinkedIn`, `${quoted(subject)} official`],
    ),
  );

  const outcomes =
    objective === "find-contact"
      ? ["use primary route", "use fallback route", "keep researching", "do not contact yet"]
      : objective === "map-opportunity" || objective === "qualify-lead"
        ? ["concrete opportunity", "weak signal", "monitor only", "no opportunity"]
        : objective === "verify-identity"
          ? ["match", "mismatch", "unresolved"]
          : ["actionable", "research more", "stop"];

  return {
    id: "operator-decision",
    title: "Operator decision",
    purpose: "End the research pass with a source-backed decision that can be executed or resumed.",
    outcomes,
    confidenceScale: [
      "High: official/current source plus independent corroboration.",
      "Medium: plausible public evidence but one important gap remains.",
      "Low: weak, stale, conflicting, or same-name evidence.",
    ],
    fields,
  };
}

export function buildResearchRunbook(
  options: NormalizedResearchBriefOptions,
  workspace: Workspace,
): ResearchRunbookStep[] {
  const { subject, subjectType, objective, depth } = options;
  const inputClue = clueCapture(subject);
  const prompts = {
    official: officialPrompts(subject, workspace, subjectType),
    affiliation: affiliationPrompts(subject, workspace),
    contact: contactPrompts(subject, workspace),
    opportunity: opportunityPrompts(subject, workspace),
    surface: subjectType === "person" ? personSurfacePrompts(subject, workspace) : domainSurfacePrompts(subject, workspace),
  };
  const steps: ResearchRunbookStep[] = [
    runbookStep(
      "resolve-subject",
      "Resolve the exact subject",
      "Avoid chasing the wrong same-name person, company, or stale profile.",
      prompts.official,
      [
        ...(inputClue ? [inputClue] : []),
        "Canonical name and country",
        subjectType === "person" ? "Current organization and role" : "Official domain or legal entity",
        "Two confirming public signals",
        "Same-name false positives",
      ],
      "Stop when the subject is confirmed or the ambiguity is explicit enough to avoid saving contact details.",
    ),
  ];

  if (subjectType === "person") {
    steps.push(
      runbookStep(
        "current-affiliation",
        "Find current affiliation",
        "Tie the person to a current organization before trusting any phone, email, or profile hit.",
        prompts.affiliation,
        [
          "Current employer or organization",
          "Role/title and department",
          "Source date or recency clue",
          "Evidence that connects the person to the organization",
        ],
        "Stop when one public source links the person to the organization, or mark the route as general-only.",
      ),
    );
  }

  if ((subjectType === "person" || prompts.surface.length > 0) && (objective === "find-contact" || objective === "general")) {
    steps.push(
      runbookStep(
        "search-public-surfaces",
        "Search public surfaces",
        "Work through official organization pages, staff/team pages, registries, and public professional profiles before generic web hits.",
        prompts.surface.length ? prompts.surface : [...prompts.affiliation, ...prompts.contact],
        [
          "Official organization domain",
          "Staff/team, press, or department page",
          "Public professional profile tied to the current organization",
          "Same-name false positives ruled out",
          "Domain/email pattern candidates marked unverified",
        ],
        "Stop when you have the current organization domain and at least one official or professional page, or mark the search unresolved.",
      ),
    );
  }

  if (objective === "find-contact" || objective === "general") {
    steps.push(
      runbookStep(
        "contact-route-ladder",
        "Build the contact route ladder",
        "Choose the safest usable public contact route before looking for direct personal details.",
        prompts.contact,
        [
          "Primary route",
          "Fallback route",
          "Phone or switchboard",
          "Email, role inbox, or contact form",
          "Confidence and why the route belongs to this subject",
        ],
        "Stop when there is one public primary route, one fallback route, and a reason not to use weaker hits.",
        [
          "Official organization contact page or switchboard",
          "Staff/team page, role inbox, or department page",
          "Public professional profile tied to current organization",
          "Direct phone/email only when intentionally public and tied to the exact subject",
        ],
      ),
    );
  }

  if (objective === "map-opportunity" || objective === "qualify-lead") {
    steps.push(
      runbookStep(
        "opportunity-signal-map",
        "Map opportunity signals",
        "Separate concrete buying signals from generic company research.",
        [...prompts.opportunity, `${quoted(subject)} news`, `${quoted(subject)} announcement`],
        [
          "Recent trigger",
          "Likely buyer or team",
          "Technical need",
          "Deadline or reason to act now",
          "Missing evidence",
        ],
        "Stop when the finding can be labeled concrete opportunity, weak signal, or no opportunity yet.",
      ),
    );
  }

  if (objective === "verify-identity") {
    steps.push(
      runbookStep(
        "verification-decision",
        "Make the verification decision",
        "Decide match, mismatch, or unresolved instead of letting ambiguity leak into outreach.",
        [`${quoted(subject)} LinkedIn`, `${quoted(subject)} profile`, `${quoted(subject)} former`, `${quoted(subject)} alias`],
        ["Matched facts", "Conflicting facts", "Rule-out evidence", "Confidence level"],
        "Stop when the next action is match, reject, or continue researching with one named missing fact.",
      ),
    );
  }

  steps.push(
    runbookStep(
      "next-action",
      "Choose the next action",
      "End with an operator decision that can be executed immediately.",
      [`${quoted(subject)} contact`, `${quoted(subject)} LinkedIn`, `${quoted(subject)} official`],
      [
        "Use route, keep researching, save low-confidence, or stop",
        "Source-backed reason for contact",
        "Fallback channel",
        "Largest remaining risk",
      ],
      "Stop when the next action is a single sentence with channel, reason, and confidence.",
    ),
  );

  if (depth === "quick" && subjectType === "person" && (objective === "find-contact" || objective === "general")) {
    return steps.filter((step) =>
      ["resolve-subject", "current-affiliation", "search-public-surfaces", "contact-route-ladder"].includes(step.id),
    );
  }

  return depth === "quick" ? steps.slice(0, Math.min(3, steps.length)) : steps;
}
