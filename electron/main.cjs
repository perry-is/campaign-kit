// CampaignKit — Electron main process.
// Loads the built UI (dist/index.html) or the Vite dev server when CK_DEV_URL is set.
const { app, BrowserWindow, Menu, clipboard, ipcMain, nativeImage, powerMonitor, protocol, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const secrets = require("./secrets.cjs");
const openai = require("./openai.cjs");
const { createLock } = require("./lock.cjs");
const { createMedia, SCHEME } = require("./media.cjs");
const { createStateStore } = require("./state.cjs");

// Development copies (npm run app) keep their data in a separate folder, so testing can never
// touch the real app's data. Must run before anything reads userData.
if (!app.isPackaged && !process.env.CK_KEEP_USERDATA) {
  app.setPath("userData", path.join(app.getPath("appData"), "CampaignKit (Dev)"));
}

// Only one copy of the app may run: two copies would fight over the same data.
if (!process.env.CK_ALLOW_MULTI && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
}

let stateInstance = null;
const stateStore = () => (stateInstance ??= createStateStore(path.join(app.getPath("userData"), "data")));

// ---- Error log (Library/Application Support/CampaignKit/logs/app.log) ----
function logError(message) {
  try {
    const dir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "app.log");
    if (fs.existsSync(file) && fs.statSync(file).size > 1024 * 1024) fs.renameSync(file, `${file}.old`);
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${String(message).slice(0, 4000)}\n`);
  } catch {
    /* logging must never break the app */
  }
}
process.on("uncaughtException", (e) => logError(`main: ${e && e.stack ? e.stack : e}`));

// ck-media:// serves saved poster images to the UI (must be declared before the app is ready).
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);
let mediaInstance = null;
const media = () => (mediaInstance ??= createMedia(path.join(app.getPath("userData"), "media")));

let lockInstance = null;
const lock = () => (lockInstance ??= createLock({ file: path.join(app.getPath("userData"), "lock.json") }));

/** Tell every window the lock state changed (e.g. the Mac's screen locked). */
function broadcastLock() {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("lock:changed", lock().status());
}

// IPC results are always { ok, data } or { ok: false, error: { code, message } } so the
// UI gets a friendly message instead of a stack trace.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (e) {
      return { ok: false, error: { code: e.code || "ERROR", message: e.code ? e.message : "Something went wrong.", retryable: !!e.retryable } };
    }
  });
}

// ---- App data ----
handle("state:load", () => stateStore().load());
handle("state:save", (json) => stateStore().save(json));
handle("app:logError", (msg) => { logError(`ui: ${msg}`); return true; });

// ---- App lock ----
handle("lock:status", () => lock().status());
handle("lock:setup", (pw) => lock().setup(pw));
handle("lock:unlock", (pw) => lock().unlock(pw));
handle("lock:recheck", (pw) => lock().recheck(pw));
handle("lock:change", (oldPw, newPw) => lock().change(oldPw, newPw));
handle("lock:lock", () => {
  lock().lock();
  broadcastLock();
  return true;
});
handle("lock:reset", (confirmWord) => {
  // Forgot password: start over. Saved API keys are erased so they can't be reached without it.
  if (confirmWord !== "RESET") throw Object.assign(new Error("Type RESET to confirm."), { code: "CONFIRM" });
  secrets.deleteAll();
  lock().reset();
  return true;
});

// Everything below needs the app unlocked; key changes also need the password re-entered.
const unlocked = (fn) => (...args) => { lock().requireUnlocked(); return fn(...args); };
const rechecked = (fn) => (...args) => { lock().requireRecheck(); return fn(...args); };

handle("ai:hasKey", unlocked(() => secrets.hasSecret(openai.KEY_NAME)));
handle("ai:setKey", rechecked(async (key, model) => {
  if (typeof key !== "string" || !/^sk-[A-Za-z0-9_\-]{20,}$/.test(key.trim())) {
    throw new openai.AIError("KEY_FORMAT", "That doesn't look like an OpenAI API key (it starts with sk-).");
  }
  await openai.testKey(model, key.trim()); // only save keys that work
  secrets.setSecret(openai.KEY_NAME, key.trim());
  return true;
}));
handle("ai:clearKey", rechecked(() => secrets.deleteSecret(openai.KEY_NAME)));
handle("ai:test", unlocked((model) => openai.testKey(model)));
handle("ai:respond", unlocked((req) => openai.respond(req)));
handle("ai:image", unlocked(async (req) => {
  const dataUrl = await openai.image(req);
  // Big images go straight to disk; the UI gets a small ck-media:// address back.
  return req && typeof req.saveAs === "string" ? media().save(dataUrl, req.saveAs) : dataUrl;
}));

// Poster files
handle("media:save", unlocked((dataUrl, name) => media().save(dataUrl, name)));
handle("media:remove", unlocked((url) => media().remove(url)));

// "Paste" buttons: read plain text from the clipboard only when the user clicks one.
handle("app:readClipboard", unlocked(async () => String((await clipboard.readText()) ?? "").slice(0, 4000)));

// Downloads: save a set of images into ~/Downloads/<folder>/ and show it in Finder.
handle("app:saveDownloads", unlocked((folder, files) => {
  const safe = (n) => String(n).replace(/[^A-Za-z0-9 ._-]+/g, "-").replace(/^[-. ]+/, "").slice(0, 80) || "CampaignKit";
  const dir = path.join(app.getPath("downloads"), safe(folder));
  fs.mkdirSync(dir, { recursive: true });
  let last = dir;
  for (const f of (files || []).slice(0, 20)) {
    const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(f && f.dataUrl);
    if (!m) continue;
    last = path.join(dir, safe(f.name));
    fs.writeFileSync(last, Buffer.from(m[2], "base64"));
  }
  shell.showItemInFolder(last);
  return dir;
}));

// App icon: the UI draws it; here it becomes the Dock icon now and on every launch.
const iconFile = () => path.join(app.getPath("userData"), "app-icon.png");
handle("app:setIcon", unlocked((pngDataUrl) => {
  if (typeof pngDataUrl !== "string" || !pngDataUrl.startsWith("data:image/png;base64,")) throw new Error("bad icon");
  const img = nativeImage.createFromDataURL(pngDataUrl);
  if (img.isEmpty()) throw new Error("bad icon");
  fs.writeFileSync(iconFile(), img.toPNG());
  if (app.dock) app.dock.setIcon(img);
  return true;
}));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "CampaignKit",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#031140",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Right-click menu: Cut / Copy / Paste in text fields, Copy on selected text.
  win.webContents.on("context-menu", (_e, params) => {
    const items = [];
    if (params.isEditable) {
      items.push(
        { label: "Undo", enabled: params.editFlags.canUndo, click: () => win.webContents.undo() },
        { type: "separator" },
        { label: "Cut", enabled: params.editFlags.canCut, click: () => win.webContents.cut() },
        { label: "Copy", enabled: params.editFlags.canCopy, click: () => win.webContents.copy() },
        { label: "Paste", enabled: params.editFlags.canPaste, click: () => win.webContents.paste() },
        { label: "Select All", click: () => win.webContents.selectAll() },
      );
    } else if (params.selectionText) {
      items.push({ label: "Copy", click: () => win.webContents.copy() });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  // Errors in the screens go to the log file, so problems can be diagnosed later.
  win.webContents.on("console-message", (e, legacyLevel, legacyMessage) => {
    const level = e && e.level !== undefined ? e.level : legacyLevel;
    const message = e && e.message !== undefined ? e.message : legacyMessage;
    if (level === "error" || level === 3) logError(`console: ${message}`);
  });
  win.webContents.on("render-process-gone", (_e, details) => logError(`screen process gone: ${details.reason}`));
  win.on("unresponsive", () => logError("window stopped responding"));

  // External links open in the user's browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.CK_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

// The app menu. Its Edit menu is what makes ⌘C / ⌘V / ⌘X / ⌘A work in text fields.
function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      { role: "windowMenu" },
    ]),
  );
}

app.whenReady().then(() => {
  buildMenu();
  protocol.handle(SCHEME, (request) => {
    const file = media().resolve(request.url);
    if (!file || !lock().status().unlocked || !fs.existsSync(file)) return new Response(null, { status: 404 });
    const type = file.endsWith(".png") ? "image/png" : "image/jpeg";
    return new Response(fs.readFileSync(file), { headers: { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
  });
  // Use the brand icon saved last time, if any.
  try {
    if (app.dock && fs.existsSync(iconFile())) app.dock.setIcon(nativeImage.createFromPath(iconFile()));
  } catch {
    /* keep the built-in icon */
  }
  createWindow();
  // Lock when the Mac's screen locks or it goes to sleep.
  for (const ev of ["lock-screen", "suspend"]) {
    powerMonitor.on(ev, () => {
      lock().lock();
      broadcastLock();
    });
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
