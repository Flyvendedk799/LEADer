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
  const base = workspace === "DK"
    ? [
        `${quoted(subject)} officiel hjemmeside`,
        `${quoted(subject)} kontakt`,
        `${quoted(subject)} LinkedIn`,
      ]
    : [
        `${quoted(subject)} official website`,
        `${quoted(subject)} contact`,
        `${quoted(subject)} LinkedIn`,
      ];
  if (workspace === "DK") {
    base.push(`${quoted(subject)} CVR`, `${quoted(subject)} virk.dk`);
  }
  if (subjectType === "company") {
    base.push(
      workspace === "DK" ? `${quoted(subject)} ledelse` : `${quoted(subject)} management`,
      workspace === "DK" ? `${quoted(subject)} pressemeddelelse` : `${quoted(subject)} press release`,
    );
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

function affiliationPrompts(subject: string, workspace: Workspace) {
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
        `${quoted(subject)} current role`,
        `${quoted(subject)} company`,
        `${quoted(subject)} email site:linkedin.com/in`,
      ];
  if (workspace === "DK") {
    base.push(`${quoted(subject)} proff`, `${quoted(subject)} CVR`);
  }
  return base;
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
    affiliation: affiliationPrompts(subject, workspace),
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
  const prompts = {
    official: officialPrompts(subject, workspace, subjectType),
    affiliation: affiliationPrompts(subject, workspace),
    contact: contactPrompts(subject, workspace),
    opportunity: opportunityPrompts(subject, workspace),
  };
  const sections: ResearchWorksheetSection[] = [
    {
      id: "identity",
      title: "Identity decision",
      purpose: "Resolve the exact person, company, or clue before trusting contact details.",
      fields: [
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
          "Official website, registry, company page, public profile, and dated source URLs.",
          "Every source notes what it proves, date checked, and confidence.",
          [...prompts.official, `${quoted(subject)} official`],
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
          "Official switchboard, contact form, role inbox, or public professional profile to use first.",
          "The route appears on an official or intentionally public professional source.",
          prompts.contact,
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
          [`${quoted(subject)} LinkedIn`, `${quoted(subject)} team`, `${quoted(subject)} switchboard`],
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

export function buildResearchRunbook(
  options: NormalizedResearchBriefOptions,
  workspace: Workspace,
): ResearchRunbookStep[] {
  const { subject, subjectType, objective, depth } = options;
  const prompts = {
    official: officialPrompts(subject, workspace, subjectType),
    affiliation: affiliationPrompts(subject, workspace),
    contact: contactPrompts(subject, workspace),
    opportunity: opportunityPrompts(subject, workspace),
  };
  const steps: ResearchRunbookStep[] = [
    runbookStep(
      "resolve-subject",
      "Resolve the exact subject",
      "Avoid chasing the wrong same-name person, company, or stale profile.",
      prompts.official,
      [
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
          "Official switchboard or contact form",
          "Role inbox or department page",
          "Public professional profile",
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

  return depth === "quick" ? steps.slice(0, Math.min(3, steps.length)) : steps;
}
