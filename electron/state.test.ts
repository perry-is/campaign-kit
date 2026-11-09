import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createStateStore } = require("./state.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ck-state-"));

describe("app data file", () => {
  it("saves and loads, privately, with nothing on first run", () => {
    const dir = tmp();
    const s = createStateStore(dir);
    expect(s.load()).toBeNull();
    s.save(JSON.stringify({ campaigns: [1] }));
    expect(JSON.parse(s.load())).toEqual({ campaigns: [1] });
    expect(fs.statSync(path.join(dir, "state.json")).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(path.join(dir, "state.json.tmp"))).toBe(false);
  });

  it("refuses to write anything it couldn't read back", () => {
    const s = createStateStore(tmp());
    expect(() => s.save("{not json")).toThrow();
    expect(() => s.save(undefined)).toThrow(/too large/);
  });

  it("keeps rolling backups and recovers from a damaged file", () => {
    let t = 0;
    const dir = tmp();
    const s = createStateStore(dir, () => t);
    s.save(JSON.stringify({ v: 1 }));
    t += 11 * 60 * 1000;
    s.save(JSON.stringify({ v: 2 })); // backs up v1
    expect(JSON.parse(fs.readFileSync(path.join(dir, "state.backup-1.json"), "utf8"))).toEqual({ v: 1 });
    fs.writeFileSync(path.join(dir, "state.json"), "garbage{");
    expect(JSON.parse(s.load())).toEqual({ v: 1 }); // falls back to the newest good backup
  });
});
