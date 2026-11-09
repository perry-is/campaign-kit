// App lock: a password in front of the app, plus a fresh re-check before API key changes.
// Only a salted scrypt hash is stored. Lock state lives in the main process, so the UI
// can't skip it. Repeated wrong guesses get slower.
const crypto = require("node:crypto");
const fs = require("node:fs");

const MIN_LENGTH = 8;
const RECHECK_WINDOW_MS = 2 * 60 * 1000; // after re-entering the password, key changes are allowed for 2 minutes
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

class LockError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 32, SCRYPT);
}

/** Delay after N consecutive failures: none for the first 4, then 30s, 1m, 2m… capped at 15 minutes. */
function backoffMs(failures) {
  if (failures < 5) return 0;
  return Math.min(15 * 60 * 1000, 30 * 1000 * 2 ** (failures - 5));
}

function createLock({ file, now = () => Date.now() }) {
  let unlocked = false;
  let recheckedAt = 0;

  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  };
  const write = (data) => fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });

  function checkPassword(password) {
    const rec = read();
    if (!rec) throw new LockError("NO_PASSWORD", "No password has been set yet.");
    const waitMs = (rec.blockedUntil || 0) - now();
    if (waitMs > 0) {
      throw new LockError("TOO_MANY_TRIES", `Too many wrong tries. Wait ${Math.ceil(waitMs / 1000)} seconds.`, { waitMs });
    }
    const ok =
      typeof password === "string" &&
      crypto.timingSafeEqual(hash(password, Buffer.from(rec.salt, "base64")), Buffer.from(rec.hash, "base64"));
    if (!ok) {
      const failures = (rec.failures || 0) + 1;
      const wait = backoffMs(failures);
      write({ ...rec, failures, blockedUntil: wait ? now() + wait : 0 });
      throw new LockError("WRONG_PASSWORD", wait ? `Wrong password. Wait ${Math.ceil(wait / 1000)} seconds before trying again.` : "Wrong password.", { waitMs: wait });
    }
    if (rec.failures) write({ ...rec, failures: 0, blockedUntil: 0 });
  }

  function validateNew(password) {
    if (typeof password !== "string" || password.length < MIN_LENGTH) {
      throw new LockError("TOO_SHORT", `Use at least ${MIN_LENGTH} characters.`);
    }
  }

  function store(password) {
    const salt = crypto.randomBytes(16);
    write({ v: 1, salt: salt.toString("base64"), hash: hash(password, salt).toString("base64"), failures: 0, blockedUntil: 0 });
  }

  return {
    status: () => ({ hasPassword: !!read(), unlocked }),
    setup(password) {
      if (read()) throw new LockError("ALREADY_SET", "A password is already set.");
      validateNew(password);
      store(password);
      unlocked = true;
      return true;
    },
    unlock(password) {
      checkPassword(password);
      unlocked = true;
      return true;
    },
    /** Re-enter the password before sensitive actions (API keys). */
    recheck(password) {
      if (!unlocked) throw new LockError("LOCKED", "Unlock the app first.");
      checkPassword(password);
      recheckedAt = now();
      return true;
    },
    change(oldPassword, newPassword) {
      if (!unlocked) throw new LockError("LOCKED", "Unlock the app first.");
      checkPassword(oldPassword);
      validateNew(newPassword);
      store(newPassword);
      return true;
    },
    lock() {
      unlocked = false;
      recheckedAt = 0;
      return true;
    },
    /** Forgot password: the caller must also erase saved API keys. */
    reset() {
      try { fs.unlinkSync(file); } catch { /* already gone */ }
      unlocked = false;
      recheckedAt = 0;
      return true;
    },
    requireUnlocked() {
      if (!unlocked) throw new LockError("LOCKED", "The app is locked.");
    },
    requireRecheck() {
      if (!unlocked) throw new LockError("LOCKED", "The app is locked.");
      if (now() - recheckedAt > RECHECK_WINDOW_MS) throw new LockError("RECHECK_NEEDED", "Enter your password to change API keys.");
    },
  };
}

module.exports = { createLock, backoffMs, LockError, MIN_LENGTH };
