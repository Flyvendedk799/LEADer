import { Loader2 } from "lucide-react";
export default function Loading() {
  return (
    <div
      role="status"
      className="flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground"
    >
      <Loader2 className="h-5 w-5 animate-spin" />
      Loading workspace…
    </div>
  );
}
