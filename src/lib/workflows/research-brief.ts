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
  createTasks?: boolean;
};

export type NormalizedResearchBriefOptions = Required<
  Pick<ResearchBriefOptions, "subject" | "subjectType" | "objective" | "depth" | "createTasks">
> & Pick<ResearchBriefOptions, "accountId" | "personId" | "dealId">;

export type ResearchChecklistItem = {
  stage: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dueInDays: number;
  searchPrompts: string[];
  acceptanceCriteria: string[];
};

type ResearchStepTemplate = [
  stage: string,
  title: string,
  description: string,
  priority: TaskPriority,
  searchPrompts: string[],
];

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

function quoted(subject: string) {
  return `"${subject.replace(/"/g, "")}"`;
}

function officialPrompts(subject: string, workspace: Workspace, subjectType: ResearchSubjectType) {
  const base = [
    `${quoted(subject)} official website`,
    `${quoted(subject)} contact`,
    `${quoted(subject)} LinkedIn`,
  ];
  if (workspace === "DK") {
    base.push(`${quoted(subject)} CVR`, `${quoted(subject)} virk.dk`);
  }
  if (subjectType === "company") {
    base.push(`${quoted(subject)} management`, `${quoted(subject)} press release`);
  }
  if (subjectType === "person") {
    base.push(`${quoted(subject)} rolle organisation`, `${quoted(subject)} email site:linkedin.com/in`);
  }
  return base;
}

function contactPrompts(subject: string, workspace: Workspace) {
  return [
    `${quoted(subject)} kontakt`,
    `${quoted(subject)} email`,
    `${quoted(subject)} phone`,
    `${quoted(subject)} telefon`,
    `${quoted(subject)} contact form`,
    `${quoted(subject)} switchboard`,
    workspace === "DK" ? `${quoted(subject)} CVR telefon` : `${quoted(subject)} company switchboard`,
  ];
}

function opportunityPrompts(subject: string, workspace: Workspace) {
  return [
    `${quoted(subject)} digitalisering`,
    `${quoted(subject)} software`,
    `${quoted(subject)} automation`,
    workspace === "DK" ? `${quoted(subject)} udbud` : `${quoted(subject)} tender`,
    workspace === "DK" ? `${quoted(subject)} offentligt indkøb` : `${quoted(subject)} procurement`,
  ];
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
    "route-validation": [
      "Each candidate phone/email/profile is tied back to the right organization or role.",
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
  return {
    subject: cleanText(options?.subject, 160),
    subjectType: typedValue(options?.subjectType, SUBJECT_TYPES, "unknown"),
    objective: typedValue(options?.objective, OBJECTIVES, "qualify-lead"),
    depth: typedValue(options?.depth, DEPTHS, "standard"),
    accountId: cleanText(options?.accountId, 120) || undefined,
    personId: cleanText(options?.personId, 120) || undefined,
    dealId: cleanText(options?.dealId, 120) || undefined,
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
    contact: contactPrompts(subject, workspace),
    opportunity: opportunityPrompts(subject, workspace),
  };

  const steps: ResearchStepTemplate[] = [
    [
      "identity",
      "Disambiguate the subject",
      "Confirm the exact person or organization with at least two public signals before saving contact details or outreach assumptions.",
      "HIGH",
      prompts.official,
    ],
    [
      "sources",
      "Map authoritative public sources",
      "Record the official website, public registry/profile, company page, and any relevant source URL with the date checked.",
      "HIGH",
      [...prompts.official, `${quoted(subject)} site:proff.dk OR site:datacvr.virk.dk`],
    ],
    [
      "contact",
      "Find compliant contact routes",
      "Build a route ladder: official switchboard or form first, then role inbox, public professional profile, and only then intentionally published direct phone/email. Do not use private leaked or scraped-only personal data.",
      objective === "find-contact" ? "URGENT" : "HIGH",
      prompts.contact,
    ],
    [
      "route-validation",
      "Validate contact ownership",
      "Check that each possible email, phone number, profile, or department route belongs to the exact subject and current organization before using it.",
      objective === "find-contact" ? "URGENT" : "HIGH",
      [...prompts.contact, `${quoted(subject)} role`, `${quoted(subject)} department`],
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

  const selected = depth === "quick" ? steps.slice(0, 4) : steps;
  return selected.map((step, index) => item(subject, index, depth, objective, workspace, ...step));
}
