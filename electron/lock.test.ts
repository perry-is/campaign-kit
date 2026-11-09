import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createLock, backoffMs } = require("./lock.cjs");

let file: string;
let clock: number;
const make = () => createLock({ file, now: () => clock });

beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ck-lock-")), "lock.json");
  clock = 1_000_000;
});

describe("app lock", () => {
  it("starts locked with no password, and setup unlocks", () => {
    const l = make();
    expect(l.status()).toEqual({ hasPassword: false, unlocked: false });
    expect(() => l.setup("short")).toThrow(/at least 8/);
    l.setup("correct horse");
    expect(l.status()).toEqual({ hasPassword: true, unlocked: true });
    expect(() => l.setup("another one")).toThrow(/already set/);
  });

  it("stores only a salted hash, never the password", () => {
    make().setup("correct horse");
    const raw = fs.readFileSync(file, "utf8");
    expect(raw).not.toContain("correct horse");
    expect(JSON.parse(raw)).toMatchObject({ v: 1 });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it("a fresh launch is locked and unlocks only with the right password", () => {
    make().setup("correct horse");
    const l = make(); // new app launch
    expect(l.status().unlocked).toBe(false);
    expect(() => l.requireUnlocked()).toThrow(/locked/);
    expect(() => l.unlock("wrong password")).toThrow(/Wrong password/);
    l.unlock("correct horse");
    expect(() => l.requireUnlocked()).not.toThrow();
  });

  it("API key changes need a re-check that expires after 2 minutes", () => {
    const l = make();
    l.setup("correct horse");
    expect(() => l.requireRecheck()).toThrow(/Enter your password/);
    l.recheck("correct horse");
    expect(() => l.requireRecheck()).not.toThrow();
    clock += 2 * 60 * 1000 + 1;
    expect(() => l.requireRecheck()).toThrow(/Enter your password/);
    l.lock();
    expect(() => l.recheck("correct horse")).toThrow(/Unlock the app first/);
  });

  it("slows down repeated wrong guesses, even across launches", () => {
    make().setup("correct horse");
    let l = make();
    for (let i = 0; i < 4; i++) expect(() => l.unlock("nope nope")).toThrow(/^Wrong password\.$/);
    expect(() => l.unlock("nope nope")).toThrow(/Wait 30 seconds/);
    l = make(); // relaunching doesn't clear the wait
    expect(() => l.unlock("correct horse")).toThrow(/Too many wrong tries/);
    clock += 30_000;
    l.unlock("correct horse");
    expect(l.status().unlocked).toBe(true);
  });

  it("backoff grows and is capped at 15 minutes", () => {
    expect(backoffMs(4)).toBe(0);
    expect(backoffMs(5)).toBe(30_000);
    expect(backoffMs(6)).toBe(60_000);
    expect(backoffMs(50)).toBe(15 * 60_000);
  });

  it("changes the password only with the old one, and reset starts over", () => {
    const l = make();
    l.setup("correct horse");
    expect(() => l.change("wrong one!", "new password")).toThrow(/Wrong password/);
    l.change("correct horse", "new password");
    const l2 = make();
    expect(() => l2.unlock("correct horse")).toThrow();
    l2.unlock("new password");
    l2.reset();
    expect(l2.status()).toEqual({ hasPassword: false, unlocked: false });
  });
});
