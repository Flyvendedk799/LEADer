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

function item(
  subject: string,
  index: number,
  depth: ResearchDepth,
  stage: string,
  title: string,
  description: string,
  priority: TaskPriority,
  searchPrompts: string[],
): ResearchChecklistItem {
  return {
    stage,
    title: `Research ${stage.toLowerCase()}: ${subject}`,
    description: `${title}\n\n${description}\n\nSearch prompts:\n${searchPrompts.map((prompt) => `- ${prompt}`).join("\n")}`,
    priority,
    dueInDays: dueInDays(index, depth),
    searchPrompts,
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
      "Prefer official switchboard, contact form, role email, public professional profile, or explicitly published direct phone/email. Do not use private leaked or scraped-only personal data.",
      objective === "find-contact" ? "URGENT" : "HIGH",
      prompts.contact,
    ],
    [
      "context",
      "Establish buying context",
      "Capture role, current organization, likely responsibility, recent projects, hiring/procurement signals, and why this person or account could plausibly buy.",
      "MEDIUM",
      [...prompts.opportunity, `${quoted(subject)} news`, `${quoted(subject)} case study`],
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
  return selected.map((step, index) => item(subject, index, depth, ...step));
}
