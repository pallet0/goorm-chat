const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  requestBan: (nickname) => ipcRenderer.send("ban", nickname),
  onPositionChanged: (cb) =>
    ipcRenderer.on("position-changed", (_event, pos) => cb(pos)),
  onFontChanged: (cb) =>
    ipcRenderer.on("font-changed", (_event, size) => cb(size)),
  onFadeChanged: (cb) =>
    ipcRenderer.on("fade-changed", (_event, ms) => cb(ms)),
  onBanModeChanged: (cb) =>
    ipcRenderer.on("ban-mode-changed", (_event, active) => cb(active)),
  onBanListChanged: (cb) =>
    ipcRenderer.on("ban-list-changed", (_event, payload) => cb(payload)),
  onChatHiddenChanged: (cb) =>
    ipcRenderer.on("chat-hidden-changed", (_event, hidden) => cb(hidden)),
});
