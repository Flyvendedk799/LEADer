"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { UsageLedger } from "./usage-ledger";
type Operations = {
  conversion: Array<{ source: string; candidates: number; accepted: number; won: number; lost: number; contacted: number; proposals: number; meanDaysToWin: number | null }>;
  worker: { ready: boolean; lastHeartbeat?: string }; ai: boolean;
  search: { searchConfigured: boolean; searchProvider: string }; oldestQueuedAt?: string;
  sources: Array<{ id: string; name: string; type: string; discoveryRuns: Array<{ status: string; foundCount: number; log?: string | null }> }>;
  usage: { daily: Array<{ kind: string; _sum: { units: number | null; reservedUsd?: string | number } }>; monthly: Array<{ kind: string; _sum: { units: number | null; reservedUsd?: string | number } }> };
};
export function OperationsPanel() {
  const [state, setState] = useState<Operations | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try { const response = await fetch("/api/operations"); if (!response.ok) throw new Error("Connection checks unavailable"); const data = await response.json(); if (live) { setState(data); setError(""); } } catch (e) { if (live) setError(e instanceof Error ? e.message : "Check failed"); }
    };
    void refresh(); const timer = setInterval(refresh, 30000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  return <section className="space-y-3 rounded border bg-card p-4"><h2 className="font-semibold">Discovery health</h2>{error && <p role="status">{error}</p>}{!state ? <p>Checking connections…</p> : <>
    <div className="flex flex-wrap gap-4 text-sm"><span>Worker: {state.worker.ready ? "online" : "offline — start npm run worker"}</span><span>Search: {state.search.searchConfigured ? state.search.searchProvider : "not connected"}</span><span>AI: {state.ai ? "configured" : "not connected"}</span></div>
    <p className="text-sm text-muted-foreground">Today: {state.usage.daily.map(row => `${row._sum.units ?? 0} ${row.kind.toLowerCase()} requests`).join(" · ") || "No paid requests"}. This month: {state.usage.monthly.map(row => `${row._sum.units ?? 0} ${row.kind.toLowerCase()} requests`).join(" · ") || "none"}.</p>
    <p className="text-sm text-muted-foreground">Reserved estimates: ${state.usage.daily.reduce((sum, row) => sum + Number(row._sum.reservedUsd ?? 0), 0).toFixed(2)} today · ${state.usage.monthly.reduce((sum, row) => sum + Number(row._sum.reservedUsd ?? 0), 0).toFixed(2)} this month. Actual provider invoices may differ.</p>
    {state.oldestQueuedAt && <p className="text-sm">Oldest queued discovery: {new Date(state.oldestQueuedAt).toLocaleString()}</p>}
    {state.sources.length > 0 && <details><summary className="cursor-pointer text-sm">{state.sources.length} enabled sources</summary><ul className="mt-2 space-y-2 text-sm">{state.sources.map(source => <li key={source.id}><strong>{source.name}</strong>: {source.discoveryRuns[0] ? `${source.discoveryRuns[0].status} · ${source.discoveryRuns[0].foundCount} found` : "not scanned yet"}{source.discoveryRuns[0]?.status === "ERROR" && <p className="text-destructive">{source.discoveryRuns[0].log}</p>}</li>)}</ul></details>}
    {state.conversion.length > 0 && <details><summary className="cursor-pointer text-sm">Source outcomes</summary><div className="overflow-x-auto"><table className="mt-2 w-full text-left text-sm"><thead><tr><th>Source</th><th>Found</th><th>Accepted deals</th><th>Contacted</th><th>Proposals</th><th>Won</th><th>Lost</th><th>Avg days to win</th></tr></thead><tbody>{state.conversion.map(row => <tr key={row.source}><td>{row.source}</td><td>{row.candidates}</td><td>{row.accepted}</td><td>{row.contacted}</td><td>{row.proposals}</td><td>{row.won}</td><td>{row.lost}</td><td>{row.meanDaysToWin == null ? "—" : Number(row.meanDaysToWin).toFixed(1)}</td></tr>)}</tbody></table></div></details>}
    <UsageLedger />
    <a className="block text-sm text-primary underline" href="/api/discovery/evaluation" download>Download discovery evaluation examples</a>
    <Link className="text-sm text-primary underline" href="/settings?tab=profile">Company profile and request allowances</Link>
  </>}</section>;
}
