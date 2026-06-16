import { z } from "zod";

// Validated, typed environment access. Non-fatal by design: missing optional
// vars fall back to sensible defaults so local dev "just works", but DATABASE_URL
// is required and we surface a clear message if it's absent.

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (see .env.example)"),
  DEV_USER_EMAIL: z.string().default("owner@leader.local"),
  // AI (optional — empty key => offline mock mode)
  LLM_API_KEY: z.string().default(""),
  LLM_BASE_URL: z.string().default("https://api.openai.com/v1"),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  LLM_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  // Crawler
  CRAWLER_USER_AGENT: z.string().default("LEADerBot/0.1 (+respects robots.txt)"),
  CRAWLER_RATE_LIMIT_MS: z.coerce.number().default(2000),
  CRAWLER_MAX_PAGES_PER_RUN: z.coerce.number().default(25),
  CRAWLER_TIMEOUT_MS: z.coerce.number().default(15000),
  CRAWLER_ENABLE_PLAYWRIGHT: z.string().default("false"),
  // Ops
  CRON_SECRET: z.string().default(""),
  // Email delivery (digests + deadline reminders). Empty => log-only (LOCAL alerts).
  EMAIL_PROVIDER: z.enum(["", "resend", "console"]).default(""),
  EMAIL_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("LEADer <onboarding@resend.dev>"),
  APP_URL: z.string().default("http://localhost:3000"),
  // Deadline reminder horizon (days).
  REMINDER_WINDOW_DAYS: z.coerce.number().default(7),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Parse + cache env. Throws a readable error only when a REQUIRED var is missing. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function hasLlmKey(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}
