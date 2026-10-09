import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("oauth_state")?.value;
  const nextPath = cookieStore.get("oauth_next")?.value || "/";

  // Clean up cookies
  cookieStore.delete("oauth_state");
  cookieStore.delete("oauth_next");

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=oauth_error", url.origin));
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        code,
        grant_type: "authorization_code",
        redirect_uri: new URL("/api/auth/google/callback", url.origin).toString(),
      }).toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return NextResponse.redirect(new URL("/login?error=oauth_token_error", url.origin));
    }

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });
    const userData = await userRes.json();

    if (!userData.email) {
      return NextResponse.redirect(new URL("/login?error=no_email", url.origin));
    }

    const email = userData.email.trim().toLowerCase();
    const name = userData.name;

    let user = await db.user.findUnique({ where: { email } });
    if (!user) {
      user = await db.user.create({
        data: {
          email,
          name,
          passwordHash: null,
        },
      });
    } else if (!user.name && name) {
      user = await db.user.update({
        where: { id: user.id },
        data: { name },
      });
    }

    await createSession(user.id, {
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });

    return NextResponse.redirect(new URL(nextPath, url.origin));
  } catch (err) {
    console.error("Google OAuth error:", err);
    return NextResponse.redirect(new URL("/login?error=oauth_internal_error", url.origin));
  }
}