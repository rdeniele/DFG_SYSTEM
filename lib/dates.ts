/**
 * Date helpers. All business dates are plain `YYYY-MM-DD` strings in Asia/Manila.
 * We never do date math on local Date objects, so the device timezone doesn't matter.
 */
export const TIMEZONE = "Asia/Manila";

/** Today in Manila as YYYY-MM-DD. */
export function todayManila(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ymd + n days. */
export function addDays(ymd: string, days: number): string {
  return fromUtcMs(toUtcMs(ymd) + days * 86_400_000);
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

/** "Nov 30, 2026" */
export function formatDate(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(toUtcMs(ymd.slice(0, 10))));
}

/** Manila calendar date of a timestamp (e.g. created_at). */
export function manilaDateOf(timestamp: string): string {
  return todayManila(new Date(timestamp));
}

/** "2:35 PM" in Manila */
export function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

/** ISO timestamp for 00:00 Manila on a YYYY-MM-DD date (for created_at >= filters). */
export function manilaStartOf(ymd: string): string {
  return new Date(`${ymd}T00:00:00+08:00`).toISOString();
}

/** First day of the Manila month containing ymd, as YYYY-MM-DD. */
export function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/** "1 h 25 min", "45 min" */
export function formatDuration(fromIso: string, toIso: string): string {
  const mins = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}
