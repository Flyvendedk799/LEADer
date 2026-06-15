import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("produces a verifiable scrypt hash", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("s3cret-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("salts: same password hashes differently each time", async () => {
    const a = await hashPassword("same-password-x");
    const b = await hashPassword("same-password-x");
    expect(a).not.toEqual(b);
    expect(await verifyPassword("same-password-x", a)).toBe(true);
    expect(await verifyPassword("same-password-x", b)).toBe(true);
  });

  it("enforces a minimum length", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/at least 8/);
  });

  it("safely handles malformed / empty stored hashes", async () => {
    expect(await verifyPassword("whatever", null)).toBe(false);
    expect(await verifyPassword("whatever", "")).toBe(false);
    expect(await verifyPassword("whatever", "not-a-real-hash")).toBe(false);
    expect(await verifyPassword("whatever", "scrypt$bad$format")).toBe(false);
  });
});
