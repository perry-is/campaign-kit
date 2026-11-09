// The exact words a poster shows, built from the confirmed facts. The composer, the AI prompt
// for "AI draws the text" posters, and the fact-check all use this one source.

import type { EventFacts } from "../data/model";

function parseLocal(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  return m ? { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] } : null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function clock(h: number, mi: number) {
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return { text: mi ? `${hh}:${String(mi).padStart(2, "0")}` : `${hh}`, ap };
}

/** Short zone name (e.g. "MST") for that date in that IANA zone; "" if unknown. */
export function zoneAbbrev(timezone: string, local: string): string {
  const p = parseLocal(local);
  if (!p || !timezone) return "";
  try {
    // Noon UTC on that date picks the right standard/daylight name for any US zone.
    const at = new Date(Date.UTC(p.y, p.mo - 1, p.d, 12));
    const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
      .formatToParts(at)
      .find((x) => x.type === "timeZoneName")?.value;
    return part && !/^GMT[+-]/.test(part) ? part : part ?? "";
  } catch {
    return "";
  }
}

/** "Thursday, December 4" */
export function dateLabel(start: string): string {
  const p = parseLocal(start);
  if (!p) return "";
  const dow = DAYS[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()];
  return `${dow}, ${MONTHS[p.mo - 1]} ${p.d}`;
}

/** "5:30–7:30 PM MST", "11 AM–1 PM MST", or "6 PM MST" without an end. */
export function timeLabel(start: string, end: string, timezone: string): string {
  const s = parseLocal(start);
  if (!s) return "";
  const a = clock(s.h, s.mi);
  const e = end ? parseLocal(end) : null;
  const zone = zoneAbbrev(timezone, start);
  let t: string;
  if (e) {
    const b = clock(e.h, e.mi);
    t = a.ap === b.ap ? `${a.text}–${b.text} ${b.ap}` : `${a.text} ${a.ap}–${b.text} ${b.ap}`;
  } else {
    t = `${a.text} ${a.ap}`;
  }
  return zone ? `${t} ${zone}` : t;
}

/** "Friday, November 27", or "Friday, November 27 – Saturday, November 28" for multi-day events. */
function multiDayLabel(start: string, end: string): string {
  const a = dateLabel(start);
  const sd = start.slice(0, 10), ed = end.slice(0, 10);
  return end && ed && sd && ed !== sd ? `${a} – ${dateLabel(end)}` : a;
}

export type PosterText = {
  title: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  price: string;
};

export function posterText(f: EventFacts): PosterText {
  return {
    title: f.title.trim(),
    date: multiDayLabel(f.start, f.end),
    time: timeLabel(f.start, f.end, f.timezone),
    venue: f.delivery === "online" ? "Online" : f.venue.trim(),
    address: f.delivery === "online" ? "" : f.address.trim(),
    price: f.price.trim(),
  };
}

/** The lines an AI-drawn poster must show, in order, nothing else. */
export function requiredLines(t: PosterText): string[] {
  return [t.title, `${t.date} · ${t.time}`, [t.venue, t.address].filter(Boolean).join(", "), t.price].filter((x) => x.trim());
}
