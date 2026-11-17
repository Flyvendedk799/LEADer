"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/discovery/tabular-import";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
const fields = ["title", "organization", "url", "description"] as const;
type Row = Partial<Record<typeof fields[number], string>>;
export function FileImport() {
  const [content, setContent] = useState("");
  const [csv, setCsv] = useState(false);
  const [workspace, setWorkspace] = useState("DK");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  function preview() {
    try {
      setMessage("");
      if (content.length > 1_000_000) throw new Error("Use a file smaller than 1 MB");
      if (csv) {
        const [head = [], ...data] = parseCsv(content); setHeaders(head);
        const map = Object.fromEntries(fields.map(f => [f, mapping[f] ?? head.findIndex(h => h.trim().toLowerCase() === f)]));
        setMapping(map);
        setRows(data.map(cells => Object.fromEntries(fields.map(f => [f, cells[map[f]] ?? ""]))));
      } else {
        setHeaders([]);
        setRows(content.split(/\n\s*\n/).filter(s => s.trim()).slice(0, 200).map(block => ({ title: block.split("\n")[0].trim().slice(0, 250), description: block, url: block.match(/https?:\/\/[^\s]+/)?.[0] ?? "" })));
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not preview"); }
  }
  return <section className="my-6 space-y-4 rounded border bg-card p-5"><h2 className="text-lg font-semibold">Import a lead list</h2><p className="text-sm text-muted-foreground">Upload CSV or text, or paste one lead per paragraph. Preview before adding to review. No linked pages are fetched.</p>
    <Label htmlFor="lead-file">CSV or text file (up to 1 MB)</Label><input id="lead-file" type="file" accept=".csv,.txt,.md" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 1_000_000) { setMessage("Use a file smaller than 1 MB"); return; } setContent(await file.text()); setCsv(file.name.endsWith(".csv")); setRows([]); setMapping({}); }} />
    <Label htmlFor="lead-content">Lead content</Label><Textarea id="lead-content" value={content} onChange={e => { setContent(e.target.value); setRows([]); }} />
    <label className="flex gap-2"><input type="checkbox" checked={csv} onChange={e => { setCsv(e.target.checked); setRows([]); }} />CSV with header row</label>
    <Label htmlFor="import-workspace">Market</Label><select id="import-workspace" className="rounded border bg-background p-2" value={workspace} onChange={e => setWorkspace(e.target.value)}><option value="DK">Denmark</option><option value="GLOBAL">International</option></select>
    {headers.length > 0 && <div className="flex flex-wrap gap-3">{fields.map(field => <label key={field}>{field}<select className="ml-2 rounded border bg-background p-1" value={mapping[field] ?? -1} onChange={e => { setMapping({ ...mapping, [field]: Number(e.target.value) }); setRows([]); }}><option value={-1}>Not mapped</option>{headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</select></label>)}</div>}
    <Button variant="outline" onClick={preview} disabled={!content.trim()}>Preview import</Button>
    {rows.length > 0 && <><div className="max-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Title</th><th>Company</th><th>Source</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-t"><td>{r.title || "Missing title — map a title column"}</td><td>{r.organization}</td><td className="max-w-64 truncate">{r.url}</td></tr>)}</tbody></table></div><Button disabled={busy || rows.some(r => !r.title || r.title.length < 2)} onClick={async () => { setBusy(true); try { const res = await fetch("/api/import/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, rows }) }); if (!res.ok) throw new Error("Import failed. Check titles and HTTP(S) source URLs; retrying will deduplicate accepted rows."); const data = await res.json(); setMessage(`${data.count} leads added or matched in review.`); setRows([]); router.refresh(); window.dispatchEvent(new Event("leader:counts-refresh")); } catch (error) { setMessage(error instanceof Error ? error.message : "Import failed"); } finally { setBusy(false); } }}>Add {rows.length} rows to review</Button></>}
    <p role="status">{message}</p>
  </section>;
}
