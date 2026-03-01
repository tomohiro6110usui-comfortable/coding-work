export function yyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** ✅ 今日 - (12週間+3日) */
export function defaultAnalysisDate(): string {
  const now = new Date();
  return yyyyMmDd(addDays(now, -(12 * 7 + 3)));
}