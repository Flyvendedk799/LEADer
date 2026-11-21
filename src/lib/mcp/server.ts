import { LEADER_TOOLS, ToolError, type ApiCall, type LeaderTool } from "./tools";

// Minimal stateless MCP server (Streamable HTTP, JSON responses only):
// initialize, ping, tools/list and tools/call. No sessions or server-sent
// events are needed because every tool call is a single request/response.

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export const SERVER_INSTRUCTIONS = `LEADer is Mast3kmedia's lead-intelligence workspace: discovery lanes run missions (web search + public sources) that produce candidates; the owner reviews candidates and saves good ones as deals with follow-up tasks.
Start with leader_overview to see worker health, budgets and recent failures. Paid search/AI calls are limited by daily and monthly allowances in the company profile; a mission that hits them ends BUDGET_PAUSED. Saving a candidate creates an account, deal and task but never sends outreach. Use leader_api for any route without a dedicated tool.`;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string; data?: unknown } };

export function toolDescriptor(tool: LeaderTool) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { readOnlyHint: Boolean(tool.readOnly), openWorldHint: false },
  };
}

const MAX_TEXT = 200_000;

function textResult(value: unknown, isError = false) {
  let text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT)}\n…[truncated ${text.length - MAX_TEXT} chars; narrow the request with limit/filters]`;
  return { content: [{ type: "text", text }], isError };
}

export async function handleRpc(
  message: JsonRpcRequest,
  api: ApiCall,
  tools: LeaderTool[] = LEADER_TOOLS,
): Promise<JsonRpcResponse | null> {
  const id = message.id ?? null;
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, msg: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message: msg } });

  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return fail(-32600, "Invalid Request");
  // Notifications (no id) get no response.
  if (message.id === undefined) return null;

  switch (message.method) {
    case "initialize": {
      const requested = String(message.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "leader", title: "LEADer", version: "1.0.0" },
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: tools.map(toolDescriptor) });
    case "tools/call": {
      const name = String(message.params?.name ?? "");
      const tool = tools.find((t) => t.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);
      const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        return ok(textResult(await tool.run(args, api)));
      } catch (err) {
        if (err instanceof ToolError) return ok(textResult(err.message, true));
        return ok(textResult(`Tool failed: ${err instanceof Error ? err.message : String(err)}`, true));
      }
    }
    default:
      return fail(-32601, `Method not found: ${message.method}`);
  }
}

/** An ApiCall that requests LEADer's own HTTP API with the caller's token. */
export function loopbackApi(baseUrl: string, authorization: string, fetchImpl: typeof fetch = fetch): ApiCall {
  return async (method, path, init) => {
    const url = new URL(path, baseUrl);
    for (const [k, v] of Object.entries(init?.query ?? {})) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
    const res = await fetchImpl(url, {
      method,
      headers: {
        authorization,
        accept: "application/json",
        ...(init?.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      redirect: "manual",
    });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // keep text (exports, HTML errors)
    }
    return { status: res.status, data };
  };
}
