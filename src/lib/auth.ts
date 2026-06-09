import { db } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────
// AUTH SEAM — keep simple for local dev, NextAuth/Clerk-ready later.
//
// Today: returns the single seeded power user (by DEV_USER_EMAIL). Every
// tenant-scoped query in the app already filters by the returned id, so when
// you wire real auth you ONLY change the body of getCurrentUser() to read the
// session — no call sites need to change.
//
//   // later:
//   const session = await getServerSession(authOptions)
//   return db.user.findUnique({ where: { email: session.user.email } })
// ─────────────────────────────────────────────────────────────────────────

const DEV_EMAIL = process.env.DEV_USER_EMAIL || "owner@leader.local";

export async function getCurrentUser() {
  const user = await db.user.findFirst({
    where: { email: DEV_EMAIL },
  });
  if (user) return user;
  // Fall back to the first user so a fresh DB (pre-seed) still resolves.
  return db.user.findFirst();
}

/** Convenience: the current owner id, throwing if no user exists yet. */
export async function requireOwnerId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error(
      "No user found. Run `npm run db:seed` to create the power user.",
    );
  }
  return user.id;
}
