import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = process.env.GITHUB_CLIENT_ID || "";
  const next = url.searchParams.get("next") || "/";

  if (!clientId) {
    return NextResponse.json({ error: "GitHub OAuth not configured" }, { status: 500 });
  }

  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
    sameSite: "lax",
  });

  cookieStore.set("oauth_next", next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
    sameSite: "lax",
  });

  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", new URL("/api/auth/github/callback", url.origin).toString());
  authUrl.searchParams.set("scope", "user:email");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}