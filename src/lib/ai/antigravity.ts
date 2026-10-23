import {
  AntigravityAccountStore,
  antigravityCliOptions,
  toCodeAssistRequest,
  CLOUD_CODE_DAILY_BASE_URL,
  startAntigravityLogin,
  exchangeAntigravityCode,
  AntigravityLoginError,
} from "@flyvendedk799/ai-auth";
import { antigravityAccountStore } from "./credentials";
import {
  rememberAntigravityLogin,
  takeAntigravityLogin,
  forgetAntigravityLogin,
} from "./antigravity-login";

export function antigravityAccounts(): AntigravityAccountStore {
  return antigravityAccountStore();
}

export async function antigravityStatusFor(accountId: string) {
  return await antigravityAccounts().status(accountId);
}

export async function beginAntigravityLogin(accountId: string) {
  const login = await startAntigravityLogin(false);
  rememberAntigravityLogin(accountId, {
    verifier: login.verifier,
    state: login.state,
  });
  return login.url;
}

export function parsePastedAntigravityCode(pasted: string) {
  pasted = pasted.trim();
  if (pasted.includes("code=")) {
    let url: URL;
    try {
      url = new URL(pasted);
    } catch {
      try {
        url = new URL(`http://dummy${pasted.startsWith('?') ? '' : '?'}${pasted}`);
      } catch {
        throw new Error("Invalid pasted token format.");
      }
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) throw new Error("Could not find code in pasted URL.");
    return { code, state };
  }
  // Assume the user pasted the raw token directly
  return { code: pasted, state: null };
}

export async function completeAntigravityLogin(accountId: string, pasted: string) {
  const { code, state } = parsePastedAntigravityCode(pasted);
  const pending = takeAntigravityLogin(accountId);
  
  if (!pending) {
    throw new Error("No pending login found. Please try again.");
  }
  
  if (state && pending.state !== state) {
    throw new Error("State mismatch. Possible CSRF attack.");
  }
  
  const tokens = await exchangeAntigravityCode({
    code,
    verifier: pending.verifier,
    isDogfood: false,
  });
  await antigravityAccounts().save(accountId, tokens);
}

export async function disconnectAntigravity(accountId: string) {
  forgetAntigravityLogin(accountId);
  await antigravityAccounts().forget(accountId);
}

export interface AntigravityModelChoice {
  id: string;
  label: string;
}

/** Ids on the Cloud Code list that are not chat models this app can use. */
const TIERED_FLASH = "gemini-3.8-flash-tiered";
const UNUSABLE_MODEL = /image|embedding|-agent$/;

/** Cloud Code's `models` map, reduced to the Gemini chat models the picker should offer. */
export function parseAvailableModels(data: unknown): AntigravityModelChoice[] {
  const models = (data as { models?: Record<string, { displayName?: string }> } | null)?.models;
  const out: AntigravityModelChoice[] = [];
  for (const [id, info] of Object.entries(models ?? {})) {
    if (!id.startsWith("gemini-") || UNUSABLE_MODEL.test(id)) continue;
    if (id === TIERED_FLASH) {
      // One wire id whose effort is a request setting; ai-auth maps these back onto it.
      for (const level of ["high", "medium", "low"]) {
        out.push({ id: `gemini-3.8-flash-${level}`, label: `Gemini 3.8 Flash (${level[0]!.toUpperCase()}${level.slice(1)})` });
      }
      continue;
    }
    out.push({ id, label: info?.displayName?.trim() || id });
  }
  return out;
}

/**
 * The models THIS login can actually call, from Cloud Code's own list. A model the
 * list lacks 404s every request, so the picker is fed from here, not a constant.
 * Empty when no subscription is connected.
 */
