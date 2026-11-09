import { describe, expect, it } from "vitest";
import { findBands } from "./emblem";

describe("findBands", () => {
  it("separates a symbol from the wordmark below it and measures each", () => {
    // 10 rows of symbol, 5 empty, 3 rows of text, 3 empty, 2 rows of tagline
    const rows = [...Array(10).fill(50), ...Array(5).fill(0), ...Array(3).fill(30), ...Array(3).fill(0), ...Array(2).fill(10)];
    const bands = findBands(rows, 1, 3);
    expect(bands).toHaveLength(3);
    expect(bands[0]).toEqual({ top: 0, bottom: 9, mass: 500 });
    expect([...bands].sort((a, b) => b.mass - a.mass)[0].top).toBe(0);
  });

  it("bridges tiny gaps inside one shape", () => {
    const rows = [5, 5, 0, 5, 5];
    expect(findBands(rows, 1, 3)).toHaveLength(1);
  });
});
