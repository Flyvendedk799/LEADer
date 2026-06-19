import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { extractJsonLd, extractMicrodata, extractStructured } from "./structured";
import { extractCards, getParser } from "./index";

describe("JSON-LD structured extraction", () => {
  it("maps a JobPosting (deadline, salary, org, contact)", () => {
    const html = `<html><head>
      <script type="application/ld+json">{
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": "Fullstack udvikler til MVP",
        "description": "Byg en MVP i Next.js og Postgres.",
        "datePosted": "2026-01-10",
        "validThrough": "2026-03-15",
        "hiringOrganization": { "@type": "Organization", "name": "Nordic SaaS ApS" },
        "baseSalary": { "@type": "MonetaryAmount", "currency": "DKK",
          "value": { "@type": "QuantitativeValue", "minValue": 60000, "maxValue": 90000 } },
        "jobLocation": { "@type": "Place", "address": { "addressLocality": "København" } },
        "applicationContact": { "@type": "ContactPoint", "email": "mette@nordicsaas.dk", "name": "Mette" },
        "url": "/jobs/fullstack-mvp"
      }</script></head><body></body></html>`;
    const $ = cheerio.load(html);
    const out = extractJsonLd($, "https://example.dk/jobs");
    expect(out).toHaveLength(1);
    const c = out[0];
    expect(c.title).toBe("Fullstack udvikler til MVP");
    expect(c.organization).toBe("Nordic SaaS ApS");
    expect(c.budgetMin).toBe(60000);
    expect(c.budgetMax).toBe(90000);
    expect(c.currency).toBe("DKK");
    expect(c.location).toBe("København");
    expect(c.deadline?.getUTCFullYear()).toBe(2026);
    expect(c.contacts?.[0]?.email).toBe("mette@nordicsaas.dk");
    expect(c.url).toBe("https://example.dk/jobs/fullstack-mvp");
    expect(c.applicationRoute).toBe("APPLICATION");
  });

  it("handles @graph and multiple nodes, ignoring non-opportunity types", () => {
    const html = `<script type="application/ld+json">{
      "@context":"https://schema.org",
      "@graph":[
        {"@type":"WebPage","name":"Listing"},
        {"@type":"Event","name":"Accelerator demo day","description":"Pitch event","startDate":"2026-04-01","endDate":"2026-04-02","organizer":{"name":"Beyond Beta"},"offers":{"@type":"Offer","price":"0","priceCurrency":"DKK"},"url":"https://x.dk/e"}
      ]}</script>`;
    const $ = cheerio.load(html);
    const out = extractJsonLd($, "https://x.dk");
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Accelerator demo day");
    expect(out[0].organization).toBe("Beyond Beta");
  });

  it("skips malformed JSON-LD blocks without throwing", () => {
    const $ = cheerio.load(`<script type="application/ld+json">{ not valid json }</script>`);
    expect(extractJsonLd($, "https://x.dk")).toEqual([]);
  });
});

describe("microdata extraction", () => {
  it("reads a JobPosting itemscope", () => {
    const html = `<div itemscope itemtype="https://schema.org/JobPosting">
      <h2 itemprop="title">Voucher: digitalisering</h2>
      <p itemprop="description">Innovationsagent voucher-projekt.</p>
      <time itemprop="validThrough" datetime="2026-05-01">1. maj 2026</time>
      <a itemprop="url" href="/v/123">link</a>
    </div>`;
    const $ = cheerio.load(html);
    const out = extractMicrodata($, "https://erhverv.dk/list");
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Voucher: digitalisering");
    expect(out[0].url).toBe("https://erhverv.dk/v/123");
    expect(out[0].deadline?.getUTCFullYear()).toBe(2026);
  });

  it("extractStructured prefers JSON-LD, falls back to microdata", () => {
    const microOnly = cheerio.load(
      `<div itemscope itemtype="https://schema.org/Event"><span itemprop="name">X</span><span itemprop="description">desc here</span></div>`,
    );
    expect(extractStructured(microOnly, "https://x.dk")[0].title).toBe("X");
  });
});

describe("config-driven card extractor", () => {
  it("extracts repeated cards with dedupe and min-length filtering", () => {
    const html = `<main>
      <article><h3><a href="/o/1">MVP til startup</a></h3><p class="excerpt">En lille fullstack opgave med klar deadline og budget.</p></article>
      <article><h3><a href="/o/2">AI prototype</a></h3><p class="excerpt">Proof of concept med en LLM til dokumenter.</p></article>
      <article><h3><a href="/o/1">MVP til startup</a></h3><p class="excerpt">En lille fullstack opgave med klar deadline og budget.</p></article>
      <article><h3><a href="/nav">Menu</a></h3><p class="excerpt">x</p></article>
    </main>`;
    const $ = cheerio.load(html);
    const out = extractCards($, "https://site.dk", {
      item: "article",
      title: "h3 a",
      link: "h3 a",
      description: ".excerpt",
      minDescription: 20,
    });
    expect(out).toHaveLength(2); // dedup removes the repeat; "Menu" filtered by minDescription
    expect(out[0].url).toBe("https://site.dk/o/1");
    expect(out.map((c) => c.title)).toContain("AI prototype");
  });
});

describe("parser registry", () => {
  it("resolves known parser keys and returns null otherwise", () => {
    expect(getParser("ehsys")).toBeTypeOf("function");
    expect(getParser("beyond-beta")).toBeTypeOf("function");
    expect(getParser("procurement")).toBeTypeOf("function");
    expect(getParser("nonexistent")).toBeNull();
    expect(getParser(null)).toBeNull();
  });

  it("a registered parser pulls candidates from JSON-LD on the page", () => {
    const html = `<html><body>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"GovernmentService","name":"Tilskud til digitalisering","description":"Voucher-program for SMV","provider":{"name":"Erhvervshus"},"url":"/t/1"}</script>
    </body></html>`;
    const $ = cheerio.load(html);
    const parser = getParser("erhvervshuse")!;
    const out = parser($, "https://erhvervshus.dk/tilskud");
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].title).toBe("Tilskud til digitalisering");
    expect(out[0].organization).toBe("Erhvervshus");
  });

  it("extracts EHSYS procurement rows from the current-indkoeb table", () => {
    const html = `<div class="table list">
      <a href="https://beyondbeta.ehsys.dk/indkoeb/tilbud/indsend/b51a466c?from=https%3A%2F%2Fehsys.dk%2Findkoeb%2Falle" class="table-row">
        <div class="table-cell text-top content-fit hide-md">29-05-2026</div>
        <div class="table-cell text-top content-fit hide-md">19-06-2026 23.45</div>
        <div class="table-cell text-top hide-md">Center for Sikkerhedsindustrien i Danmark (CenSec)</div>
        <div class="table-cell text-top hide-lg">Beyond Beta</div>
        <div class="table-cell text-top">
          <div>Teknisk sparring (Algoritme &amp; produkt)</div>
        </div>
        <div class="table-cell actions">-&gt;</div>
      </a>
    </div>`;
    const $ = cheerio.load(html);
    const parser = getParser("ehsys-procurement")!;
    const out = parser($, "https://ehsys.dk/indkoeb/alle");
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Teknisk sparring (Algoritme & produkt)");
    expect(out[0].organization).toContain("CenSec");
    expect(out[0].category).toBe("MVP / prototype");
    expect(out[0].deadline?.getFullYear()).toBe(2026);
    expect(out[0].applicationRoute).toBe("APPLICATION");
    expect(out[0].url).toContain("beyondbeta.ehsys.dk/indkoeb/tilbud/indsend");
  });
});
