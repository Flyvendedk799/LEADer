import { describe, expect, it } from "vitest";

import { pluralize } from "./utils";

describe("pluralize", () => {
  it("uses the singular only for exactly one", () => {
    expect(pluralize(1, "deal")).toBe("1 deal");
    expect(pluralize(0, "deal")).toBe("0 deals");
    expect(pluralize(2, "deal")).toBe("2 deals");
  });

  it("supports irregular plurals", () => {
    expect(pluralize(1, "person", "people")).toBe("1 person");
    expect(pluralize(3, "person", "people")).toBe("3 people");
  });
});
