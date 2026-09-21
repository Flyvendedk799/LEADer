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
  pasted = pasted.trim();
  if (pasted.includes("code=")) {
    let url: URL;
    try {
      url = new URL(pasted);
    } catch {
      try {
        url = new URL(`http://dummy${pasted.startsWith('?') ? '' : '?'}${pasted}`);
      } catch {
        throw new Error("Invalid pasted token format.");
      }
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) throw new Error("Could not find code in pasted URL.");
    return { code, state };
  }
  // Assume the user pasted the raw token directly
  return { code: pasted, state: null };
}

export async function completeAntigravityLogin(accountId: string, pasted: string) {
  const { code, state } = parsePastedAntigravityCode(pasted);
  const pending = takeAntigravityLogin(accountId);
  
  if (!pending) {
    throw new Error("No pending login found. Please try again.");
  }
  
  if (state && pending.state !== state) {
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
