import type { ScoreCriterion, ScoreWeights } from "@/lib/types";

// Default scoring weights — tuned to the owner's profile:
// small (<100k DKK), active, directly-applicable AI/fullstack/MVP/startup work.
// Users can override these in Settings (persisted on User.scoringWeights).
export const DEFAULT_WEIGHTS: ScoreWeights = {
  budgetFit: 0.12,
  activeDeadline: 0.1,
  fullstackRelevance: 0.13,
  aiProductRelevance: 0.13,
  startupFit: 0.1,
  directApplicability: 0.1,
  voucherResemblance: 0.1,
  timeSensitivity: 0.06,
  ambition: 0.04,
  contactability: 0.05,
  profileMatch: 0.07,
};

export const CRITERION_LABELS: Record<ScoreCriterion, string> = {
  budgetFit: "Budget fit (< preferred max)",
  activeDeadline: "Active deadline",
  fullstackRelevance: "Fullstack relevance",
  aiProductRelevance: "AI / product / MVP relevance",
  startupFit: "Startup / founder / funded fit",
  directApplicability: "Directly applicable",
  voucherResemblance: "Voucher-style (Erhvervshus / Beyond Beta)",
  timeSensitivity: "Time sensitivity",
  ambition: "Ambition / complexity",
  contactability: "Contactability",
  profileMatch: "Profile match",
};

// Keyword lexicons used by the heuristic signals. Danish + English so Danish
// sources and international ones both score. Extend freely.
export const LEXICON = {
  fullstack: [
    "fullstack", "full-stack", "udvikler", "developer", "web", "app",
    "frontend", "backend", "react", "next", "node", "typescript", "api",
    "database", "platform", "software", "kodning", "programmering",
    "softwareudvikling", "teknisk", "algoritme", "integration", "saas",
  ],
  aiProduct: [
    "ai", "kunstig intelligens", "machine learning", "ml", "llm", "gpt",
    "automation", "automatisering", "mvp", "prototype", "prototyping",
    "produktstrategi", "product strategy", "roadmap", "poc", "proof of concept",
    "digitalisering", "digital", "data", "produkt", "teknisk sparring",
    "rådgivning", "raadgivning", "advisory", "readiness",
  ],
  startup: [
    "startup", "iværksætter", "founder", "stifter", "sme", "smv", "scaleup",
    "accelerator", "inkubator", "incubator", "spinout", "venture", "early-stage",
  ],
  voucher: [
    "voucher", "innovationsagent", "erhvervshus", "beyond beta", "ehsys",
    "tilskud", "fond", "funded", "bevilling", "grant", "innobooster",
    "markedsmodning", "proof of business", "vækstprogram", "pulje",
  ],
  direct: [
    "kontakt", "contact", "ansøg", "apply", "tilbud", "offer", "supplier",
    "leverandør", "leverandørrettet", "konsulent", "consultant", "freelance", "udbud",
    "indkøb", "indkoeb", "tilbudsfrist",
  ],
};
