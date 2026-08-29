import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    aiCredential: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { ClaudeAccountStore } from "@flyvendedk799/ai-auth";
import { PrismaCredentialStore, hostSecret } from "./credentials";

describe("PrismaCredentialStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads nothing for an account that never connected", async () => {
    mocks.db.aiCredential.findUnique.mockResolvedValue(null);

    expect(await new PrismaCredentialStore().read("leader:claude:user-1")).toBeNull();
  });

  it("round-trips a record through the columns Prisma actually has", async () => {
    const store = new PrismaCredentialStore();
    await store.write("leader:claude:user-1", {
      payload: "sealed",
      meta: { plan: "max", expiresAt: 42 },
    });

    expect(mocks.db.aiCredential.upsert).toHaveBeenCalledWith({
      where: { key: "leader:claude:user-1" },
      create: {
        key: "leader:claude:user-1",
        payload: "sealed",
        meta: { plan: "max", expiresAt: 42 },
      },
      update: { payload: "sealed", meta: { plan: "max", expiresAt: 42 } },
    });

    mocks.db.aiCredential.findUnique.mockResolvedValue({
      key: "leader:claude:user-1",
      payload: "sealed",
      meta: { plan: "max", expiresAt: 42 },
    });
    expect(await store.read("leader:claude:user-1")).toEqual({
      payload: "sealed",
      meta: { plan: "max", expiresAt: 42 },
    });
  });

  // deleteMany rather than delete: disconnecting an account that was never
  // connected is the same outcome the caller wanted, not a P2025.
  it("disconnects an account that has no row without throwing", async () => {
    mocks.db.aiCredential.deleteMany.mockResolvedValue({ count: 0 });

    await expect(new PrismaCredentialStore().delete("leader:claude:ghost")).resolves.toBeUndefined();
  });
});

describe("what a connected account puts in the database", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_KEYS_ENCRYPTION_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("seals the token and leaves only non-secret facts readable", async () => {
    const store = new ClaudeAccountStore({
      store: new PrismaCredentialStore(),
      secret: hostSecret(),
      namespace: "leader",
    });

    await store.save("user-1", {
      accessToken: "sk-ant-oat-secret-token",
      refreshToken: "sk-ant-ort-secret-refresh",
      expiresAt: 4_000_000_000_000,
      scopes: ["user:inference"],
      subscriptionType: "max",
    });

    const written = mocks.db.aiCredential.upsert.mock.calls[0][0];
    expect(written.where.key).toBe("leader:claude:user-1");
    expect(JSON.stringify(written.create)).not.toContain("secret-token");
    expect(JSON.stringify(written.create)).not.toContain("secret-refresh");
    // The plan and the expiry sit beside the ciphertext so a status line costs
    // no decryption.
    expect(written.create.meta).toEqual({ plan: "max", expiresAt: 4_000_000_000_000 });
  });

  it("reads back as disconnected after the host secret is rotated", async () => {
    const sealing = new ClaudeAccountStore({
      store: new PrismaCredentialStore(),
      secret: "test-secret",
      namespace: "leader",
    });
    await sealing.save("user-1", {
      accessToken: "sk-ant-oat-secret-token",
      refreshToken: null,
      expiresAt: 4_000_000_000_000,
      scopes: [],
      subscriptionType: "max",
    });
    const written = mocks.db.aiCredential.upsert.mock.calls[0][0];
    mocks.db.aiCredential.findUnique.mockResolvedValue({
      key: written.where.key,
      payload: written.create.payload,
      meta: written.create.meta,
    });

    // Not an exception: an unreadable credential sends the user through the
    // login again, which is a working recovery. Throwing would take the page down.
    const rotated = new ClaudeAccountStore({
      store: new PrismaCredentialStore(),
      secret: "a-different-secret",
      namespace: "leader",
    });
    expect(await rotated.status("user-1")).toMatchObject({ connected: false });
  });
});
