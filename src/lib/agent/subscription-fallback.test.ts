import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  executeAgentTool: vi.fn(),
}));

vi.mock("@/lib/agent/tools", () => ({
  AGENT_TOOL_CATALOG: [
    {
      name: "get_cockpit",
      risk: "read",
      description: "Read cockpit",
      inputHint: "{}",
    },
  ],
  executeAgentTool: mocks.executeAgentTool,
}));

import { runPlatformAgent } from "./index";

describe("platform agent subscription fallback", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  it("falls back to deterministic planning when Codex subscription auth is missing", async () => {
    process.env.CODEX_AUTH_FILE = "/tmp/leader-missing-agent-codex-auth.json";
    mocks.executeAgentTool.mockResolvedValue({
      tool: "get_cockpit",
      title: "Cockpit",
      summary: "No urgent follow-ups.",
      data: {},
      mutated: false,
    });

    const result = await runPlatformAgent({
      user: {
        id: "owner-1",
        email: "owner@example.com",
        aiKeys: { provider: "codex" },
      } as unknown as User,
      message: "What needs my attention today?",
    });

    expect(result.mocked).toBe(true);
    expect(result.model).toBe("mock-agent");
    expect(result.toolCalls[0]).toEqual({ tool: "get_cockpit", args: { workspace: "DK" } });
    expect(result.answer).toContain("No urgent follow-ups.");
  });
});
