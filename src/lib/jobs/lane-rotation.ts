// Order scheduled discovery so the lanes that have gone longest without a
// successful run are claimed first. Before this, every daily mission was queued
// at once in a fixed order, so when the search allowance ran out it was always
// the same lanes that never ran.

export interface RotationLane {
  id: string;
}

/**
 * Queue priorities for the day's missions: least recently served first. All are
 * negative so a manual run (priority 0) still goes ahead of scheduled work.
 */
export function laneRotationPriorities<T extends RotationLane>(
  lanes: T[],
  lastSuccessByLane: Map<string, Date>,
): Map<string, number> {
  const ordered = [...lanes].sort((a, b) => {
    const at = lastSuccessByLane.get(a.id)?.getTime() ?? 0;
    const bt = lastSuccessByLane.get(b.id)?.getTime() ?? 0;
    return at - bt || a.id.localeCompare(b.id);
  });
  return new Map(ordered.map((lane, index) => [lane.id, -(index + 1)]));
}
