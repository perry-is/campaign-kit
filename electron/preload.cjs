// Bridge between the sandboxed UI and the main process. Keep this surface small:
// the UI can ask for AI work, but can never read the API key back.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ckDesktop", {
  isDesktop: true,
  platform: process.platform,
  ai: {
    hasKey: () => ipcRenderer.invoke("ai:hasKey"),
    setKey: (key, model) => ipcRenderer.invoke("ai:setKey", key, model),
    clearKey: () => ipcRenderer.invoke("ai:clearKey"),
    test: (model) => ipcRenderer.invoke("ai:test", model),
    respond: (req) => ipcRenderer.invoke("ai:respond", req),
    image: (req) => ipcRenderer.invoke("ai:image", req),
  },
  setAppIcon: (pngDataUrl) => ipcRenderer.invoke("app:setIcon", pngDataUrl),
  readClipboard: () => ipcRenderer.invoke("app:readClipboard"),
  saveDownloads: (folder, files) => ipcRenderer.invoke("app:saveDownloads", folder, files),
  state: {
    load: () => ipcRenderer.invoke("state:load"),
    save: (json) => ipcRenderer.invoke("state:save", json),
  },
  logError: (msg) => ipcRenderer.invoke("app:logError", String(msg).slice(0, 4000)),
  media: {
    save: (dataUrl, name) => ipcRenderer.invoke("media:save", dataUrl, name),
    remove: (url) => ipcRenderer.invoke("media:remove", url),
  },
  lock: {
    status: () => ipcRenderer.invoke("lock:status"),
    setup: (pw) => ipcRenderer.invoke("lock:setup", pw),
    unlock: (pw) => ipcRenderer.invoke("lock:unlock", pw),
    recheck: (pw) => ipcRenderer.invoke("lock:recheck", pw),
    change: (oldPw, newPw) => ipcRenderer.invoke("lock:change", oldPw, newPw),
    lock: () => ipcRenderer.invoke("lock:lock"),
    reset: (confirmWord) => ipcRenderer.invoke("lock:reset", confirmWord),
    onChange: (cb) => {
      const fn = (_e, status) => cb(status);
      ipcRenderer.on("lock:changed", fn);
      return () => ipcRenderer.removeListener("lock:changed", fn);
    },
  },
});
