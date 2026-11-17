"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function RecordOutreach({ dealId }: { dealId: string }) {
  const [summary, setSummary] = useState("");
  const [days, setDays] = useState(3);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const router = useRouter();
  async function record(kind: "CONTACTED" | "PROPOSAL") {
    const key = requestId ?? crypto.randomUUID(); setRequestId(key); setBusy(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/contacted`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, summary, followUpDays: days, requestId: key }) });
      if (!res.ok) throw new Error("Could not record outreach. Your message has not been sent by LEADer.");
      setMessage("Recorded with a follow-up task."); setSummary(""); setRequestId(null); router.refresh(); window.dispatchEvent(new Event("leader:counts-refresh"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save"); } finally { setBusy(false); }
  }
  return <div className="space-y-3 rounded border p-4"><h3 className="font-semibold">Record external outreach</h3><p className="text-sm text-muted-foreground">After sending externally, record what you sent and schedule the next step.</p><Label htmlFor="outreach-summary">Message or proposal summary</Label><Input id="outreach-summary" value={summary} onChange={e => setSummary(e.target.value)} /><Label htmlFor="outreach-days">Follow up in days</Label><Input id="outreach-days" type="number" min={1} max={90} value={days} onChange={e => setDays(Number(e.target.value))} /><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || !summary.trim()} onClick={() => record("CONTACTED")}>Mark contacted</Button><Button size="sm" variant="outline" disabled={busy || !summary.trim()} onClick={() => record("PROPOSAL")}>Mark proposal submitted</Button></div><p role="status" className="text-sm">{message}</p></div>;
}
