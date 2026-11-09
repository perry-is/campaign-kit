import { describe, expect, it } from "vitest";
import { guessAmPm, joinTime, splitTime } from "./TimePicker";

describe("time picker", () => {
  it("round-trips 24-hour times through hour/minute/AM-PM", () => {
    expect(splitTime("17:30")).toEqual({ h: "5", m: "30", ap: "PM" });
    expect(splitTime("00:05")).toEqual({ h: "12", m: "05", ap: "AM" });
    expect(splitTime("12:00")).toEqual({ h: "12", m: "00", ap: "PM" });
    expect(joinTime("5", "30", "PM")).toBe("17:30");
    expect(joinTime("12", "00", "AM")).toBe("00:00");
    expect(joinTime("12", "", "PM")).toBe("12:00"); // minutes start at :00
    expect(joinTime("", "00", "PM")).toBe("");
  });

  it("guesses morning for 6-11 and afternoon/evening otherwise", () => {
    expect(guessAmPm(9)).toBe("AM");
    expect(guessAmPm(5)).toBe("PM");
    expect(guessAmPm(12)).toBe("PM");
  });
});
