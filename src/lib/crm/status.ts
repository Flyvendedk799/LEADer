import type { DealStatus, OpportunityStatus } from "@/lib/types";

export const DEAL_STATUS_META: Record<
  DealStatus,
  { label: string; dot: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "muted" }
> = {
  DISCOVERED: { label: "Discovered", dot: "bg-primary", variant: "default" },
  QUALIFYING: { label: "Qualifying", dot: "bg-accent", variant: "secondary" },
  INTERESTING: { label: "Interesting", dot: "bg-warning", variant: "warning" },
  CONTACTED: { label: "Contacted", dot: "bg-sky-400", variant: "secondary" },
  PROPOSAL: { label: "Proposal", dot: "bg-violet-400", variant: "secondary" },
  NEGOTIATION: { label: "Negotiation", dot: "bg-indigo-400", variant: "secondary" },
  WON: { label: "Won", dot: "bg-success", variant: "success" },
  LOST: { label: "Lost", dot: "bg-destructive", variant: "destructive" },
  ARCHIVED: { label: "Archived", dot: "bg-muted-foreground", variant: "muted" },
};

export function dealStatusFromOpportunity(status: OpportunityStatus): DealStatus {
  switch (status) {
    case "NEW":
      return "DISCOVERED";
    case "INTERESTING":
    case "WATCH":
      return "INTERESTING";
    case "CONTACTED":
      return "CONTACTED";
    case "APPLIED":
      return "PROPOSAL";
    case "WON":
      return "WON";
    case "LOST":
      return "LOST";
    case "ARCHIVED":
      return "ARCHIVED";
  }
}
