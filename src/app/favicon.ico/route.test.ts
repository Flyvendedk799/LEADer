import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("favicon route", () => {
  it("serves the favicon path used by page metadata", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("max-age=86400");
    await expect(response.text()).resolves.toContain("<svg");
  });
});
