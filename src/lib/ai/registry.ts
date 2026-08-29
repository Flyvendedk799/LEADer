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
export type LeaderProvider = "openai" | "anthropic" | "codex" | "claude-subscription";

/**
 * LEADer calls the Claude subscription provider `claude-subscription`; the
 * registry calls it `claude-code`, after the CLI whose client id mints the token.
 * One line rather than a rename, because the stored value is in every user's row.
 */
export function registryProvider(provider: LeaderProvider): ProviderId {
  return provider === "claude-subscription" ? "claude-code" : provider;
}

/** The models worth offering for a provider, lightest first. */
export function modelChoices(provider: LeaderProvider): ModelSpec[] {
  return modelsFor(registryProvider(provider));
}

/** What a tier means where someone is choosing between them. */
export const TIER_LABELS: Record<ModelTier, string> = {
  light: "Light",
  balanced: "Balanced",
  heavy: "Heavy",
};
