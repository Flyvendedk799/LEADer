import { describe, expect, it } from "vitest";
import { __discoveryTesting } from "./index";

const candidate = (provider: string, n: number, matchScore: number) =>
  ({ provider, title: `${provider} ${n}`, url: `https://${provider}.example/${n}`, matchScore }) as never;

describe("dedupeCandidates", () => {
  it("takes turns between sources so a high-scoring one cannot crowd out the rest", () => {
    const picked = __discoveryTesting.dedupeCandidates(
      [
        ...[100, 99, 98, 97, 96].map((score, i) => candidate("official", i, score)),
        ...[60, 50].map((score, i) => candidate("google", i, score)),
        candidate("tavily", 0, 40),
      ],
      4,
    ) as { provider: string }[];
    expect(picked).toHaveLength(4);
    expect(new Set(picked.map((c) => c.provider))).toEqual(new Set(["official", "google", "tavily"]));
  });

  it("still fills up from one source when it is the only one", () => {
    const picked = __discoveryTesting.dedupeCandidates(
      [100, 90, 80].map((score, i) => candidate("official", i, score)),
      5,
    );
    expect(picked).toHaveLength(3);
  });

  it("drops duplicates by title and url", () => {
    const picked = __discoveryTesting.dedupeCandidates(
      [candidate("a", 1, 90), candidate("a", 1, 80), candidate("b", 2, 70)],
      10,
    );
    expect(picked).toHaveLength(2);
  });
});
