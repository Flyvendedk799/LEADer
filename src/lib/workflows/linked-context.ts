export type WorkflowLinkedTarget = {
  kind: "account" | "deal" | "person";
  label: string;
  href?: string;
  detail?: string;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function workflowResearchLinkedTargets(linked: unknown): WorkflowLinkedTarget[] {
  const record = objectValue(linked);
  if (!record) return [];

  const accountId = stringValue(record.accountId);
  const accountName = stringValue(record.accountName);
  const personName = stringValue(record.personName);
  const dealId = stringValue(record.dealId);
  const dealTitle = stringValue(record.dealTitle);
  const targets: WorkflowLinkedTarget[] = [];

  if (dealId || dealTitle) {
    targets.push({
      kind: "deal",
      label: dealTitle || "Linked deal",
      href: dealId ? `/deals/${dealId}` : undefined,
      detail: accountName || undefined,
    });
  }

  if (accountId || accountName) {
    targets.push({
      kind: "account",
      label: accountName || "Linked account",
      href: accountId ? `/accounts/${accountId}` : undefined,
      detail: dealTitle || undefined,
    });
  }

  if (personName) {
    targets.push({
      kind: "person",
      label: personName,
      href: accountId ? `/accounts/${accountId}` : undefined,
      detail: accountName || dealTitle || undefined,
    });
  }

  return targets;
}
