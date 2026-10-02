/**
 * The model catalogue, shared by the settings picker and the code that makes calls.
 *
 * Imports `@flyvendedk799/ai-auth/registry` and nothing else on purpose: the root
 * entry point reaches for `node:crypto`, so a client component that pulls in the
 * model list through it will not build. Everything here is safe in a browser.
 */
import {
  modelsFor,
  modelSpec,
  pricingFor,
  isPricingKnown,
  type ModelSpec,
  type ModelTier,
  type ProviderId,
} from "@flyvendedk799/ai-auth/registry";

export type { ModelSpec, ModelTier, ProviderId };
export { modelSpec, pricingFor, isPricingKnown };

/** LEADer's provider ids, as stored in the user's `aiKeys` blob. */
export type LeaderProvider = "openai" | "anthropic" | "codex" | "claude-subscription" | "gemini" | "gemini-subscription";

/**
 * LEADer calls the Claude subscription provider `claude-subscription`; the
 * registry calls it `claude-code`, after the CLI whose client id mints the token.
 * One line rather than a rename, because the stored value is in every user's row.
 */
export function registryProvider(provider: LeaderProvider): ProviderId {
  if (provider === "claude-subscription") return "claude-code";
  if (provider === "gemini-subscription") return "gemini-cli";
  return provider;
}

/** The models worth offering for a provider, lightest first. */
export function modelChoices(provider: LeaderProvider): ModelSpec[] {
  if (provider === "gemini-subscription") {
    return modelsFor("gemini-cli").filter((model) =>
      ["gemini-3-flash", "gemini-3.1-pro"].includes(model.id),
    );
  }
  if (provider === "gemini") {
    return [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", wire: "gemini", tier: "light", note: "Fast Gemini API model." },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", wire: "gemini", tier: "balanced", note: "Gemini API model for complex work." },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", wire: "gemini", tier: "light", note: "Fast preview model on the Gemini API." },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", wire: "gemini", tier: "heavy", note: "Gemini API preview model for complex reasoning." },
    ];
  }
  return modelsFor(registryProvider(provider));
}

/** What a tier means where someone is choosing between them. */
export const TIER_LABELS: Record<ModelTier, string> = {
  light: "Light",
  balanced: "Balanced",
  heavy: "Heavy",
};
