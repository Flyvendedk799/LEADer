import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), allowed: vi.fn() }));
vi.mock("@/lib/ingestion/net", () => ({
  assertPublicUrl: vi.fn(),
  safeFetch: mocks.fetch,
}));
vi.mock("@/lib/ingestion/compliance", () => ({
  crawlerSettings: () => ({ timeoutMs: 1000, userAgent: "test" }),
  isAllowedByRobots: mocks.allowed,
  rateLimit: vi.fn(),
}));
import { __discoveryTesting } from ".";

describe("discovery source evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allowed.mockResolvedValue(true);
  });

  it("reads primary content and excludes navigation from extracted facts", async () => {
    mocks.fetch.mockResolvedValue({
      status: 200,
      url: "https://example.com/project",
      text: `<html><title>Software project</title><body><nav>Unrelated budget 999999 DKK</nav><main><h1>Software project</h1><p>We need a developer to build an internal reporting application for our operations team. Please contact the project owner to discuss the specification and delivery schedule.</p></main><footer>Old deadline 2020</footer></body></html>`,
    });
    const result = await __discoveryTesting.fetchReadablePage(
      "https://example.com/project",
    );
    expect(result.provenance?.status).toBe("read");
    expect(result.text).toContain("internal reporting");
    expect(result.text).not.toContain("999999");
    expect(result.text).not.toContain("2020");
  });

  it("distinguishes robots restrictions, fetch errors and unread documents", async () => {
    mocks.allowed.mockResolvedValueOnce(false);
    expect(
      (
        await __discoveryTesting.fetchReadablePage(
          "https://example.com/private",
        )
      ).provenance?.status,
    ).toBe("blocked");
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValueOnce({ status: 503 });
    const failed = await __discoveryTesting.fetchReadablePage(
      "https://example.com/project",
    );
    expect(failed.provenance?.status).toBe("failed");
    expect(failed.provenance?.reason).toContain("503");
    mocks.fetch.mockResolvedValueOnce({
      status: 200,
      url: "https://example.com/brief.pdf",
    });
    expect(
      (
        await __discoveryTesting.fetchReadablePage(
          "https://example.com/brief.pdf",
        )
      ).provenance?.status,
    ).toBe("attachment");
  });

  it("does not treat a challenge page as successfully read evidence", async () => {
    mocks.fetch.mockResolvedValue({
      status: 200,
      text: "<html><title>Just a moment</title><body>Verify you are human</body></html>",
    });
    const result = await __discoveryTesting.fetchReadablePage(
      "https://example.com/challenge",
    );
    expect(result.provenance?.status).toBe("failed");
    expect(result.text).toBeUndefined();
  });
  it("retains successful probes and reports partial provider failure", async () => {
    const onError = vi.fn();
    const results = await __discoveryTesting.runSearchQueriesWithConcurrency(
      ["good", "bad"],
      3,
      2,
      async (query) => {
        if (query === "bad") throw new Error("rate limited");
        return [query];
      },
      onError,
    );
    expect(results).toEqual(["good"]);
    expect(onError).toHaveBeenCalledWith("bad", expect.any(Error));
  });
});
