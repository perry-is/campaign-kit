import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createMedia } = require("./media.cjs");

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("poster media files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ck-media-"));
  const media = createMedia(dir);

  it("saves images privately and returns a ck-media address", () => {
    const url = media.save(PNG, "poster-abc12345");
    expect(url).toBe("ck-media://poster-abc12345.png");
    expect(fs.statSync(path.join(dir, "poster-abc12345.png")).mode & 0o777).toBe(0o600);
    expect(media.resolve(url)).toBe(path.join(dir, "poster-abc12345.png"));
  });

  it("refuses path tricks and non-images", () => {
    expect(() => media.save(PNG, "../../evil")).toThrow(/Bad media name/);
    expect(() => media.save(PNG, "UPPER-case-name")).toThrow(/Bad media name/);
    expect(() => media.save("data:text/html;base64,AAAA", "poster-abc12345")).toThrow(/PNG or JPEG/);
    expect(media.resolve("ck-media://..%2F..%2Fetc%2Fpasswd")).toBeNull();
    expect(media.resolve("file:///etc/passwd")).toBeNull();
  });

  it("removes files", () => {
    media.remove("ck-media://poster-abc12345.png");
    expect(fs.existsSync(path.join(dir, "poster-abc12345.png"))).toBe(false);
  });
});
