import { describe, expect, it } from "vitest";

import { normalizeWorkspace, workspaceFromRoute, workspaceLabel } from "./workspace-context";

describe("workspace context", () => {
  it("prefers explicit workspace query params", () => {
    expect(workspaceFromRoute("/board", new URLSearchParams("workspace=GLOBAL"))).toBe("GLOBAL");
    expect(workspaceFromRoute("/global", new URLSearchParams("workspace=DK"))).toBe("DK");
    expect(workspaceFromRoute("/workflows", "?workspace=GLOBAL")).toBe("GLOBAL");
  });

  it("infers international workspace from global routes", () => {
    expect(workspaceFromRoute("/global")).toBe("GLOBAL");
    expect(workspaceFromRoute("/global/opportunities")).toBe("GLOBAL");
  });

  it("falls back to Denmark for invalid or missing workspace context", () => {
    expect(workspaceFromRoute("/workflows")).toBe("DK");
    expect(workspaceFromRoute("/board", { workspace: "NOPE" })).toBe("DK");
    expect(normalizeWorkspace("GLOBAL")).toBe("GLOBAL");
    expect(normalizeWorkspace("global")).toBeNull();
    expect(workspaceLabel("GLOBAL")).toBe("International");
  });
});
