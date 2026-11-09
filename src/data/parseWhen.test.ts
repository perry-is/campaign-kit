import { describe, expect, it } from "vitest";
import { findDate, findTimes } from "./parseWhen";

const today = "2026-11-05"; // a Thursday

describe("backup date reader", () => {
  it.each([
    ["Community taco night Thursday, Nov 12 at the Lantern Room", "2026-11-12"],
    ["November 12th, 2026", "2026-11-12"],
    ["12 November", "2026-11-12"],
    ["Join us 11/12 for tacos", "2026-11-12"],
    ["11/12/26", "2026-11-12"],
    ["2026-11-12", "2026-11-12"],
    ["Jan 8", "2027-01-08"], // already passed this year -> next year
    ["next Friday", "2026-11-06"],
    ["this Thursday", "2026-11-05"],
  ])("%s", (text, want) => expect(findDate(text, today)).toBe(want));

  it("returns nothing when there's no date", () => {
    expect(findDate("tacos and good company", today)).toBeUndefined();
  });
});

describe("backup time reader", () => {
  it.each([
    ["5:30-7:30pm", { start: "17:30", end: "19:30" }],
    ["5:30 PM – 7:30 PM", { start: "17:30", end: "19:30" }],
    ["6 to 8 PM", { start: "18:00", end: "20:00" }],
    ["11-1pm lunch", { start: "11:00", end: "13:00" }],
    ["9am-2pm", { start: "09:00", end: "14:00" }],
    ["doors at 6pm", { start: "18:00" }],
    ["noon - 1:30 p.m.", { start: "12:00", end: "13:30" }],
    ["18:00-20:00", { start: "18:00", end: "20:00" }],
  ])("%s", (text, want) => expect(findTimes(text)).toEqual(want));

  it("doesn't mistake a date for a time", () => {
    expect(findTimes("Nov 12, 11/12")).toEqual({});
  });
});
