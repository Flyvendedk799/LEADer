"use client";
import { CheckCircle2, X, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { dismiss, useToasts, type ToastVariant } from "@/hooks/use-toast";

const ICON: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  destructive: AlertTriangle,
};
const STYLE: Record<ToastVariant, string> = {
  default: "border-border",
  success: "border-success/40",
  destructive: "border-destructive/50",
};
const ICON_COLOR: Record<ToastVariant, string> = {
  default: "text-muted-foreground",
  success: "text-success",
  destructive: "text-destructive",
};

/** Renders the active toasts. Mounted once in the root layout. */
export function Toaster() {
  const toasts = useToasts();
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const variant = t.variant ?? "default";
        const Icon = ICON[variant];
        return (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border bg-card p-3 shadow-lg animate-in slide-in-from-bottom-2",
              STYLE[variant],
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_COLOR[variant])} />
            <div className="min-w-0 flex-1">
              {t.title && <div className="text-sm font-medium">{t.title}</div>}
              {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
