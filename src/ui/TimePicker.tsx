// Time picker: hour, minute in 5-minute steps, AM/PM. Starts on :00, so odd minutes like
// 1:48 can't sneak in. Value is 24-hour "HH:mm" or "" (not set).

const pad = (n: number) => String(n).padStart(2, "0");
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

export function splitTime(v: string): { h: string; m: string; ap: "AM" | "PM" } | null {
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h24 = +m[1];
  return { h: String(h24 % 12 || 12), m: m[2], ap: h24 >= 12 ? "PM" : "AM" };
}

export function joinTime(h: string, m: string, ap: "AM" | "PM"): string {
  if (!h) return "";
  let h24 = +h % 12;
  if (ap === "PM") h24 += 12;
  return `${pad(h24)}:${m || "00"}`;
}

/** Sensible AM/PM for a freshly picked hour: mornings 6–11, otherwise afternoon/evening. */
export const guessAmPm = (h: number): "AM" | "PM" => (h >= 6 && h <= 11 ? "AM" : "PM");

export function TimePicker(props: { value: string; onChange: (v: string) => void; className?: string; label: string }) {
  const cur = splitTime(props.value);
  // Keep an existing odd minute visible (so it isn't silently changed) until the user picks another.
  const minutes = cur && !MINUTES.includes(cur.m) ? [...MINUTES, cur.m].sort() : MINUTES;

  return (
    <div className={`time-picker ${props.className ?? ""}`} role="group" aria-label={props.label}>
      <select
        aria-label={`${props.label} hour`}
        value={cur?.h ?? ""}
        onChange={(e) => {
          const h = e.target.value;
          props.onChange(h ? joinTime(h, cur?.m ?? "00", cur?.ap ?? guessAmPm(+h)) : "");
        }}
      >
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="colon">:</span>
      <select aria-label={`${props.label} minutes`} value={cur?.m ?? "00"} disabled={!cur} onChange={(e) => cur && props.onChange(joinTime(cur.h, e.target.value, cur.ap))}>
        {minutes.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select aria-label={`${props.label} AM or PM`} value={cur?.ap ?? "PM"} disabled={!cur} onChange={(e) => cur && props.onChange(joinTime(cur.h, cur.m, e.target.value as "AM" | "PM"))}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
      {cur && (
        <button type="button" className="time-clear" onClick={() => props.onChange("")} aria-label={`Clear ${props.label}`}>✕</button>
      )}
    </div>
  );
}
