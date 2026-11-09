import { describe, expect, it } from "vitest";
import { hasStart, joinWhen, splitWhen, whenNotice, whenProblem } from "./when";

describe("event date and times", () => {
  it("the end time always uses the event's date", () => {
    const p = splitWhen("2026-11-27T14:00", "");
    expect(joinWhen({ ...p, endTime: "16:00" })).toEqual({ start: "2026-11-27T14:00", end: "2026-11-27T16:00" });
  });

  it("changing the date moves both start and end", () => {
    const p = splitWhen("2026-11-27T14:00", "2026-11-27T16:00");
    expect(joinWhen({ ...p, date: "2026-12-04" })).toEqual({ start: "2026-12-04T14:00", end: "2026-12-04T16:00" });
  });

  it("repairs the old bug: an end on a stray other day snaps back once multi-day is off", () => {
    const p = splitWhen("2026-11-27T14:00", "2026-12-02T23:04");
    expect(p.multiDay).toBe(true);
    expect(joinWhen({ ...p, multiDay: false })).toEqual({ start: "2026-11-27T14:00", end: "2026-11-27T23:04" });
  });

  it("a date without a time yet is kept but not 'ready'", () => {
    const { start } = joinWhen({ date: "2026-11-27", startTime: "", endTime: "", endDate: "", multiDay: false });
    expect(start).toBe("2026-11-27T");
    expect(hasStart(start)).toBe(false);
    expect(splitWhen(start, "").date).toBe("2026-11-27");
  });

  it("flags an end before the start", () => {
    expect(whenProblem(splitWhen("2026-11-27T18:00", "2026-11-27T16:00"))).toMatch(/before the start/);
    expect(whenProblem(splitWhen("2026-11-27T22:00", "2026-11-28T01:00"))).toBeNull();
  });
});


describe("unusual time warnings", () => {
  it("flags odd minutes and very long events, not normal ones", () => {
    expect(whenNotice(splitWhen("2026-11-26T15:32", "2026-11-26T23:35"))).toBe("Unusual times: 3:32 PM to 11:35 PM. Double-check before making posters.");
    expect(whenNotice(splitWhen("2026-11-26T09:00", "2026-11-26T18:00"))).toMatch(/runs 9 hours/);
    expect(whenNotice(splitWhen("2026-11-26T17:30", "2026-11-26T19:30"))).toBeNull();
    expect(whenNotice(splitWhen("2026-11-26T22:00", "2026-11-27T01:00"))).toBeNull();
  });
});
