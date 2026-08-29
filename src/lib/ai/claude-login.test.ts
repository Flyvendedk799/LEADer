import { beforeEach, describe, expect, it } from "vitest";
import {
  PENDING_TTL_MS,
  clearPendingLogins,
  forgetLogin,
  rememberLogin,
  takeLogin,
} from "./claude-login";

describe("pending Claude subscription logins", () => {
  beforeEach(() => {
    clearPendingLogins();
  });

  it("hands a started login back to the user who started it", () => {
    rememberLogin("user-1", { verifier: "v1", state: "s1" });

    expect(takeLogin("user-1")).toMatchObject({ verifier: "v1", state: "s1" });
  });

  it("keeps one user's login out of another's exchange", () => {
    rememberLogin("user-1", { verifier: "v1", state: "s1" });

    expect(takeLogin("user-2")).toBeNull();
    expect(takeLogin("user-1")).toMatchObject({ verifier: "v1" });
  });

  // A code that failed to exchange cannot be retried and one that succeeded must
  // not be replayed, so the login is spent either way.
  it("spends a login on first use", () => {
    rememberLogin("user-1", { verifier: "v1", state: "s1" });

    expect(takeLogin("user-1")).not.toBeNull();
    expect(takeLogin("user-1")).toBeNull();
  });

  it("expires a login that was never completed", () => {
    const started = 1_000_000;
    rememberLogin("user-1", { verifier: "v1", state: "s1" }, started);

    expect(takeLogin("user-1", started + PENDING_TTL_MS - 1)).not.toBeNull();

    rememberLogin("user-2", { verifier: "v2", state: "s2" }, started);
    expect(takeLogin("user-2", started + PENDING_TTL_MS)).toBeNull();
  });

  it("drops a pending login when the account disconnects mid-flow", () => {
    rememberLogin("user-1", { verifier: "v1", state: "s1" });
    forgetLogin("user-1");

    expect(takeLogin("user-1")).toBeNull();
  });
});
