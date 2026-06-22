import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AiProviderFields, aiProviderPayload, type AiProviderState } from "./ai-provider-fields";

const codexState: AiProviderState = {
  provider: "codex",
  baseUrl: "https://chatgpt.com/backend-api",
  model: "gpt-5.5",
  embeddingModel: "text-embedding-3-small",
  apiKey: "should-not-be-sent",
  clearApiKey: false,
};

describe("AI provider settings fields", () => {
  it("renders local subscription providers as first-class options", () => {
    const html = renderToStaticMarkup(
      React.createElement(AiProviderFields, { state: codexState, onChange: () => {} }),
    );

    expect(html).toContain("Codex subscription");
    expect(html).toContain("Claude Code subscription");
    expect(html).toContain("Local subscription");
    expect(html).toContain("Codex CLI login");
  });

  it("does not send API keys for local subscription providers", () => {
    expect(aiProviderPayload(codexState)).toMatchObject({
      provider: "codex",
      apiKey: undefined,
      clearApiKey: false,
    });
  });
});
