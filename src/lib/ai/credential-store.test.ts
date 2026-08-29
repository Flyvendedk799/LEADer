import { describe, expect, it } from "vitest";
import type { StoredRecord } from "@flyvendedk799/ai-auth";
import { PrismaCredentialStore, type CredentialRows } from "./credential-store";

/** A stand-in for `db.aiCredential` with the three calls the store makes. */
function fakeRows() {
  const rows = new Map<string, { payload: string; meta: unknown }>();
  const delegate: CredentialRows = {
    async findUnique({ where }) {
      return rows.get(where.key) ?? null;
    },
    async upsert({ where, create, update }) {
      rows.set(where.key, rows.has(where.key) ? { ...create, ...update } : create);
      return null;
    },
    async deleteMany({ where }) {
      rows.delete(where.key);
      return null;
    },
  };
  return { rows, delegate };
}

describe("PrismaCredentialStore", () => {
  it("round-trips a sealed record and reports a missing key as null", async () => {
    const { delegate } = fakeRows();
    const store = new PrismaCredentialStore(delegate);
    const record: StoredRecord = { payload: "sealed", meta: { plan: "max", expiresAt: 42 } };

    expect(await store.read("claude:u1")).toBeNull();
    await store.write("claude:u1", record);
    expect(await store.read("claude:u1")).toEqual(record);
  });

  it("overwrites an existing row rather than failing on the second write", async () => {
    const { delegate } = fakeRows();
    const store = new PrismaCredentialStore(delegate);

    await store.write("claude:u1", { payload: "first", meta: {} });
    await store.write("claude:u1", { payload: "second", meta: { plan: "pro" } });

    expect(await store.read("claude:u1")).toEqual({ payload: "second", meta: { plan: "pro" } });
  });

  it("drops meta values the interface does not allow, instead of handing them back", async () => {
    const { rows, delegate } = fakeRows();
    rows.set("claude:u1", {
      payload: "sealed",
      meta: { plan: "max", expiresAt: 42, nested: { no: true }, missing: null },
    });

    const record = await new PrismaCredentialStore(delegate).read("claude:u1");
    expect(record?.meta).toEqual({ plan: "max", expiresAt: 42, missing: null });
  });

  it("treats deleting an absent key as already done", async () => {
    const { delegate } = fakeRows();
    const store = new PrismaCredentialStore(delegate);

    await expect(store.delete("claude:nobody")).resolves.toBeUndefined();

    await store.write("claude:u1", { payload: "sealed", meta: {} });
    await store.delete("claude:u1");
    expect(await store.read("claude:u1")).toBeNull();
  });
});
