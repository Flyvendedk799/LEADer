// Create a personal API token from the server shell (bootstrap for agents).
//   npm run token:create -- --email you@example.com --name "Claude Code" [--days 365]
// Prints the raw token once. Revoke it in Settings → API access or DELETE /api/tokens?id=…
import "dotenv/config";
import { db } from "../src/lib/db";
import { createApiToken } from "../src/lib/auth/api-tokens";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email");
  const users = email ? await db.user.findMany({ where: { email: email.toLowerCase() } }) : await db.user.findMany({ take: 2 });
  if (users.length !== 1) throw new Error(email ? `No user with email ${email}` : "Pass --email: there is not exactly one user");
  const days = arg("days") ? Number(arg("days")) : null;
  const token = await createApiToken(users[0].id, { name: arg("name") ?? "CLI token", expiresInDays: days });
  console.log(JSON.stringify({ id: token.id, name: token.name, user: users[0].email, expiresAt: token.expiresAt, token: token.token }, null, 2));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
