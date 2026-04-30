const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getPosition: () => ipcRenderer.invoke("get-position"),
  onPositionChanged: (cb) =>
    ipcRenderer.on("position-changed", (_event, pos) => cb(pos)),
});
