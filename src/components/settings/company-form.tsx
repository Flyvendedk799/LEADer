"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { companyProfile, type CompanyProfile } from "@/lib/company-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const fields = { name: "Company name", services: "Services and technical capabilities", customers: "Ideal customers and markets", capacity: "Team capacity and availability", portfolio: "Portfolio and references (only verified claims)", commercialPreferences: "Project sizes, rates and engagement preferences" } as const;
const costs = { dailyBudgetUsd: "Daily reserved-spend budget (USD)", monthlyBudgetUsd: "Monthly reserved-spend budget (USD)", searchQueryReserveUsd: "Reserve per search query (USD)", aiCallReserveUsd: "Reserve per AI call (USD)" } as const;
const limits = { dailySearchQueries: "Search queries per day", monthlySearchQueries: "Search queries per month", dailyAiCalls: "AI calls per day", monthlyAiCalls: "AI calls per month" } as const;
export function CompanyForm({ value }: { value: unknown }) {
  const [profile, setProfile] = useState<CompanyProfile>(() => companyProfile(value));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return <Card><CardHeader><CardTitle>Company and discovery allowances</CardTitle></CardHeader><CardContent>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setMessage("");
      try {
        const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyProfile: profile }) });
        if (!response.ok) throw new Error("Could not save company settings");
        setMessage("Company settings saved."); router.refresh();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save"); } finally { setBusy(false); }
    }}>
      {Object.entries(fields).map(([key, label]) => <div key={key} className="space-y-1"><Label htmlFor={`company-${key}`}>{label}</Label><Textarea id={`company-${key}`} value={profile[key as keyof typeof fields]} onChange={e => setProfile({ ...profile, [key]: e.target.value })} /></div>)}
      <div className="space-y-1">
        <Label htmlFor="max-contract-value">Largest contract worth bidding on (DKK)</Label>
        <Input id="max-contract-value" type="number" min={0} step={100000} value={profile.maxContractValueDkk} onChange={e => setProfile({ ...profile, maxContractValueDkk: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        <p className="text-sm text-muted-foreground">Leads with a stated value above this are ranked down (far above it: strongly). 0 = no limit. Saving re-ranks the review queue.</p>
      </div>
      <div><Label htmlFor="draft-language">Draft language</Label><select id="draft-language" className="ml-3 rounded border bg-background p-2" value={profile.draftLanguage} onChange={e => setProfile({ ...profile, draftLanguage: e.target.value as "Danish" | "English" })}><option>Danish</option><option>English</option></select></div>
      <p className="text-sm text-muted-foreground">Paid discovery is paused until both daily and monthly allowances are set. Zero disables that service. Request limits and reserved-spend budgets both apply. Reservations are conservative estimates, not reconciled provider invoices. Adjust per-call reserves for your chosen provider/model; provider pricing varies. Failed requests count because providers may charge for them. Periods reset in UTC.</p>
      <div className="grid gap-3 sm:grid-cols-2">{Object.entries(limits).map(([key, label]) => <div key={key}><Label htmlFor={key}>{label}</Label><Input id={key} type="number" min={0} max={key.startsWith("daily") ? 10000 : 100000} value={profile[key as keyof typeof limits]} onChange={e => setProfile({ ...profile, [key]: Number(e.target.value) })} /></div>)}</div>
      <div className="grid gap-3 sm:grid-cols-2">{Object.entries(costs).map(([key, label]) => <div key={key}><Label htmlFor={key}>{label}</Label><Input id={key} type="number" min={key.includes("Reserve") ? 0.001 : 0} step="0.001" value={profile[key as keyof typeof costs]} onChange={e => setProfile({ ...profile, [key]: Number(e.target.value) })} /></div>)}</div>
      <label className="flex gap-2"><input type="checkbox" checked={profile.scheduledDiscovery} onChange={e => setProfile({ ...profile, scheduledDiscovery: e.target.checked })} />Enable scheduled source scans and daily discovery</label>
      <label className="flex gap-2"><input type="checkbox" checked={profile.internationalDiscovery} onChange={e => setProfile({ ...profile, internationalDiscovery: e.target.checked })} />Include a separate international remote stream</label>
      <Label htmlFor="discovery-hour">Daily discovery hour (Europe/Copenhagen)</Label><Input id="discovery-hour" type="number" min={0} max={23} value={profile.discoveryHour} onChange={e => setProfile({ ...profile, discoveryHour: Number(e.target.value) })} />
      <Button disabled={busy}>{busy ? "Saving…" : "Save company settings"}</Button><p role="status">{message}</p>
    </form>
  </CardContent></Card>;
}
