"use client";

import * as React from "react";
import { BrainCircuit, Eye, EyeOff, MessageSquareText, Search, Terminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type AiProvider = "openai" | "anthropic" | "codex" | "claude-subscription";
export type SearchProvider = "tavily" | "brave" | "serper";

export type PublicAiKeys = {
  provider?: AiProvider;
  baseUrl?: string;
  model?: string;
  embeddingModel?: string;
  hasApiKey?: boolean;
  keyPreview?: string;
  updatedAt?: string;
  searchProvider?: SearchProvider;
  searchKeys?: Record<SearchProvider, { hasApiKey: boolean; keyPreview?: string; updatedAt?: string }>;
} | null;

export type AiProviderState = {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  embeddingModel: string;
  apiKey: string;
  clearApiKey: boolean;
};

export type SearchProviderState = {
  provider: SearchProvider;
  apiKey: string;
  clearApiKey: boolean;
};

const PROVIDER_DEFAULTS: Record<
  AiProvider,
  {
    label: string;
    description: string;
    baseUrl: string;
    model: string;
    embeddingModel: string;
    requiresApiKey: boolean;
  }
> = {
  openai: {
    label: "OpenAI",
    description: "GPT models through the OpenAI-compatible chat API.",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    embeddingModel: "text-embedding-3-small",
    requiresApiKey: true,
  },
  anthropic: {
    label: "Claude API",
    description: "Claude models through Anthropic's Messages API.",
    baseUrl: "https://api.anthropic.com",
    model: "claude-3-5-sonnet-latest",
    embeddingModel: "text-embedding-3-small",
    requiresApiKey: true,
  },
  codex: {
    label: "Codex subscription",
    description: "Use your local Codex/ChatGPT subscription from the Codex CLI. No API key.",
    baseUrl: "https://chatgpt.com/backend-api",
    model: "gpt-5.5",
    embeddingModel: "text-embedding-3-small",
    requiresApiKey: false,
  },
  "claude-subscription": {
    label: "Claude Code subscription",
    description: "Use the local Claude Code subscription from macOS Keychain. No API key.",
    baseUrl: "https://api.anthropic.com",
    model: "claude-opus-4-8",
    embeddingModel: "text-embedding-3-small",
    requiresApiKey: false,
  },
};

const PROVIDERS: { value: AiProvider; icon: typeof BrainCircuit }[] = [
  { value: "openai", icon: BrainCircuit },
  { value: "anthropic", icon: MessageSquareText },
  { value: "codex", icon: Terminal },
  { value: "claude-subscription", icon: Terminal },
];

const SEARCH_PROVIDER_LABELS: Record<SearchProvider, string> = {
  tavily: "Tavily",
  brave: "Brave Search",
  serper: "Serper",
};

export function initialAiProviderState(aiKeys: PublicAiKeys): AiProviderState {
  const provider = aiKeys?.provider ?? "openai";
  const defaults = PROVIDER_DEFAULTS[provider];
  return {
    provider,
    baseUrl: aiKeys?.baseUrl || defaults.baseUrl,
    model: aiKeys?.model || defaults.model,
    embeddingModel: aiKeys?.embeddingModel || defaults.embeddingModel,
    apiKey: "",
    clearApiKey: false,
  };
}

export function aiProviderPayload(state: AiProviderState) {
  const requiresApiKey = PROVIDER_DEFAULTS[state.provider].requiresApiKey;
  return {
    provider: state.provider,
    baseUrl: state.baseUrl.trim(),
    model: state.model.trim(),
    embeddingModel:
      state.provider === "openai" ? state.embeddingModel.trim() || undefined : undefined,
    apiKey: requiresApiKey ? state.apiKey.trim() || undefined : undefined,
    clearApiKey: requiresApiKey ? state.clearApiKey : false,
  };
}

export function initialSearchProviderState(aiKeys: PublicAiKeys): SearchProviderState {
  return {
    provider: aiKeys?.searchProvider ?? "tavily",
    apiKey: "",
    clearApiKey: false,
  };
}

export function searchProviderPayload(state: SearchProviderState) {
  return {
    provider: state.provider,
    apiKey: state.apiKey.trim() || undefined,
    clearApiKey: state.clearApiKey,
  };
}

interface AiProviderFieldsProps {
  state: AiProviderState;
  onChange: (state: AiProviderState) => void;
  aiKeys?: PublicAiKeys;
  disabled?: boolean;
}

export function AiProviderFields({
  state,
  onChange,
  aiKeys,
  disabled,
}: AiProviderFieldsProps) {
  const [showKey, setShowKey] = React.useState(false);
  const currentDefaults = PROVIDER_DEFAULTS[state.provider];
  const requiresApiKey = currentDefaults.requiresApiKey;
  const hasSavedKey = Boolean(aiKeys?.hasApiKey && !state.clearApiKey);
  const subscriptionHint =
    state.provider === "codex"
      ? "Uses your Codex CLI login on this machine. Sign in to Codex first, then save this provider."
      : state.provider === "claude-subscription"
        ? "Uses your Claude Code login from macOS Keychain on this machine. Sign in to Claude Code first, then save this provider."
        : "";

  function chooseProvider(provider: AiProvider) {
    const defaults = PROVIDER_DEFAULTS[provider];
    onChange({
      ...state,
      provider,
      baseUrl: defaults.baseUrl,
      model: defaults.model,
      embeddingModel: defaults.embeddingModel,
      clearApiKey: state.provider === provider ? state.clearApiKey : false,
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-2">
        <Label>Provider</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((item) => {
            const defaults = PROVIDER_DEFAULTS[item.value];
            const Icon = item.icon;
            const selected = state.provider === item.value;
            return (
              <button
                key={item.value}
                type="button"
                disabled={disabled}
                onClick={() => chooseProvider(item.value)}
                className={cn(
                  "flex min-h-24 items-start gap-3 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-surface hover:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{defaults.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {defaults.description}
                  </span>
                  <span className="mt-2 block text-[11px] font-medium uppercase tracking-normal text-muted-foreground">
                    {defaults.requiresApiKey ? "API key" : "Local subscription"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="ai-model">Model</Label>
          <Input
            id="ai-model"
            value={state.model}
            disabled={disabled}
            onChange={(e) => onChange({ ...state, model: e.target.value })}
            placeholder={currentDefaults.model}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="ai-base-url">Base URL</Label>
          <Input
            id="ai-base-url"
            value={state.baseUrl}
            disabled={disabled}
            onChange={(e) => onChange({ ...state, baseUrl: e.target.value })}
            placeholder={currentDefaults.baseUrl}
          />
        </div>
      </div>

      {state.provider === "openai" && (
        <div className="grid gap-2 sm:max-w-sm">
          <Label htmlFor="ai-embedding-model">Embedding model</Label>
          <Input
            id="ai-embedding-model"
            value={state.embeddingModel}
            disabled={disabled}
            onChange={(e) => onChange({ ...state, embeddingModel: e.target.value })}
            placeholder={PROVIDER_DEFAULTS.openai.embeddingModel}
          />
          <p className="text-xs text-muted-foreground">
            Used for OpenAI-compatible semantic search. Claude chat uses local embeddings.
          </p>
        </div>
      )}

      {requiresApiKey ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="ai-api-key">API key</Label>
            {hasSavedKey && (
              <span className="text-xs text-muted-foreground">
                Saved key {aiKeys?.keyPreview || "configured"}
              </span>
            )}
          </div>
          <div className="relative">
            <Input
              id="ai-api-key"
              type={showKey ? "text" : "password"}
              value={state.apiKey}
              disabled={disabled || state.clearApiKey}
              onChange={(e) =>
                onChange({ ...state, apiKey: e.target.value, clearApiKey: false })
              }
              className="pr-10"
              placeholder={hasSavedKey ? "Leave blank to keep saved key" : "Paste your API key"}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled || state.clearApiKey}
              className="absolute right-0 top-0 h-9 w-9"
              aria-label={showKey ? "Hide API key" : "Show API key"}
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>

          {aiKeys?.hasApiKey && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {state.clearApiKey ? "The saved key will be removed on save." : "Saved keys are masked in the browser."}
              </p>
              <Button
                type="button"
                variant={state.clearApiKey ? "secondary" : "outline"}
                size="sm"
                disabled={disabled}
                onClick={() =>
                  onChange({ ...state, apiKey: "", clearApiKey: !state.clearApiKey })
                }
              >
                <Trash2 className="h-4 w-4" />
                {state.clearApiKey ? "Keep key" : "Remove key"}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground">
          {subscriptionHint}
        </div>
      )}
    </div>
  );
}

export function SearchProviderFields({
  state,
  onChange,
  aiKeys,
  disabled,
}: {
  state: SearchProviderState;
  onChange: (state: SearchProviderState) => void;
  aiKeys?: PublicAiKeys;
  disabled?: boolean;
}) {
  const [showKey, setShowKey] = React.useState(false);
  const currentKey = aiKeys?.searchKeys?.[state.provider];
  const hasSavedKey = Boolean(currentKey?.hasApiKey && !state.clearApiKey);

  return (
    <div className="space-y-5">
      <div className="grid gap-2">
        <Label>Search provider</Label>
        <Select
          value={state.provider}
          disabled={disabled}
          onValueChange={(provider) =>
            onChange({ provider: provider as SearchProvider, apiKey: "", clearApiKey: false })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tavily">Tavily</SelectItem>
            <SelectItem value="brave">Brave Search</SelectItem>
            <SelectItem value="serper">Serper</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Used by Discover for broad web search. Saved sources still work without a search key.
        </p>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="search-api-key">{SEARCH_PROVIDER_LABELS[state.provider]} API key</Label>
          {hasSavedKey && (
            <span className="text-xs text-muted-foreground">
              Saved key {currentKey?.keyPreview || "configured"}
            </span>
          )}
        </div>
        <div className="relative">
          <Input
            id="search-api-key"
            type={showKey ? "text" : "password"}
            value={state.apiKey}
            disabled={disabled || state.clearApiKey}
            onChange={(e) => onChange({ ...state, apiKey: e.target.value, clearApiKey: false })}
            className="pr-10"
            placeholder={hasSavedKey ? "Leave blank to keep saved key" : "Paste your search API key"}
            autoComplete="off"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || state.clearApiKey}
            className="absolute right-0 top-0 h-9 w-9"
            aria-label={showKey ? "Hide search API key" : "Show search API key"}
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>

        {currentKey?.hasApiKey && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-2 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {state.clearApiKey
                ? `${SEARCH_PROVIDER_LABELS[state.provider]} will be removed on save.`
                : "Saved search keys are encrypted and masked in the browser."}
            </p>
            <Button
              type="button"
              variant={state.clearApiKey ? "secondary" : "outline"}
              size="sm"
              disabled={disabled}
              onClick={() => onChange({ ...state, apiKey: "", clearApiKey: !state.clearApiKey })}
            >
              <Trash2 className="h-4 w-4" />
              {state.clearApiKey ? "Keep key" : "Remove key"}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-2 rounded-md border border-border bg-surface/50 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Search className="h-4 w-4 text-muted-foreground" />
          Configured search keys
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          {(Object.keys(SEARCH_PROVIDER_LABELS) as SearchProvider[]).map((provider) => {
            const key = aiKeys?.searchKeys?.[provider];
            return (
              <div key={provider} className="rounded border border-border bg-card px-3 py-2">
                <div className="font-medium">{SEARCH_PROVIDER_LABELS[provider]}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {key?.hasApiKey ? key.keyPreview || "configured" : "Not set"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
