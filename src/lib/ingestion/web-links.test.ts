import { describe, expect, it } from "vitest";

import { collectSameHostLinks } from "./web";

describe("collectSameHostLinks", () => {
  it("caps same-host follow-up pages and drops other hosts", () => {
    expect(
      collectSameHostLinks(
        ["/a", "/b", "https://other.test/c", "/d"],
        "https://example.test/start",
        new Set(["https://example.test/start"]),
        1,
      ),
    ).toEqual(["https://example.test/a"]);
  });
});
