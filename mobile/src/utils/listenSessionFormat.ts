import type { ListeningSessionDTO } from "@/services/api";

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatFullDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Human-readable duration; prefers hours when ≥ 60 min. */
export function formatSessionHoursLine(log: ListeningSessionDTO): string {
  const ms = typeof log.durationMs === "number" && log.durationMs > 0 ? log.durationMs : 0;
  if (ms <= 0) return "Duration —";
  const hours = ms / 3600000;
  const mins = Math.round(ms / 60000);
  if (hours >= 1) return `${hours.toFixed(2)} hr · ${mins} min total`;
  if (mins >= 1) return `${mins} min (${(ms / 1000).toFixed(0)} sec)`;
  return `${(ms / 1000).toFixed(0)} sec`;
}
