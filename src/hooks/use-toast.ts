"use client";
// Minimal toast store (shadcn-style) — framework-agnostic, no external dep.
import * as React from "react";

export type ToastVariant = "default" | "success" | "destructive";

export interface ToastData {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type Listener = (toasts: ToastData[]) => void;

let toasts: ToastData[] = [];
const listeners = new Set<Listener>();
let counter = 0;

function emit() {
  for (const l of listeners) l(toasts);
}

export function toast(input: Omit<ToastData, "id">) {
  const id = `t${++counter}`;
  const data: ToastData = { duration: 4000, variant: "default", ...input, id };
  toasts = [...toasts, data];
  emit();
  if (data.duration && data.duration > 0) {
    setTimeout(() => dismiss(id), data.duration);
  }
  return id;
}

export function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Convenience helpers. */
toast.success = (title: string, description?: string) => toast({ title, description, variant: "success" });
toast.error = (title: string, description?: string) => toast({ title, description, variant: "destructive" });

export function useToasts(): ToastData[] {
  const [state, setState] = React.useState<ToastData[]>(toasts);
  React.useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
