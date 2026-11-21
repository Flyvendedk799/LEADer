import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { createApiToken, listApiTokens, requireSessionAuth, revokeApiToken } from "@/lib/auth/api-tokens";

// Personal API tokens. The raw token is only in the POST response. Creating a
// token needs a browser session (or `npm run token:create` on the server).
const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
});

export async function GET() {
  try {
    const ownerId = await requireOwnerId();
    return NextResponse.json({ tokens: await listApiTokens(ownerId) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    await requireSessionAuth(); // a token cannot mint further tokens
    const input = createSchema.parse(await req.json().catch(() => ({})));
    return NextResponse.json({ token: await createApiToken(ownerId, input) }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const ownerId = await requireOwnerId();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const revoked = await revokeApiToken(ownerId, id);
    return NextResponse.json({ revoked }, { status: revoked ? 200 : 404 });
  } catch (err) {
    return apiError(err);
  }
}
