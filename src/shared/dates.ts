export function toDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLastWorkingDayStamp(now: Date): string {
  const isMonday = now.getDay() === 1;
  const daysBack = isMonday ? 3 : 1;
  return toDateStamp(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack));
}

const DATE_STAMP_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateStamp(stamp: string): boolean {
  if (!DATE_STAMP_PATTERN.test(stamp)) {
    return false;
  }
  // new Date() silently rolls impossible dates over (Feb 30 -> Mar 2), so a
  // round-trip back to a stamp only matches when the date really exists.
  return toDateStamp(dateStampToRange(stamp).from) === stamp;
}

export function dateStampToRange(stamp: string): { from: Date; to: Date } {
  const [year = 0, month = 0, day = 0] = stamp.split('-').map(Number);
  const from = new Date(year, month - 1, day, 0, 0, 0, 0);
  const to = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { from, to };
}
