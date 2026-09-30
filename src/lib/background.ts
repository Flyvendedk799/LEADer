/**
 * Keep background work alive after a serverless response returns.
 * Outside a Vercel request, `waitUntil` throws and the promise just keeps running.
 */
export function keepAlive(work: Promise<unknown>) {
  const pending = work.catch(() => undefined);
  if (!process.env.VERCEL) return;
  void import("@vercel/functions")
    .then((mod) => {
      try {
        mod.waitUntil(pending);
      } catch {
        // Not inside a request; the promise is already scheduled.
      }
    })
    .catch(() => undefined);
}
