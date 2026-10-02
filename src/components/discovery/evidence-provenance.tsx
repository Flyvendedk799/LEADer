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
