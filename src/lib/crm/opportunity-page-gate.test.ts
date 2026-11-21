import { describe, expect, it } from "vitest";
import { concreteOpportunityPageGate, laneCandidateGate, TENDER_NOTICE_IN_WEB_LANE } from "./lanes";

const parts = (url: string) => {
  const u = new URL(url);
  return { host: u.hostname.replace(/^www\./, ""), path: u.pathname.toLowerCase(), url: u.toString().toLowerCase() };
};
const allowed = (title: string, url: string) => concreteOpportunityPageGate({ title, url }, parts(url)).allowed;

describe("concrete opportunity page gate", () => {
  it("rejects front pages and short top-level pages", () => {
    expect(allowed("Worksome | The External Workforce Platform", "https://www.worksome.com/")).toBe(false);
    expect(allowed("SMV:Digital-eligible AI automation", "https://www.badrobotinc.com/dk")).toBe(false);
    expect(allowed("Workflow automation", "https://www.implement-ai.dk/en/automation/")).toBe(false);
    expect(allowed("IT freelance opgaver", "https://needconsult.dk/it-freelance-opgaver/")).toBe(false);
    expect(allowed("Om AI Denmark", "https://aidenmark.dk/om-ai-denmark/")).toBe(false);
  });

  it("rejects listings, search, category and career pages", () => {
    expect(allowed("needconsult.dk — Søger freelancekonsulenter", "https://needconsult.dk/it-freelance-opgaver/page/3/")).toBe(false);
    expect(allowed("Remote and Online AI Jobs in Denmark", "https://www.opentrain.ai/jobs/country/denmark/")).toBe(false);
    expect(allowed("Danske AI Eksperter", "https://www.giig.dk/kategorier/kunstig-intelligens")).toBe(false);
    expect(allowed("Mjølner freelance", "https://mjolner.dk/en/career/freelance/")).toBe(false);
    expect(allowed("The Hub | Worksome", "https://thehub.io/startups/worksome")).toBe(false);
    expect(allowed("upwork.com — The business is contracting", "https://www.upwork.com/freelance-jobs/dashboard/")).toBe(false);
    expect(allowed("Recruitment of freelance IT-consultants | Hays", "https://www.hays.dk/en/recruitment-services/specialisms/it-consultants")).toBe(false);
  });

  it("rejects articles, guides and grant-scheme pages", () => {
    expect(allowed("SMV:Digital-tilskud til AI: Komplet guide 2026", "https://www.noworkr.com/blog/smv-digital-tilskud-ai")).toBe(false);
    expect(allowed("SMV:Digital 2026: Tilskud til digitalisering og AI", "https://www.ey.com/da_dk/insights/tax/tilskud-til-digitalisering-og-ai")).toBe(false);
    expect(allowed("How is an Innobooster application evaluated?", "https://nordicinnovators.com/funding-programmes/danish/innobooster/assessment-of-innobooster-application/")).toBe(false);
    expect(allowed("Nyhedsarkiv", "https://kombit.dk/aktuelt/nyheder/2026")).toBe(false);
  });

  it("rejects grant programmes, Q&A pages and job ads", () => {
    expect(concreteOpportunityPageGate({ title: "SMV:Digital", description: "A recurring government grant programme for SMEs" }, parts("https://digst.dk/digital-transformation/smvdigital/")).allowed).toBe(false);
    expect(allowed("EU Funding & Tenders Portal", "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/support/proc-qa/ea88c2b3-2595-4d56-b8c3-45c3b8cc4031-CN/104232")).toBe(false);
    expect(allowed("Konsulent til styring", "https://www.jobindex.dk/jobannonce/r14104017/konsulent-til-styring-og-fremdrift")).toBe(false);
  });

  it("sends tender notices found by web lanes to the Tenders lane", () => {
    const lane = { slug: "buying-signals", name: "Buying", positiveKeywords: [], negativeKeywords: [], evidenceRequirements: [], queryTemplates: [] };
    expect(laneCandidateGate(lane as never, { title: "Drift af cloud", url: "https://udbud.dk/detaljevisning?noticeId=e68fdcd6-73a8" })).toEqual({ allowed: false, reason: TENDER_NOTICE_IN_WEB_LANE });
  });

  it("keeps specific opportunity pages", () => {
    expect(allowed("A senior Power BI developer", "https://www.upwork.com/freelance-jobs/apply/Power-Reporting-Solution-Specialist_~022123036537529033158/")).toBe(true);
    expect(allowed("Salesforce Service Cloud Consultant", "https://needconsult.dk/it-freelance-opgaver/salesforce-service-cloud-konsulent-remote-e5881320/")).toBe(true);
    expect(allowed("Kubernetes Platform Engineer", "https://dba-consult.dk/job/kubernetes-platform-engineer-med-fokus-paa-videreudvikling-og-optimering/?lang=en")).toBe(true);
    expect(allowed("Urgent request for Eureka partner", "https://eendoguakdeniz.org.tr/nl/cooperation/opportunities/urgent-request-for-eureka-innowwide-call-5-project-partner-in-united-a-rdrgr20261117011")).toBe(true);
    expect(allowed("Company seeks app developer", "https://example.dk/projekter/ny-kundeportal-til-vvs-firma-2026")).toBe(true);
  });

  it("keeps leads without a URL and is applied only to web lanes", () => {
    expect(concreteOpportunityPageGate({ title: "Pasted lead" }, { host: "", path: "", url: "" }).allowed).toBe(true);
    const lane = { slug: "sme-ai-automation", name: "SME", positiveKeywords: [], negativeKeywords: [], evidenceRequirements: [], queryTemplates: [] };
    expect(laneCandidateGate(lane as never, { title: "Worksome", url: "https://www.worksome.com/" }).allowed).toBe(false);
  });
});
