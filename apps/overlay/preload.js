const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  onPositionChanged: (cb) =>
    ipcRenderer.on("position-changed", (_event, pos) => cb(pos)),
  onFontChanged: (cb) =>
    ipcRenderer.on("font-changed", (_event, size) => cb(size)),
  onFadeChanged: (cb) =>
    ipcRenderer.on("fade-changed", (_event, ms) => cb(ms)),
});
