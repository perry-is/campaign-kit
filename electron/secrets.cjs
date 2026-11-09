// Secret storage for API keys. Values are encrypted with Electron safeStorage, whose
// encryption key lives in the macOS Keychain, and the ciphertext is kept in the app's
// private data folder. Plain keys never touch disk and never reach the UI.
const { app, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const file = () => path.join(app.getPath("userData"), "secrets.json");

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    return {};
  }
}

function writeAll(data) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(data), { mode: 0o600 });
}

function setSecret(name, value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Keychain encryption is not available");
  const all = readAll();
  all[name] = safeStorage.encryptString(value).toString("base64");
  writeAll(all);
}

function getSecret(name) {
  const blob = readAll()[name];
  if (!blob) return null;
  try {
    return safeStorage.decryptString(Buffer.from(blob, "base64"));
  } catch {
    return null;
  }
}

function hasSecret(name) {
  return Boolean(readAll()[name]);
}

function deleteSecret(name) {
  const all = readAll();
  delete all[name];
  writeAll(all);
}

function deleteAll() {
  try {
    fs.unlinkSync(file());
  } catch {
    /* nothing saved */
  }
}

module.exports = { setSecret, getSecret, hasSecret, deleteSecret, deleteAll };
