import type { CapturedAction } from "@/context/EchoContext";

/** Local calendar day key YYYY-MM-DD for grouping on the home calendar. */
export function toDateKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Prefer explicit `when` (ISO or date string from the model) for which day the task belongs on;
 * otherwise fall back to capture time (`createdAt`).
 */
export function calendarDayKeyForAction(action: CapturedAction): string {
  const w = action.when?.trim();
  if (w) {
    let ms = Date.parse(w);
    if (!Number.isNaN(ms)) return toDateKeyFromMs(ms);
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(w);
    if (dateOnly) {
      ms = Date.parse(`${w}T12:00:00`);
      if (!Number.isNaN(ms)) return toDateKeyFromMs(ms);
    }
  }
  return toDateKeyFromMs(action.createdAt);
}

export function isCalendarListedAction(a: CapturedAction): boolean {
  return a.source === "talk" || a.source === "ambient" || a.source == null;
}
