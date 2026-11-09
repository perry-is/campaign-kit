// One date + start/end times. Stored as local "YYYY-MM-DDTHH:mm" strings (start may be
// "YYYY-MM-DDT" while the time isn't chosen yet). The end uses the event's date unless the
// event really ends on another day.

export type WhenParts = { date: string; startTime: string; endTime: string; endDate: string; multiDay: boolean };

const DATE = /^(\d{4}-\d{2}-\d{2})/;
const TIME = /T(\d{2}:\d{2})/;

export function splitWhen(start: string, end: string): WhenParts {
  const sDate = DATE.exec(start)?.[1] ?? "";
  const eDate = DATE.exec(end)?.[1] ?? "";
  const date = sDate || eDate;
  return {
    date,
    startTime: TIME.exec(start)?.[1] ?? "",
    endTime: TIME.exec(end)?.[1] ?? "",
    endDate: eDate || date,
    multiDay: !!(eDate && date && eDate !== date),
  };
}

export function joinWhen(p: WhenParts): { start: string; end: string } {
  if (!p.date) return { start: "", end: "" };
  const endDay = p.multiDay && p.endDate ? p.endDate : p.date;
  return {
    start: `${p.date}T${p.startTime}`,
    end: p.endTime ? `${endDay}T${p.endTime}` : "",
  };
}

/** True when the event has a date and a start time. */
export const hasStart = (start: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(start);

/** Problem with the times, in plain English, or null. */
export function whenProblem(p: WhenParts): string | null {
  if (!p.date || !p.startTime || !p.endTime) return null;
  const { start, end } = joinWhen(p);
  return end <= start ? "The end time is before the start time. Does it end the next day?" : null;
}

/** Short label for lists, e.g. "Nov 27". */
export function shortDate(start: string): string {
  const d = DATE.exec(start)?.[1];
  if (!d) return "No date";
  return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmt(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** Soft warning for times that are possible but probably a slip (odd minutes, very long events). */
export function whenNotice(p: WhenParts): string | null {
  if (!p.date || !p.startTime) return null;
  const odd = (t: string) => !!t && Number(t.slice(3, 5)) % 5 !== 0;
  const { start, end } = joinWhen(p);
  const hours = end ? (new Date(`${end}:00`).getTime() - new Date(`${start}:00`).getTime()) / 3_600_000 : 0;
  const range = p.endTime ? `${fmt(p.startTime)} to ${fmt(p.endTime)}` : fmt(p.startTime);
  if (odd(p.startTime) || odd(p.endTime)) return `Unusual times: ${range}. Double-check before making posters.`;
  if (hours > 6) return `This runs ${Math.round(hours)} hours (${range}). Is that right?`;
  return null;
}
