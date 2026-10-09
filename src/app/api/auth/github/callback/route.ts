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
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: new URL("/api/auth/github/callback", url.origin).toString(),
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return NextResponse.redirect(new URL("/login?error=oauth_token_error", url.origin));
    }

    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });
    const userData = await userRes.json();

    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });
    const emailsData = await emailsRes.json();
    const primaryEmail = emailsData.find((e: any) => e.primary)?.email;

    if (!primaryEmail) {
      return NextResponse.redirect(new URL("/login?error=no_email", url.origin));
    }

    const email = primaryEmail.trim().toLowerCase();
    const name = userData.name || userData.login;

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
    console.error("GitHub OAuth error:", err);
    return NextResponse.redirect(new URL("/login?error=oauth_internal_error", url.origin));
  }
}