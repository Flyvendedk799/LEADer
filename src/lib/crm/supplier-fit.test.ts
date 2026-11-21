import { describe, expect, it } from "vitest";
import { applySupplierFit, supplierFit } from "./supplier-fit";

const fit = (title: string, extra: Record<string, unknown> = {}) => supplierFit({ title, ...extra });
const rank = (title: string, pursuit = 100, extra: Record<string, unknown> = {}) =>
  applySupplierFit({ matchScore: 95, pursuitScore: pursuit }, fit(title, extra)).pursuitScore;

describe("supplier fit", () => {
  it("keeps IT outsourcing far below the top of the queue", () => {
    expect(rank("Tender for Agreement on outsourcing of IT infrastructure and Services")).toBeLessThanOrEqual(35);
    expect(rank("Udbud af ATP's it-kapacitet")).toBeLessThanOrEqual(35);
    expect(rank("SaaS baseret telefoniplatform")).toBeLessThanOrEqual(35);
  });

  it("caps standard-system purchases", () => {
    expect(rank("Udbud af ESDH-system som en Service")).toBeLessThanOrEqual(50);
    expect(rank("Udbud af afregningssystem for Samn Forsyning ApS")).toBeLessThanOrEqual(50);
    expect(rank("Digital Asset Management")).toBeLessThanOrEqual(50);
    expect(rank("Quality Management System (QMS) for the Regional Pharmacy")).toBeLessThanOrEqual(50);
  });

  it("caps consultant staffing and frameworks", () => {
    expect(rank("Udbud med forhandling af IT-konsulentydelser til Folkekirkens IT")).toBeLessThanOrEqual(55);
    expect(rank("Rammeaftale for support af sagssystem")).toBeLessThanOrEqual(60);
  });

  it("leaves custom build work at the top", () => {
    expect(rank("Udvikling af mobilapp til borgerservice")).toBe(100);
    expect(rank("Udbud af udvikling af Den Veterinære Receptløsning")).toBe(100);
    expect(fit("Website and integration for a Danish SME").reasons).toContain("Custom build scope a studio can deliver");
  });

  it("lets build scope soften a product penalty but not infrastructure", () => {
    expect(rank("Videreudvikling af portal og CMS-platform")).toBeGreaterThan(rank("CMS-platform"));
    expect(rank("Udvikling og drift af IT-infrastruktur outsourcing")).toBeLessThanOrEqual(50);
  });

  it("penalises contracts beyond studio capacity", () => {
    expect(rank("Udvikling af app", 100, { budgetMax: 50_000_000 })).toBeLessThanOrEqual(40);
    expect(rank("Udvikling af app", 100, { budgetMax: 2_000_000 })).toBe(100);
    expect(fit("Build", { budgetMax: 1_000_000, currency: "EUR" }).overCapacity).toBe(true);
  });

  it("only reads the scope, not notice boilerplate", () => {
    expect(supplierFit({ title: "Udvikling af app", rawContent: "drift licens rammeaftale outsourcing" }).delta).toBe(6);
  });
});

describe("supplier fit: non-leads and operations", () => {
  it("sinks guides, grant-scheme pages and articles", () => {
    for (const title of [
      "SMV:Digital-tilskud til AI: Komplet guide 2026 | NoWorkr",
      "Brussels digitalisation grant: amounts and how to apply",
      "Subsidies voor digitalisering in Vlaanderen (2026)",
      "Your AI project funded up to 70%.",
      "How is an Innobooster application evaluated?",
      "EDIH Spotlight: AI Boost, Denmark",
    ]) {
      expect(rank(title)).toBeLessThanOrEqual(25);
    }
  });

  it("does not let development wording soften consultant staffing", () => {
    expect(rank("Udbud med forhandling af IT-konsulentydelser til udvikling af app")).toBeLessThanOrEqual(55);
  });

  it("caps operations contracts", () => {
    expect(rank("Serviceaftale til datafordeler.dk")).toBeLessThanOrEqual(65);
  });
});
