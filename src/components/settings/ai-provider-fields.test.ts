import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AiProviderFields,
  SearchProviderFields,
  aiProviderModeSummary,
  aiProviderPayload,
  type AiProviderState,
  type SearchProviderState,
} from "./ai-provider-fields";

const codexState: AiProviderState = {
  provider: "codex",
  baseUrl: "https://chatgpt.com/backend-api",
  model: "gpt-5.5",
  embeddingModel: "text-embedding-3-small",
  apiKey: "should-not-be-sent",
  clearApiKey: false,
};

const searchState: SearchProviderState = {
  provider: "tavily",
  apiKey: "",
  clearApiKey: false,
};

describe("AI provider settings fields", () => {
  it("renders local subscription providers as first-class options", () => {
    const html = renderToStaticMarkup(
      React.createElement(AiProviderFields, { state: codexState, onChange: () => {} }),
    );

    expect(html).toContain("Current AI mode");
    expect(html).toContain("Local subscriptions");
    expect(html).toContain("Codex / ChatGPT subscription");
    expect(html).toContain("Claude Code subscription");
    expect(html).toContain("No API key sent");
    expect(html).toContain("Codex CLI / ChatGPT login");
  });

  it("does not send API keys for local subscription providers", () => {
    expect(aiProviderPayload(codexState)).toMatchObject({
      provider: "codex",
      apiKey: undefined,
      clearApiKey: false,
    });
  });

  it("summarizes subscription mode without implying an API key is stored", () => {
    expect(aiProviderModeSummary(codexState)).toMatchObject({
      kind: "subscription",
      badge: "Local subscription",
      title: "Codex / ChatGPT subscription selected",
    });
    expect(aiProviderModeSummary(codexState).description).toContain(
      "No API key is sent or stored by LEADer",
    );
  });

  it("explains that AI subscriptions do not provide broad web search", () => {
    const html = renderToStaticMarkup(
      React.createElement(SearchProviderFields, { state: searchState, onChange: () => {} }),
    );

    expect(html).toContain("Codex/Claude subscriptions do not include web search");
    expect(html).toContain("Official udbud.dk tender mode");
  });
});
