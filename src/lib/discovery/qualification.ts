export type QualificationInput = {
  title?: string | null; description?: string | null; rawContent?: string | null;
  organization?: string | null; url?: string | null; deadline?: Date | string | null;
  budgetMin?: number | null; budgetMax?: number | null;
};
/** Conservative labels describe evidence, not a promise that a company is buying. */
export function qualifyCandidate(candidate: QualificationInput) {
  const text = [candidate.title, candidate.description, candidate.rawContent].filter(Boolean).join("\n");
  const contract = /freelanc|subcontract|contractor|konsulentopgave|ekstern konsulent|contract (?:role|position|developer)|employment type:\s*contract/i.test(text);
  const employment = !contract && /permanent (?:role|position)|full.time (?:job|employee)|fastansættelse|fastansat|lønmodtager|internship|praktikplads|permanent employment|employment type:\s*(?:full[ _-]time|part[ _-]time)|salaried|ansættelse på fuld tid/i.test(text);
  const unpaid = /unpaid|equity.only|ulønnet/i.test(text);
  const advertised = contract || /(?:søger|seeking|looking for|need(?:s)?)\s+(?:en |et |a |an )?(?:software|web|app|udvikl|developer|leverandør|supplier|agency|bureau|technical|development)|request for (?:proposal|quotation)|tilbudsfrist|indsend tilbud/i.test(text);
  const recurring = /retainer|recurring|løbende (?:aftale|samarbejde)|maintenance contract/i.test(text);
  const agency = /agency|bureau|subcontract/i.test(text) && /partner|freelanc|underleverandør|subcontract/i.test(text);
  const expired = candidate.deadline ? new Date(candidate.deadline).getTime() < Date.now() : false;
  const missing = [!candidate.organization && "Buyer identity", !candidate.url && "Original source", candidate.budgetMin == null && candidate.budgetMax == null && "Budget or rate", !candidate.deadline && "Timing"].filter(Boolean) as string[];
  return {
    kind: employment ? "Employment" : unpaid ? "Unpaid" : advertised ? "Advertised work" : "Prospecting signal",
    engagement: agency ? "Agency subcontracting" : contract ? "Freelance contract" : recurring ? "Recurring work" : "Project / unknown terms",
    valueBasis: /(?:per hour|\/hour|\/hr|timepris|pr\. time|rate period:\s*hour)/i.test(text) ? "Hourly rate" : /(?:per day|\/day|dagspris|rate period:\s*day)/i.test(text) ? "Daily rate" : recurring ? "Recurring / verify period" : "Project / verify basis",
    expired, missing,
    nextAction: expired ? "Verify whether this opportunity has reopened." : employment || unpaid ? "Check whether a paid company engagement is possible before pursuing." : advertised ? "Verify scope, buyer and submission route before preparing a proposal." : "Research the need and buyer; this is not a confirmed available assignment.",
  };
}
