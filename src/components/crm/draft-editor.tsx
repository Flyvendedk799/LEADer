"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
export function DraftEditor({ id, content }: { id: string; content: string }) {
  const [text, setText] = useState(content), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const router = useRouter();
  return <div className="mt-4 space-y-3"><Textarea aria-label="Draft content" className="min-h-52" value={text} onChange={e => setText(e.target.value)} /><div className="flex flex-wrap gap-2">
    <Button size="sm" disabled={busy || text === content || !text.trim()} onClick={async () => { setBusy(true); try { const res = await fetch(`/api/conversion-assets/${id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text }) }); if (!res.ok) throw new Error("Could not save version"); setMessage("New version saved; original preserved."); router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); } }}>Save new version</Button>
    <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(text); setMessage("Copied."); } catch { setMessage("Select the text and copy it manually."); } }}>Copy</Button>
    <Button size="sm" variant="outline" onClick={() => { const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "mast3kmedia-draft.md"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download</Button>
  </div><p role="status" className="text-sm">{message}</p></div>;
}
