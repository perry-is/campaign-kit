// Backup reader for dates and times in pasted event text. Runs locally (no AI), and only
// fills what the AI missed. Anything it fills is flagged for the user to check.

export type FoundWhen = { date?: string; start?: string; end?: string };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function validDate(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** No year given: this year, or next year if that date has already passed. */
function inferYear(m: number, d: number, today: string) {
  const [ty] = today.split("-").map(Number);
  return iso(ty, m, d) < today ? ty + 1 : ty;
}

export function findDate(text: string, today: string): string | undefined {
  const t = text.toLowerCase();

  // 2026-11-12
  let m = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(t);
  if (m && validDate(+m[1], +m[2], +m[3])) return iso(+m[1], +m[2], +m[3]);

  // Nov 12, November 12th, Nov. 12 2026
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/.exec(t);
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3)) + 1, d = +m[2];
    const y = m[3] ? +m[3] : inferYear(mo, d, today);
    if (validDate(y, mo, d)) return iso(y, mo, d);
  }

  // 12 November
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b(?:,?\s+(20\d{2}))?/.exec(t);
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3)) + 1, d = +m[1];
    const y = m[3] ? +m[3] : inferYear(mo, d, today);
    if (validDate(y, mo, d)) return iso(y, mo, d);
  }

  // 11/12, 11/12/26, 11/12/2026 (US month/day)
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/.exec(t);
  if (m) {
    const mo = +m[1], d = +m[2];
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : inferYear(mo, d, today);
    if (validDate(y, mo, d)) return iso(y, mo, d);
  }

  // "this Thursday", "next Friday", "Thursday": the next one on or after today
  m = /\b(?:(next|this)\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\b/.exec(t);
  if (m) {
    const target = DAYS.indexOf(m[2].slice(0, 3));
    const [y, mo, d] = today.split("-").map(Number);
    const base = new Date(Date.UTC(y, mo - 1, d));
    let add = (target - base.getUTCDay() + 7) % 7;
    if (m[1] === "next" && add === 0) add = 7;
    base.setUTCDate(base.getUTCDate() + add);
    return iso(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
  }
  return undefined;
}

const AP = "(a\\.?m\\.?|p\\.?m\\.?)";
const to24 = (h: number, min: number, ap?: string) => {
  let hh = h % 12;
  if (ap?.startsWith("p")) hh += 12;
  if (!ap) hh = h; // no marker: take as written
  return `${pad(hh)}:${pad(min)}`;
};

export function findTimes(text: string): { start?: string; end?: string } {
  const t = text.toLowerCase().replace(/\bnoon\b/g, "12:00pm").replace(/\bmidnight\b/g, "12:00am");

  // Ranges: 5:30-7:30pm, 5:30 pm – 7:30 pm, 6 to 8 PM, 11-1pm
  const range = new RegExp(`\\b(\\d{1,2})(?::(\\d{2}))?\\s*${AP}?\\s*(?:-|–|—|to|until|till)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*${AP}`).exec(t);
  if (range) {
    const [, h1, m1, ap1, h2, m2, ap2] = range;
    if (+h1 <= 12 && +h2 <= 12) {
      const end = to24(+h2, +(m2 ?? 0), ap2);
      let start = to24(+h1, +(m1 ?? 0), ap1 ?? ap2);
      // "11-1pm": borrowing pm would put the start after the end, so it's am.
      if (!ap1 && start > end) start = to24(+h1, +(m1 ?? 0), "am");
      return { start, end };
    }
  }

  // 24-hour range: 18:00-20:00
  const r24 = /\b([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|–|—|to)\s*([01]?\d|2[0-3]):([0-5]\d)\b/.exec(t);
  if (r24) return { start: `${pad(+r24[1])}:${r24[2]}`, end: `${pad(+r24[3])}:${r24[4]}` };

  // Single time: 6pm, 6:30 p.m.
  const one = new RegExp(`\\b(\\d{1,2})(?::(\\d{2}))?\\s*${AP}`).exec(t);
  if (one && +one[1] <= 12) return { start: to24(+one[1], +(one[2] ?? 0), one[3]) };

  return {};
}

export function parseWhen(text: string, today: string): FoundWhen {
  return { date: findDate(text, today), ...findTimes(text) };
}
