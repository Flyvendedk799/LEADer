"use server";

import { getSessionUserId } from "@/lib/auth/session";
import {
  antigravityStatusFor,
  beginAntigravityLogin,
  completeAntigravityLogin,
  disconnectAntigravity,
  listAntigravityModels,
} from "./ai/antigravity";

async function requireAuth() {
  const userId = await getSessionUserId();
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

export async function antigravityConnection() {
  const userId = await requireAuth();
  return antigravityStatusFor(userId);
}

export async function startAntigravityConnection() {
  const userId = await requireAuth();
  return beginAntigravityLogin(userId);
}

export async function finishAntigravityConnection(pastedUrl: string) {
  const userId = await requireAuth();
  await completeAntigravityLogin(userId, pastedUrl);
}

export async function removeAntigravityConnection() {
  const userId = await requireAuth();
  await disconnectAntigravity(userId);
}

/** Models this user's Antigravity login can call; empty if unavailable. */
export async function antigravityModels() {
  const userId = await requireAuth();
  try {
    return await listAntigravityModels(userId);
  } catch (err) {
    console.warn(`[antigravity] model list unavailable: ${String(err)}`);
    return [];
  }
}
