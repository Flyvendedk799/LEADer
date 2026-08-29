# AI credentials

How LEADer decides whose plan pays for a model call, and where each credential
lives. The mechanism is [`@flyvendedk799/ai-auth`](https://github.com/Flyvendedk799/ai-auth);
this document is what it means *here*.

## Three ways to pay

| provider (`aiKeys.provider`) | credential | who is billed |
|---|---|---|
| `openai`, `anthropic` | an API key the user pasted, encrypted in their `aiKeys` blob | the key's owner |
| `claude-subscription` | an OAuth login the user completed in Settings, sealed in `AiCredential` | that user |
| `claude-subscription` (nothing connected) | the `claude` login on the server's machine | whoever runs the server |
| `codex` | the `codex` login on the server's machine | whoever runs the server |

The distinction in the middle two rows is the reason the per-user login exists.
Reading the operator's CLI login is right for a self-hosted box and wrong for a
shared one, where it would put every visitor's calls on one person's plan.

## The pieces

| file | what it does |
|---|---|
| `src/lib/ai/credentials.ts` | the Prisma-backed credential store, the account store, the two machine-login readers |
| `src/lib/ai/claude-login.ts` | the pending PKCE verifier, in memory, for the ten minutes a login takes |
| `src/app/api/claude-code/**` | the four login routes (the library ships these for Fastify; LEADer is Next.js, so they are re-mounted) |
| `src/components/settings/claude-subscription-panel.tsx` | the terminal-shell login in Settings |
| `src/lib/ai/registry.ts` | the model catalogue, client-safe (the library's root entry point imports `node:crypto` and will not build in a browser bundle) |
| `src/lib/ai/provider.ts` | picks a credential and makes the call |

## Things that will bite

**A subscription token must say it is Claude Code.** Every request on a Claude
Code OAuth token has to open with the CLI's identity system block — exact text,
first position, its own block. Without it Anthropic refuses **Opus and Sonnet**
with `429 rate_limit_error` on a plan nowhere near its limit. Haiku is exempt,
which is the trap: it is the model you would naturally test a credential with, so
a request shape that is broken for everything you want looks healthy on the one
you tried. `withClaudeCodeIdentity` in `provider.ts` is doing this; do not
"simplify" it into the system prompt.

**A 429 usually means *this model*, not the plan.** A subscription meters each
model on its own allowance, so the heavy one can be refused for hours while a
light one answers every request. `describeProviderError` reads
`anthropic-ratelimit-unified-status` off the response and says which of the two
it is; the settings picker shows each model's tier so "pick a lighter one" is an
action someone can take.

**The encryption label is half the key.** Stored values are keyed on
`sha256(label + ':' + AI_KEYS_ENCRYPTION_SECRET)`. Changing either does not throw
— stored keys simply stop decrypting, every connection reads as disconnected, and
the only symptom is people being signed out for no stated reason. The labels are
constants in `keys.ts` (`leader-ai-keys`) and in the library (`ai-auth-claude-oauth`).

**Keys written before this library are still readable.** The old format was four
base64url parts keyed on `sha256(secret)` with no label; `decryptApiKey` reads
both and a key is re-sealed in the new format the next time its owner saves
settings. No migration runs against the column.

**A pending login is not persisted.** The PKCE verifier lives in memory, keyed by
user, for ten minutes: worthless after the exchange and dangerous before it. The
consequence is that `POST /api/claude-code/login` and `.../login/complete` must
reach the same instance. LEADer deploys as one; if that changes, this is what
moves to Redis.

**Don't refresh a CLI's token.** Both providers rotate the refresh token on
exchange, so refreshing the machine's login would leave the user's own CLI
holding a credential LEADer had already spent. The Claude reader refreshes only
once a token has genuinely expired and keeps the result in memory; the Codex
reader never refreshes at all — the answer to an expired Codex login is to run
`codex` once.

**Connecting a subscription is a per-user right, not an admin one.** Any signed-in
user can connect and disconnect their own; nobody can read anyone's token back
out, including their own.

## Terms

The OAuth flow uses Claude Code's client id, so the consent screen says *Claude
Code*. Tell your users, and read Anthropic's and OpenAI's subscription terms
before pointing a hosted deployment at consumer plans. The mechanism is sound;
whether a given deployment is entitled to use it is a separate question.
