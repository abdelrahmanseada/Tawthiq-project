export type KpiDelta =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "absolute"; change: number }
  | { kind: "percent"; change: number };

/**
 * Tiny-number aware KPI change. Percentages are meaningless when the previous
 * window had 0 or fewer than 10 events, so use New or an absolute count there.
 */
export function kpiDelta(current: number, previous: number): KpiDelta {
  if (current === 0 && previous === 0) return { kind: "none" };
  if (previous === 0) return { kind: "new" };
  if (previous < 10) return { kind: "absolute", change: current - previous };
  return { kind: "percent", change: Math.round(((current - previous) / previous) * 100) };
}
