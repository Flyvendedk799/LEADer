import { describe, expect, it } from "vitest";
import { generateApiToken, hashApiToken } from "./api-tokens";
import { bearerApiToken } from "./constants";

describe("API tokens", () => {
  it("generates high-entropy tokens whose hash and prefix identify them", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.startsWith("ldr_")).toBe(true);
    expect(a.token.length).toBeGreaterThanOrEqual(46);
    expect(a.tokenHash).toBe(hashApiToken(a.token));
    expect(a.tokenHash).not.toContain(a.token);
    expect(a.token.startsWith(a.prefix)).toBe(true);
    expect(bearerApiToken(`Bearer ${a.token}`)).toBe(a.token);
  });
});
