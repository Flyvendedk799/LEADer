import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));

vi.mock("./net", () => ({
  assertPublicUrl: vi.fn(async () => undefined),
  safeFetch: mocks.safeFetch,
}));
vi.mock("./compliance", () => ({
  crawlerSettings: () => ({
    userAgent: "test",
    timeoutMs: 1000,
    maxPagesPerRun: 5,
    playwrightEnabled: false,
  }),
  isAllowedByRobots: vi.fn(async () => true),
  rateLimit: vi.fn(async () => undefined),
}));

import { fetchWebCandidates } from "./web";

const listing = `<html><head><title>Indkøb</title></head><body>
  <a href="/">Home</a><a href="/indkoeb/alle/arkiv">Arkiv</a>
  <article><h2>Teknisk sparring om produktroadmap</h2>
  <a href="/indkoeb/tilbud/1">Se</a>
  <p>En virksomhed søger teknisk sparring og en leverandør til produktudvikling, MVP og software.</p></article>
</body></html>`;

describe("fetchWebCandidates", () => {
  const calls: string[] = [];
  beforeEach(() => {
    mocks.safeFetch.mockReset();
    calls.length = 0;
  });

  it("keeps what the first page gave when a followed link is dead", async () => {
    mocks.safeFetch.mockImplementation(async (url: string) => {
      calls.push(String(url));
      return String(url).endsWith("/indkoeb/alle")
        ? { status: 200, text: listing, url }
        : { status: 404, text: "", url };
    });
    const found = await fetchWebCandidates("https://example.dk/indkoeb/alle", { maxPages: 3 });
    expect(calls.length).toBeGreaterThan(1); // it did follow a link, and that link was dead
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.title).toContain("Teknisk sparring");
  });

  it("still fails the source when the page the user pointed at is dead", async () => {
    mocks.safeFetch.mockResolvedValue({ status: 404, text: "", url: "https://example.dk/x" });
    await expect(fetchWebCandidates("https://example.dk/x", { maxPages: 3 })).rejects.toThrow(
      /Fetch failed \(404\)/,
    );
  });
});
