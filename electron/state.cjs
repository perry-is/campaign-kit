// App data (brands, events, settings) saved as a JSON file in the app's private folder.
// Writes are atomic (temp file + rename) and the previous version is kept as a rolling backup,
// so a crash or bad write can never leave the app with nothing.
const fs = require("node:fs");
const path = require("node:path");

const MAX_BYTES = 50 * 1024 * 1024;
const BACKUPS = 5;
const BACKUP_EVERY_MS = 10 * 60 * 1000;

function createStateStore(dir, now = () => Date.now()) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "state.json");
  const backup = (n) => path.join(dir, `state.backup-${n}.json`);
  let lastBackupAt = 0;

  function readJson(f) {
    try {
      const text = fs.readFileSync(f, "utf8");
      JSON.parse(text); // must be valid
      return text;
    } catch {
      return null;
    }
  }

  return {
    file,
    /** The saved state as a JSON string, falling back to the newest good backup; null if none. */
    load() {
      const main = readJson(file);
      if (main !== null) return main;
      for (let n = 1; n <= BACKUPS; n++) {
        const b = readJson(backup(n));
        if (b !== null) return b;
      }
      return null;
    },
    save(json) {
      if (typeof json !== "string" || json.length > MAX_BYTES) {
        throw Object.assign(new Error("App data is too large to save."), { code: "TOO_LARGE" });
      }
      JSON.parse(json); // never write something we can't read back
      if (fs.existsSync(file) && now() - lastBackupAt > BACKUP_EVERY_MS) {
        for (let n = BACKUPS - 1; n >= 1; n--) {
          if (fs.existsSync(backup(n))) fs.renameSync(backup(n), backup(n + 1));
        }
        fs.copyFileSync(file, backup(1));
        lastBackupAt = now();
      }
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, json, { mode: 0o600 });
      fs.renameSync(tmp, file);
      return true;
    },
  };
}

module.exports = { createStateStore };
