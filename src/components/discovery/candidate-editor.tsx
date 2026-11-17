"use client";
import { copenhagenDateInput, parseCopenhagenInput } from "@/lib/dates";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
type Lead = { id: string; title: string; organization?: string | null; url?: string | null; budgetMin?: number | null; budgetMax?: number | null; deadline?: Date | string | null; currency?: string | null };
export function CandidateEditor({ lead }: { lead: Lead }) {
  const [title, setTitle] = useState(lead.title), [organization, setOrganization] = useState(lead.organization ?? ""), [url, setUrl] = useState(lead.url ?? "");
  const [min, setMin] = useState(lead.budgetMin?.toString() ?? ""), [max, setMax] = useState(lead.budgetMax?.toString() ?? "");
  const [deadline, setDeadline] = useState(lead.deadline ? copenhagenDateInput(new Date(lead.deadline)) : ""), [currency, setCurrency] = useState(lead.currency || "DKK");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""); const router = useRouter();
  return <details className="mt-3 rounded border p-3"><summary className="cursor-pointer text-sm">Correct extracted facts</summary><form className="mt-3 space-y-2" onSubmit={async e => { e.preventDefault(); setBusy(true); try { const res = await fetch(`/api/discovery/candidates/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "edit", changes: { title, organization, url, deadline: deadline ? parseCopenhagenInput(deadline).toISOString() : null, currency, budgetMin: min ? Number(min) : null, budgetMax: max ? Number(max) : null } }) }); if (!res.ok) throw new Error("Could not save. Check the URL and budget range."); setMessage("Corrections saved; original evidence preserved."); router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); } }}>
    <Label htmlFor={`title-${lead.id}`}>Title</Label><Input id={`title-${lead.id}`} value={title} onChange={e => setTitle(e.target.value)} required minLength={2} />
    <Label htmlFor={`buyer-${lead.id}`}>Buyer</Label><Input id={`buyer-${lead.id}`} value={organization} onChange={e => setOrganization(e.target.value)} />
    <Label htmlFor={`url-${lead.id}`}>Source URL</Label><Input id={`url-${lead.id}`} type="url" value={url} onChange={e => setUrl(e.target.value)} />
    <div className="grid grid-cols-2 gap-2"><div><Label htmlFor={`min-${lead.id}`}>Minimum amount</Label><Input id={`min-${lead.id}`} type="number" min={0} value={min} onChange={e => setMin(e.target.value)} /></div><div><Label htmlFor={`max-${lead.id}`}>Maximum amount</Label><Input id={`max-${lead.id}`} type="number" min={0} value={max} onChange={e => setMax(e.target.value)} /></div></div>
    <Label htmlFor={`deadline-${lead.id}`}>Deadline (Copenhagen)</Label><Input id={`deadline-${lead.id}`} type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
    <Label htmlFor={`currency-${lead.id}`}>Currency</Label><Input id={`currency-${lead.id}`} value={currency} maxLength={3} pattern="[A-Z]{3}" onChange={e => setCurrency(e.target.value.toUpperCase())} />
    <Button size="sm" disabled={busy}>Save corrections</Button><p role="status" className="text-sm">{message}</p>
  </form></details>;
}
