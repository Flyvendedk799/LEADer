import type { CandidateLike } from "./lanes";

// Supplier fit: can a small development studio (Mast3kmedia) realistically
// deliver this? Lane fit says "this is the kind of thing the lane looks for";
// supplier fit says "and we could win and build it". Without it, large public
// tenders for standard systems or IT outsourcing saturate at a pursuit score of
// 100 and bury the custom-build work the studio actually sells.
//
// Only the title, summary and category are read. Full notice text repeats
// procedural boilerplate ("drift", "licens", "EU") that would otherwise trigger
// on almost every tender.

export const SUPPLIER_FIT_VERSION = 3; // 3: budgets now come from official estimates

/** Contract value above which a lead is out of reach for a small studio (DKK). */
export const DEFAULT_CAPACITY_DKK = 3_000_000;

interface Rule {
  id: string;
  pattern: RegExp;
  delta: number;
  /** Highest pursuit score a lead with this signal can have. */
  cap?: number;
  reason: string;
}

const PENALTIES: Rule[] = [
  {
    id: "infrastructure-outsourcing",
    pattern:
      /outsourc|it-infrastruktur|infrastructure (?:and|&) services|it[- ]infrastructure|it-kapacitet|it capacity|datacenter|data cent(?:er|re)|servicedesk|service desk|it-drift|drift af (?:it|servere|infrastruktur)|hosting(?:ydelser| services)|netværk(?:s(?:udstyr|løsning))?|telefoni|telephony|arbejdspladser|end-user computing/,
    delta: -30,
    cap: 35,
    reason: "IT infrastructure/operations outsourcing, not a build a studio delivers",
  },
  {
    id: "standard-product",
    pattern:
      /\bsaas\b|som en service|as a service|software as a service|standard(?:system|løsning|software|produkt)|off-the-shelf|\bcots\b|licens(?:er)?\b|licen[cs]es?\b|abonnement på|\b(?:esdh|erp|wms|qms|crm|hr|pas|lms|dam|ecm|cms)[- ]?(?:system|løsning|platform)|(?:asset|quality|warehouse|document|records|learning|case) management system|afregningssystem|lønsystem|økonomisystem|ejendomsadministrationssystem|telefoniplatform|digital asset management/,
    delta: -22,
    cap: 50,
    reason: "Buys a standard product or SaaS licence rather than custom development",
  },
  {
    id: "consultant-staffing",
    pattern:
      /(?:it-)?konsulentydelser|konsulentbistand|consultancy services|consulting services|bemanding|staff augmentation|ressourcekonsulent|timebank|rådgivningsydelser/,
    delta: -15,
    cap: 55,
    reason: "Consultant staffing/hours framework rather than a defined project",
  },
  {
    id: "operations-contract",
    pattern:
      /serviceaftale|service agreement|drift og vedligehold|drift, vedligehold|vedligeholdelse og (?:support|videreudvikling)|support og vedligehold|application management|applikationsdrift|maintenance and support contract/,
    delta: -12,
    cap: 65,
    reason: "Operations/maintenance contract for an existing system",
  },
  {
    id: "framework",
    pattern: /rammeaftale|rammekontrakt|framework agreement|framework contract|dynamisk indkøbssystem|dynamic purchasing system/,
    delta: -10,
    cap: 60,
    reason: "Framework agreement: large qualification burden, no guaranteed work",
  },
  {
    id: "heavy-procedure",
    pattern: /udbud med forhandling|konkurrencepræget dialog|competitive dialogue|competitive procedure with negotiation|innovationspartnerskab|begrænset udbud|restricted procedure/,
    delta: -8,
    cap: 70,
    reason: "EU procedure with prequalification; heavy bid effort for a small supplier",
  },
];

// A page about a grant scheme, a how-to guide or a vendor article is not a buyer.
// Read from the title only, where these are unambiguous.
const NOT_A_LEAD_TITLE =
  /\bguide\b|how to\b|how is .{0,60}(?:evaluated|assessed)|explained|what is\b|hvad er\b|hvordan\b|sådan (?:får|søger|ansøger)|komplet guide|\btips\b|\bsubsid(?:y|ies)\b|subsidier|tilskud til\b|-tilskud\b|tilskud:|funded up to|up to \d+ ?%|op til \d+ ?%|amounts and how|how to apply|ansøgningsfrist|\bspotlight\b|webinar|make your .{0,40} work harder|\bblog\b/;

