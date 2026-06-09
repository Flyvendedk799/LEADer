import { describe, expect, it } from "vitest";
import { assertPublicUrl, isPrivateIp, SsrfError } from "./net";

describe("SSRF guard — isPrivateIp", () => {
  it("flags loopback, private, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });
  it("flags IPv6 loopback / ULA / link-local and mapped private v4", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });
  it("allows public addresses", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
  });
});

describe("SSRF guard — assertPublicUrl", () => {
  it("rejects non-http schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toBeInstanceOf(SsrfError);
    await expect(assertPublicUrl("ftp://example.com")).rejects.toThrow();
  });
  it("rejects localhost and private IP literals", async () => {
    await expect(assertPublicUrl("http://localhost:5432")).rejects.toThrow();
    await expect(assertPublicUrl("http://127.0.0.1/admin")).rejects.toThrow();
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow();
  });
});
