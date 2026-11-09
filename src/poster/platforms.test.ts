import { describe, expect, it } from "vitest";
import { PLATFORMS, missingVersion, orientationOf, pickSource } from "./platforms";

describe("platform sizes", () => {
  it("has the confirmed sizes", () => {
    const by = Object.fromEntries(PLATFORMS.map((p) => [p.id, `${p.w}x${p.h}`]));
    expect(by).toEqual({ eventbrite: "2160x1080", meetup: "1200x675", facebook: "1200x630", linkedin: "1200x627", instagram: "1080x1350" });
  });

  it("classifies shapes", () => {
    expect(orientationOf(2160, 1080)).toBe("wide");
    expect(orientationOf(1080, 1350)).toBe("tall");
    expect(orientationOf(1080, 1080)).toBe("square");
  });

  it("uses the matching version when there is one", () => {
    const p = { src: "TALL", shape: "tall" as const, wideSrc: "WIDE" };
    expect(pickSource(p, 2160, 1080)).toBe("WIDE");
    expect(pickSource(p, 1080, 1350)).toBe("TALL");
    expect(pickSource({ src: "TALL", shape: "tall" }, 2160, 1080)).toBe("TALL"); // falls back
  });

  it("knows which version is still missing", () => {
    expect(missingVersion({ shape: "tall" })).toBe("wide");
    expect(missingVersion({ shape: "tall", wideSrc: "W" })).toBeNull();
    expect(missingVersion({ shape: "wide" })).toBe("tall");
  });
});
