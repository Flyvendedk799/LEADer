import { describe, expect, it, vi } from "vitest";
import { handleRpc, loopbackApi } from "./server";
import { LEADER_TOOLS, type ApiCall } from "./tools";
import { bearerApiToken } from "@/lib/auth/constants";

const rpc = (method: string, params?: Record<string, unknown>) => ({ jsonrpc: "2.0" as const, id: 1, method, params });

describe("MCP server", () => {
  const api: ApiCall = vi.fn(async (method, path) => ({ status: 200, data: { method, path } }));

  it("negotiates a supported protocol version", async () => {
    const res = (await handleRpc(rpc("initialize", { protocolVersion: "2025-03-26" }), api)) as { result: { protocolVersion: string; capabilities: unknown } };
    expect(res.result.protocolVersion).toBe("2025-03-26");
    expect(res.result.capabilities).toEqual({ tools: { listChanged: false } });
    const fallback = (await handleRpc(rpc("initialize", { protocolVersion: "1999-01-01" }), api)) as { result: { protocolVersion: string } };
    expect(fallback.result.protocolVersion).toBe("2025-06-18");
  });

  it("does not answer notifications", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, api)).toBeNull();
  });

  it("lists every tool with a unique name and object schema", async () => {
    const res = (await handleRpc(rpc("tools/list"), api)) as { result: { tools: { name: string; inputSchema: { type: string } }[] } };
    const names = res.result.tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("leader_overview");
    expect(res.result.tools.every((t) => t.inputSchema.type === "object")).toBe(true);
  });

  it("calls a tool and returns JSON text", async () => {
    const res = (await handleRpc(rpc("tools/call", { name: "leader_get_candidate", arguments: { id: "c 1" } }), api)) as {
      result: { content: { text: string }[]; isError: boolean };
    };
    expect(res.result.isError).toBe(false);
    expect(JSON.parse(res.result.content[0].text)).toEqual({ method: "GET", path: "/api/ops/candidates/c%201" });
  });

  it("reports HTTP failures as tool errors, not protocol errors", async () => {
    const failing: ApiCall = async () => ({ status: 404, data: { error: "Not found" } });
    const res = (await handleRpc(rpc("tools/call", { name: "leader_get_run", arguments: { id: "x" } }), failing)) as {
      result: { content: { text: string }[]; isError: boolean };
    };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("HTTP 404");
  });

  it("resolves a lane slug before queueing discovery", async () => {
    const calls: unknown[] = [];
    const fake: ApiCall = async (method, path, init) => {
      calls.push({ method, path, body: init?.body });
      return path.startsWith("/api/ops/lanes/") ? { status: 200, data: { id: "lane_1" } } : { status: 202, data: { queued: true } };
    };
    await handleRpc(rpc("tools/call", { name: "leader_run_discovery", arguments: { lane: "funded-work", query: "app" } }), fake);
    expect(calls[1]).toEqual({ method: "POST", path: "/api/discovery/runs", body: { query: "app", laneId: "lane_1" } });
  });

  it("merges a partial company profile into the current one", async () => {
    let patched: unknown;
    const fake: ApiCall = async (method, _path, init) => {
      if (method === "GET") return { status: 200, data: { companyProfile: { name: "Mast3kmedia", dailySearchQueries: 20 } } };
      patched = init?.body;
      return { status: 200, data: {} };
    };
    await handleRpc(rpc("tools/call", { name: "leader_update_settings", arguments: { companyProfile: { dailySearchQueries: 60 } } }), fake);
    expect(patched).toEqual({ companyProfile: { name: "Mast3kmedia", dailySearchQueries: 60 } });
  });

  it("keeps the generic tool inside the API", async () => {
    const res = (await handleRpc(rpc("tools/call", { name: "leader_api", arguments: { method: "GET", path: "/login" } }), api)) as {
      result: { isError: boolean };
    };
    expect(res.result.isError).toBe(true);
  });

  it("rejects unknown methods and tools", async () => {
    expect(await handleRpc(rpc("resources/list"), api)).toMatchObject({ error: { code: -32601 } });
    expect(await handleRpc(rpc("tools/call", { name: "nope" }), api)).toMatchObject({ error: { code: -32602 } });
  });

  it("every tool has a description", () => {
    expect(LEADER_TOOLS.every((t) => t.description.length > 20)).toBe(true);
  });
});

describe("loopbackApi", () => {
  it("forwards the token, query and JSON body", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }));
    const call = loopbackApi("http://127.0.0.1:3000", "Bearer ldr_x", fetchImpl as unknown as typeof fetch);
    const res = await call("POST", "/api/tasks", { query: { status: ["OPEN", "DONE"], empty: "" }, body: { title: "t" } });
    expect(res).toEqual({ status: 201, data: { ok: true } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("http://127.0.0.1:3000/api/tasks?status=OPEN%2CDONE");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ldr_x");
    expect(init.body).toBe(JSON.stringify({ title: "t" }));
  });
});

describe("bearerApiToken", () => {
  it("accepts only well-formed LEADer tokens", () => {
    const token = `ldr_${"a".repeat(43)}`;
    expect(bearerApiToken(`Bearer ${token}`)).toBe(token);
    expect(bearerApiToken(`bearer ${token}`)).toBe(token);
    expect(bearerApiToken("Bearer some-cron-secret")).toBeNull();
    expect(bearerApiToken("Bearer ldr_short")).toBeNull();
    expect(bearerApiToken(null)).toBeNull();
  });
});
