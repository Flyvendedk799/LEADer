import { cn } from "@/lib/utils";
import { scoreBand } from "@/lib/display";

/** Compact circular score chip (0–100) with band coloring. */
export function ScoreBadge({
  score,
  size = "md",
  showLabel = false,
}: {
  score?: number | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  const band = scoreBand(score);
  const dims = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "tnum flex items-center justify-center rounded-full font-semibold",
          dims,
          band.className,
        )}
        role="img"
        aria-label={`Match score: ${score ?? "not scored"}`}
        title={`Match score: ${score ?? "n/a"} (${band.label})`}
      >
        {score ?? "—"}
      </div>
      {showLabel && <span className="text-xs text-muted-foreground">{band.label}</span>}
    </div>
  );
}
