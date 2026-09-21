import {
  AntigravityAccountStore,
  startAntigravityLogin,
  exchangeAntigravityCode,
  AntigravityLoginError,
} from "@flyvendedk799/ai-auth";
import { antigravityAccountStore } from "./credentials";
import {
  rememberAntigravityLogin,
  takeAntigravityLogin,
  forgetAntigravityLogin,
} from "./antigravity-login";

export function antigravityAccounts(): AntigravityAccountStore {
  return antigravityAccountStore();
}

export async function antigravityStatusFor(accountId: string) {
  return await antigravityAccounts().status(accountId);
}

export async function beginAntigravityLogin(accountId: string) {
  const login = await startAntigravityLogin(false);
  rememberAntigravityLogin(accountId, {
    verifier: login.verifier,
    state: login.state,
  });
  return login.url;
}

export function parsePastedAntigravityCode(pasted: string) {
  try {
    const url = new URL(pasted);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      throw new Error("Missing code or state in pasted URL.");
    }
    return { code, state };
  } catch {
    throw new Error("Invalid pasted URL.");
  }
}

export async function completeAntigravityLogin(accountId: string, pasted: string) {
  const { code, state } = parsePastedAntigravityCode(pasted);
  const pending = takeAntigravityLogin(accountId);
  
  if (!pending) {
    throw new Error("No pending login found. Please try again.");
  }
  
  if (pending.state !== state) {
    throw new Error("State mismatch. Possible CSRF attack.");
  }
  
  const tokens = await exchangeAntigravityCode({
    code,
    verifier: pending.verifier,
    isDogfood: false,
  });
  await antigravityAccounts().save(accountId, tokens);
}

export async function disconnectAntigravity(accountId: string) {
  forgetAntigravityLogin(accountId);
  await antigravityAccounts().forget(accountId);
}
