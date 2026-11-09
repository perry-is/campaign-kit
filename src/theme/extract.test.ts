import { describe, expect, it } from "vitest";
import { contrast, hexToHsl, hexToRgb } from "./color";
import { clusterColors, paletteFromSwatches } from "./extract";

describe("paletteFromSwatches", () => {
  it("turns a navy/blue/orange logo into a navy theme with a blue→orange gradient", () => {
    const p = paletteFromSwatches([
      { hex: "#031140", share: 0.62 },
      { hex: "#0248c1", share: 0.12 },
      { hex: "#1380ff", share: 0.08 },
      { hex: "#fa6429", share: 0.07 },
      { hex: "#cfd3df", share: 0.06 },
      { hex: "#ffd87f", share: 0.02 },
    ]);
    expect(hexToHsl(p.background).l).toBeLessThan(0.15);
    const hues = [hexToHsl(p.accentFrom).h, hexToHsl(p.accentTo).h];
    expect(hues.some((h) => h > 190 && h < 240)).toBe(true); // a blue
    expect(hues.some((h) => h < 30 || h > 340)).toBe(true); // an orange/red
    expect(contrast(p.text, p.background)).toBeGreaterThanOrEqual(7);
  });

  it("uses the dark color covering the most area, and runs the gradient cool → warm", () => {
    const p = paletteFromSwatches([
      { hex: "#e76d40", share: 0.3 }, // orange listed first
      { hex: "#04133e", share: 0.5 }, // navy: biggest dark area
      { hex: "#2b1108", share: 0.06 }, // small darker brown patch
      { hex: "#1f5fe0", share: 0.14 },
    ]);
    expect(hexToHsl(p.background).h).toBeGreaterThan(200); // navy, not brown
    expect(hexToHsl(p.accentFrom).h).toBeGreaterThan(190); // blue first
    expect(hexToHsl(p.accentTo).h).toBeLessThan(40); // orange last
    expect(hexToHsl(p.highlight).l).toBeGreaterThan(0.6);
  });

  it("invents a dark background when the logo has none (e.g. a light, single-color logo)", () => {
    const p = paletteFromSwatches([
      { hex: "#ffffff", share: 0.7 },
      { hex: "#2e9e4f", share: 0.3 },
    ]);
    expect(hexToHsl(p.background).l).toBeLessThan(0.15);
    expect(Math.abs(hexToHsl(p.background).h - hexToHsl("#2e9e4f").h)).toBeLessThan(10);
    expect(p.accentFrom).not.toBe(p.accentTo);
  });
});

describe("clusterColors", () => {
  it("finds the dominant colors and their share", () => {
    const px = [
      ...Array(80).fill(hexToRgb("#031140")),
      ...Array(20).fill(hexToRgb("#fa6429")),
    ];
    const s = clusterColors(px, 4);
    expect(s[0].hex).toBe("#031140");
    expect(s[0].share).toBeCloseTo(0.8, 2);
    expect(s.find((x) => x.hex === "#fa6429")).toBeTruthy();
  });
});
