export const HISTORY_PAGE_SIZE = 20;
export const HISTORY_MAX_LIMIT = 100;

export function nextHistoryLimit(
  currentLimit: number,
  searchActive: boolean,
  pageSize = HISTORY_PAGE_SIZE,
  maxLimit = HISTORY_MAX_LIMIT,
) {
  const current = Number.isFinite(currentLimit) ? Math.max(1, Math.floor(currentLimit)) : pageSize;
  const max = Math.max(1, Math.floor(maxLimit));
  if (searchActive) return max;
  return Math.min(max, current + Math.max(1, Math.floor(pageSize)));
}
