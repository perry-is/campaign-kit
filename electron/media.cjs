// Poster images live as files in the app's private folder, served to the UI as
// ck-media://<name>.png. Only plain file names inside that folder can be read or written.
const fs = require("node:fs");
const path = require("node:path");

const SCHEME = "ck-media";
const NAME_RE = /^[a-z0-9-]{8,80}\.(png|jpg)$/;

function createMedia(dir) {
  fs.mkdirSync(dir, { recursive: true });

  const fileFor = (name) => {
    if (!NAME_RE.test(name)) throw Object.assign(new Error("Bad media name."), { code: "BAD_REQUEST" });
    return path.join(dir, name);
  };

  return {
    /** Save a PNG/JPEG data URL; returns its ck-media:// address. */
    save(dataUrl, name) {
      const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl || "");
      if (!m) throw Object.assign(new Error("Only PNG or JPEG images can be saved."), { code: "BAD_REQUEST" });
      const ext = m[1] === "png" ? "png" : "jpg";
      const file = fileFor(`${name}.${ext}`);
      fs.writeFileSync(file, Buffer.from(m[2], "base64"), { mode: 0o600 });
      return `${SCHEME}://${path.basename(file)}`;
    },
    remove(url) {
      const name = String(url || "").replace(`${SCHEME}://`, "");
      try { fs.unlinkSync(fileFor(name)); } catch { /* already gone */ }
      return true;
    },
    /** Resolve a ck-media:// URL to a file path, or null if it isn't a valid one. */
    resolve(url) {
      try {
        const u = new URL(url);
        if (u.protocol !== `${SCHEME}:`) return null;
        return fileFor(u.hostname || u.pathname.replace(/^\/+/, ""));
      } catch {
        return null;
      }
    },
  };
}

module.exports = { createMedia, SCHEME };
