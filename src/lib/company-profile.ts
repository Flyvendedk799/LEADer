import { z } from "zod";

export const companyProfileSchema = z.object({
  name: z.string().trim().max(200).default("Mast3kmedia"),
  services: z.string().max(4000).default("Software development, websites, apps, integrations, AI automation, MVPs"),
  customers: z.string().max(2000).default("Danish companies and international remote clients"),
  capacity: z.string().max(2000).default(""),
  portfolio: z.string().max(8000).default(""),
  commercialPreferences: z.string().max(2000).default("Projects, freelance contracts, agency subcontracting and recurring work"),
  draftLanguage: z.enum(["Danish", "English"]).default("Danish"),
  dailyBudgetUsd: z.number().min(0).max(100000).default(0),
  monthlyBudgetUsd: z.number().min(0).max(100000).default(0),
  searchQueryReserveUsd: z.number().min(0.001).max(100).default(0.02),
  aiCallReserveUsd: z.number().min(0.001).max(1000).default(1),
  starterSourcesInstalled: z.boolean().default(false),
  scheduledDiscovery: z.boolean().default(true),
  discoveryHour: z.number().int().min(0).max(23).default(7),
  internationalDiscovery: z.boolean().default(true),
  dailySearchQueries: z.number().int().min(0).max(10000).default(0),
  dailyAiCalls: z.number().int().min(0).max(10000).default(0),
  monthlySearchQueries: z.number().int().min(0).max(100000).default(0),
  monthlyAiCalls: z.number().int().min(0).max(100000).default(0),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;
export function companyProfile(value: unknown): CompanyProfile {
  const parsed = companyProfileSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : companyProfileSchema.parse({});
}
export function companyContext(value: unknown) {
  const p = companyProfile(value);
  return `Company: ${p.name}\nServices: ${p.services}\nCustomers: ${p.customers}\nCapacity: ${p.capacity || "Not specified; do not assume solo delivery"}\nCommercial preferences: ${p.commercialPreferences}\nVerified portfolio supplied by owner: ${p.portfolio || "None supplied; do not invent references"}\nWrite drafts in ${p.draftLanguage}.`;
}
