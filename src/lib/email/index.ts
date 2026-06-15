// Email delivery — provider-agnostic with a real Resend HTTP integration and a
// console fallback. With EMAIL_PROVIDER unset, sends are no-ops (callers still
// record a LOCAL Alert), so the app runs fully offline.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  delivered: boolean;
  provider: string;
  id?: string;
  error?: string;
}

function emailConfig() {
  return {
    provider: (process.env.EMAIL_PROVIDER || "").toLowerCase(),
    apiKey: process.env.EMAIL_API_KEY || "",
    from: process.env.EMAIL_FROM || "LEADer <onboarding@resend.dev>",
  };
}

/** True when a real delivery provider is configured. */
export function emailEnabled(): boolean {
  const { provider, apiKey } = emailConfig();
  if (provider === "console") return true;
  return Boolean(provider && apiKey);
}

async function sendViaResend(msg: EmailMessage): Promise<SendResult> {
  const { apiKey, from } = emailConfig();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!res.ok) {
    return { delivered: false, provider: "resend", error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { delivered: true, provider: "resend", id: data.id };
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const { provider } = emailConfig();
  if (!provider) return { delivered: false, provider: "none" };

  if (provider === "console") {
    // Useful for local dev / CI: prove the pipeline without external calls.
    console.log(`\n📧 [email:console] To: ${msg.to}\n   Subject: ${msg.subject}\n   ${msg.text.replace(/\n/g, "\n   ")}\n`);
    return { delivered: true, provider: "console" };
  }

  if (provider === "resend") {
    try {
      return await sendViaResend(msg);
    } catch (err) {
      return { delivered: false, provider: "resend", error: (err as Error).message };
    }
  }

  return { delivered: false, provider, error: `Unknown email provider: ${provider}` };
}
