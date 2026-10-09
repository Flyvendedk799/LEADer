import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = process.env.GITHUB_CLIENT_ID || "";

  if (!clientId) {
    return NextResponse.json({ error: "GitHub OAuth not configured" }, { status: 500 });
  }

  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", new URL("/api/auth/github/callback", url.origin).toString());
  authUrl.searchParams.set("scope", "user:email");

  return NextResponse.redirect(authUrl.toString());
}