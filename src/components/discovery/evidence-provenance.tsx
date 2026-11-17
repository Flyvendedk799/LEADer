import { z } from "zod";
import { formatDate } from "@/lib/utils";

const metadataSchema = z.object({
  provenance: z
    .object({
      status: z.string(),
      retrievedAt: z.string().optional(),
      reason: z.string().optional(),
    })
    .optional(),
  fieldCitations: z.array(z.object({ field: z.string(), value: z.string().nullable(), status: z.string(), quote: z.string().optional(), url: z.string().optional(), retrievedAt: z.string() })).optional(),
  attachments: z
    .array(z.object({ url: z.string().url(), label: z.string().optional() }))
    .optional(),
});

export function EvidenceProvenance({ metadata }: { metadata?: unknown }) {
  const parsed = metadataSchema.safeParse(metadata);
  const data = parsed.success ? parsed.data : undefined;
  const proof = data?.provenance;
  return (
    <div className="my-2 space-y-1 text-xs leading-5">
      <p className="font-medium">
        {proof?.status === "read" ? "Source read" : "Needs source verification"}
        {proof?.retrievedAt ? ` · ${formatDate(proof.retrievedAt)}` : ""}
      </p>
      <p>
        {proof?.reason ||
          (proof?.status === "read"
            ? "Extracted source facts; confirm scope, budget and eligibility before pursuing."
            : "Only an excerpt is available; the full source has not been verified.")}
      </p>
      {data?.fieldCitations && <details><summary className="cursor-pointer">Fact sources and unknowns</summary><dl className="mt-2 space-y-2">{data.fieldCitations.map(field => <div key={field.field}><dt className="font-medium">{field.field}: {field.value || "Unknown"} · {field.status === "source" ? "source text" : field.status === "snippet" ? "excerpt only" : field.status}</dt>{field.quote && <dd><q>{field.quote}</q>{field.url && /^https?:\/\//i.test(field.url) && <a className="ml-2 underline" href={field.url} target="_blank" rel="noreferrer">Source</a>}</dd>}</div>)}</dl></details>}
      {data?.attachments
        ?.filter((item) => /^https?:\/\//i.test(item.url))
        .slice(0, 10)
        .map((item) => (
          <a
            key={item.url}
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="block text-primary underline underline-offset-4"
          >
            {item.label || "Open source document"}
          </a>
        ))}
    </div>
  );
}