export async function listAntigravityModels(
  accountId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AntigravityModelChoice[]> {
  const store = antigravityAccounts();
  const status = await store.status(accountId).catch(() => null);
  if (!status?.connected) return [];
  const accessToken = await store.token(accountId);
  const cli = antigravityCliOptions(
    { accessToken, refreshToken: "", expiresAt: 0, email: null, projectId: status.projectId || null, isDogfood: true } as never,
    CLOUD_CODE_DAILY_BASE_URL,
  );
  const res = await fetchImpl(`${cli.baseURL}:fetchAvailableModels`, {
    method: "POST",
    headers: cli.defaultHeaders as Record<string, string>,
    body: "{}",
  });
  if (!res.ok) throw new Error(`fetchAvailableModels ${res.status}`);
  return parseAvailableModels(await res.json());
}

export interface GroundedWebResult {
  title: string;
  url: string;
  snippet?: string;
}

type GroundingChunk = { web?: { uri?: string; title?: string } };
type GroundingSupport = { segment?: { text?: string }; groundingChunkIndices?: number[] };

const GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

/** Grounding links are Google redirects; follow one hop so we store the real page. */
async function resolveGroundingUrl(uri: string, fetchImpl: typeof fetch): Promise<string> {
  try {
    if (new URL(uri).hostname !== GROUNDING_REDIRECT_HOST) return uri;
    const res = await fetchImpl(uri, {
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
    });
    const location = res.headers.get("location");
    return location && /^https?:\/\//i.test(location) ? location : uri;
  } catch {
    return uri;
  }
}

/** Strip markdown and the "Organisation / Page:" style labels the model likes to add. */
export function cleanGroundedText(text: string): string {
  let out = text.replace(/[*_`#]+/g, "").replace(/\s+/g, " ").trim();
  const label =
    /^(?:organi[sz]ation(?:\s*\/\s*(?:page|platform))?|listing(?:\s*\/\s*page)?|platform|page|result|what they (?:need|offer)(?:\s*\/\s*(?:need|offer))?|they (?:need|offer)|hvad de (?:søger|tilbyder)(?:\s*\/\s*(?:søger|tilbyder))?)\s*:\s*/i;
  while (label.test(out)) out = out.replace(label, "");
  out = out.replace(/(?<![\p{L}])(?:hvad de (?:søger|tilbyder)(?:\s*\/\s*(?:søger|tilbyder))?|what they (?:need|offer))\s*:\s*/giu, "").trim();
  return /^(?:the\s+)?(?:web\s+)?search\s+(?:returns|results|found)/i.test(out) ? "" : out;
}

/** Turn a grounded Gemini reply into one result per cited web page. */
export function parseGroundedResults(
  body: unknown,
  limit: number,
): { title: string; uri: string; snippet?: string }[] {
  const root = body as {
    response?: { candidates?: unknown[] };
    candidates?: unknown[];
  } | null;
  const candidate = (root?.response?.candidates ?? root?.candidates)?.[0] as
    | {
        content?: { parts?: { text?: string }[] };
        groundingMetadata?: {
          groundingChunks?: GroundingChunk[];
          groundingSupports?: GroundingSupport[];
        };
      }
    | undefined;
  const meta = candidate?.groundingMetadata;
  const answer = candidate?.content?.parts?.map((part) => part.text || "").join("") ?? "";
  const out: { title: string; uri: string; snippet?: string }[] = [];
  const seen = new Set<string>();
  (meta?.groundingChunks ?? []).forEach((chunk, index) => {
    const uri = chunk.web?.uri;
    if (!uri || seen.has(uri)) return;
    seen.add(uri);
    const supported = [
      ...new Set(
        (meta?.groundingSupports ?? [])
          .filter((support) => support.groundingChunkIndices?.includes(index))
          .map((support) => cleanGroundedText(support.segment?.text ?? ""))
          .filter((text): text is string => Boolean(text)),
      ),
    ]
      .join(" ")
      .slice(0, 500);
    const domain = chunk.web?.title?.trim() || new URL(uri).hostname;
    const looksLikeDomain = !/\s/.test(domain);
    const title =
      looksLikeDomain && supported
        ? `${domain} — ${supported.slice(0, 90)}${supported.length > 90 ? "…" : ""}`
        : domain;
    out.push({ title, uri, snippet: supported || answer.slice(0, 300) || undefined });
  });
  return out.slice(0, limit);
}

/**
 * Open-web search through the user's own Antigravity login: Gemini's Google Search
 * grounding on Cloud Code. No separate search key, billed to their plan.
 */
export async function groundedWebSearch(
  accountId: string,
  query: string,
  limit: number,
  model: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GroundedWebResult[]> {
  const store = antigravityAccounts();
  const status = await store.status(accountId).catch(() => null);
  if (!status?.connected) throw new Error("No Antigravity subscription connected");
  const accessToken = await store.token(accountId);
  const cli = antigravityCliOptions(
    { accessToken, refreshToken: "", expiresAt: 0, email: null, projectId: status.projectId || null, isDogfood: true } as never,
    CLOUD_CODE_DAILY_BASE_URL,
  );
  const prompt = `Search the web and report concrete, current results for this query. For each distinct result give the organisation or page and, in one or two sentences, what they need or offer. When the query is about finding clients or projects, prefer organisations and postings that are looking to buy or hire over advisers and competitors. Query: ${query}`;
  const payload = toCodeAssistRequest(model, [{ role: "user", parts: [{ text: prompt }] }], {
    projectId: status.projectId || undefined,
  });
  (payload.request as Record<string, unknown>).tools = [{ googleSearch: {} }];

  const res = await fetchImpl(`${cli.baseURL}:generateContent`, {
    method: "POST",
    headers: cli.defaultHeaders as Record<string, string>,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Google search via Antigravity failed (${res.status}) ${detail}`.trim());
  }
  const parsed = parseGroundedResults(await res.json(), limit);
  if (parsed.length === 0) throw new Error("Google search returned no cited pages for this query");
  return Promise.all(
    parsed.map(async (item) => ({
      title: item.title,
      snippet: item.snippet,
      url: await resolveGroundingUrl(item.uri, fetchImpl),
    })),
  );
}
