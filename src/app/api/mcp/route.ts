import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { bearerApiToken } from "@/lib/auth/constants";
import { handleRpc, loopbackApi } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/mcp — MCP server (Streamable HTTP, stateless, JSON responses).
// Requires `Authorization: Bearer ldr_…`. Tools call this app's own API over
// loopback with the same token, so they act exactly as the token owner.

function internalBaseUrl(req: Request) {
  if (process.env.LEADER_INTERNAL_URL) return process.env.LEADER_INTERNAL_URL;
  if (process.env.PORT) return `http://127.0.0.1:${process.env.PORT}`;
  return new URL(req.url).origin;
}

const unauthorized = () =>
  NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "A valid LEADer API token is required (Authorization: Bearer ldr_…)" } },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="leader"' } },
  );

export async function POST(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  if (!bearerApiToken(authorization) || !(await getCurrentUser())) return unauthorized();

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  const api = loopbackApi(internalBaseUrl(req), authorization);
  if (Array.isArray(payload)) {
    const responses = (await Promise.all(payload.map((m) => handleRpc(m, api)))).filter(Boolean);
    return responses.length ? NextResponse.json(responses) : new NextResponse(null, { status: 202 });
  }
  const response = await handleRpc(payload as Parameters<typeof handleRpc>[0], api);
  return response ? NextResponse.json(response) : new NextResponse(null, { status: 202 });
}

// No server-initiated stream; clients fall back to plain request/response.
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
