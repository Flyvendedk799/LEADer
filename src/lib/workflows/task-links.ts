export type WorkflowTaskLinkTarget = {
  dealId?: string | null;
  accountId?: string | null;
};

export function workflowTaskHref(task: WorkflowTaskLinkTarget) {
  if (task.dealId) return `/deals/${task.dealId}`;
  if (task.accountId) return `/accounts/${task.accountId}`;
  return "/workflows";
}
