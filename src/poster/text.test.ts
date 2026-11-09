import { describe, expect, it } from "vitest";
import { blankCampaign } from "../data/model";
import { dateLabel, posterText, requiredLines, timeLabel, zoneAbbrev } from "./text";

describe("poster text", () => {
  it("formats the day without timezone drift", () => {
    expect(dateLabel("2026-12-04T17:30")).toBe("Friday, December 4");
    expect(dateLabel("2026-12-03T23:30")).toBe("Thursday, December 3");
  });

  it("uses the right zone name for summer and winter", () => {
    expect(zoneAbbrev("America/Denver", "2026-12-04T17:30")).toBe("MST");
    expect(zoneAbbrev("America/Denver", "2026-07-04T17:30")).toBe("MDT");
  });

  it("writes compact time ranges", () => {
    expect(timeLabel("2026-12-04T17:30", "2026-12-04T19:30", "America/Denver")).toBe("5:30–7:30 PM MST");
    expect(timeLabel("2026-12-04T11:00", "2026-12-04T13:00", "America/Denver")).toBe("11 AM–1 PM MST");
    expect(timeLabel("2026-12-04T18:00", "", "America/Denver")).toBe("6 PM MST");
    expect(timeLabel("", "", "America/Denver")).toBe("");
  });

  it("builds the exact lines an AI-drawn poster must show", () => {
    const f = {
      ...blankCampaign("b", { venue: "The Lantern Room", address: "Boulder, CO", timezone: "America/Denver", host: "x" }).facts,
      title: "Holiday Mixer",
      start: "2026-12-04T17:30",
      end: "2026-12-04T19:30",
    };
    expect(requiredLines(posterText(f))).toEqual([
      "Holiday Mixer",
      "Friday, December 4 · 5:30–7:30 PM MST",
      "The Lantern Room, Boulder, CO",
      "Free",
    ]);
    expect(posterText({ ...f, delivery: "online" }).venue).toBe("Online");
  });
});