// Infrastructure and staffing stay penalised even when development is mentioned.
const UNSOFTENED = new Set(["infrastructure-outsourcing", "consultant-staffing"]);

const BUILD_SCOPE =
  /udvikling af|videreudvikling|nyudvikling|softwareudvikling|udvikle (?:en|et)|development of|develop(?:ing)? (?:a|an|the)\b|custom (?:software|development)|skræddersy|\bapps?\b|applikation|mobilapp|webapp|hjemmeside|website|webshop|web platform|portal|integration|\bapi\b|automatiser|automation|kunstig intelligens|\bai\b|machine learning|chatbot|prototype|\bmvp\b|proof of concept|dashboard|redesign/;

export interface SupplierFit {
  version: number;
  delta: number;
  cap: number;
  signals: string[];
  reasons: string[];
  buildScope: boolean;
  overCapacity: boolean;
}

function scopeText(candidate: CandidateLike) {
  return [candidate.title, candidate.description, candidate.category].filter(Boolean).join(" ").toLowerCase();
}

function contractValueDkk(candidate: CandidateLike & { currency?: string | null }) {
  const value = candidate.budgetMax ?? candidate.budgetMin;
  if (value == null) return null;
  const rate: Record<string, number> = { DKK: 1, EUR: 7.46, USD: 6.9, GBP: 8.7, SEK: 0.65, NOK: 0.63 };
  return value * (rate[(candidate.currency ?? "DKK").toUpperCase()] ?? 1);
}

export function supplierFit(
  candidate: CandidateLike & { currency?: string | null },
  capacityDkk = DEFAULT_CAPACITY_DKK,
): SupplierFit {
  const text = scopeText(candidate);
  const hits = PENALTIES.filter((rule) => rule.pattern.test(text));
  const notALead = NOT_A_LEAD_TITLE.test((candidate.title ?? "").toLowerCase());
  const buildScope = BUILD_SCOPE.test(text);
  const value = contractValueDkk(candidate);
  const overCapacity = value != null && value > capacityDkk;

  let delta = hits.reduce((sum, rule) => sum + rule.delta, 0);
  let cap = Math.min(100, ...hits.map((rule) => rule.cap ?? 100));
  const reasons = hits.map((rule) => rule.reason);
  const signals = hits.map((rule) => `supplier:${rule.id}`);

  if (overCapacity) {
    const far = value! > capacityDkk * 3;
    delta -= far ? 25 : 12;
    cap = Math.min(cap, far ? 40 : 60);
    reasons.push(`Contract value ≈ ${Math.round(value! / 1e6)}M DKK exceeds studio capacity`);
    signals.push("supplier:over-capacity");
  }

  // Development scope softens a standard-product or framework penalty (a
  // "platform" tender that is really a build), but never infrastructure.
  if (buildScope && !notALead) {
    const hard = hits.some((rule) => UNSOFTENED.has(rule.id));
    if (!hits.length) delta += 6;
    else if (!hard) {
      delta = Math.round(delta / 2);
      cap = Math.min(100, cap + 15);
    }
    signals.push("supplier:build-scope");
    if (!hits.length) reasons.push("Custom build scope a studio can deliver");
  }

  if (notALead) {
    delta -= 35;
    cap = Math.min(cap, 25);
    reasons.unshift("Article, guide or grant-scheme page rather than a buyer with a need");
    signals.push("supplier:not-a-lead");
  }

  return {
    version: SUPPLIER_FIT_VERSION,
    delta: Math.max(-50, Math.min(6, delta)),
    cap,
    signals,
    reasons,
    buildScope,
    overCapacity,
  };
}

/** Applies supplier fit to lane-adjusted scores. */
export function applySupplierFit(
  scores: { matchScore: number; pursuitScore: number },
  fit: SupplierFit,
): { matchScore: number; pursuitScore: number } {
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const matchScore = clamp(scores.matchScore + fit.delta);
  // Pursuit weighs match at 0.52 (see crm/scoring.ts), then the cap bounds it.
  const pursuitScore = clamp(Math.min(fit.cap, scores.pursuitScore + fit.delta * 0.52));
  return { matchScore, pursuitScore };
}
