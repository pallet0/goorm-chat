const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const POSITIONS = ["TL", "TR", "BL", "BR"];
const DEFAULT_POSITION = "BL";

let win = null;
let configPath = null;
let position = DEFAULT_POSITION;

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const data = JSON.parse(raw);
    if (POSITIONS.includes(data.position)) position = data.position;
  } catch {
    // first run — keep default
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify({ position }, null, 2));
  } catch (e) {
    console.error("saveConfig failed", e);
  }
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().bounds;

  win = new BrowserWindow({
    x: 0, y: 0, width, height,
    transparent: true,
    frame: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setSkipTaskbar(true);

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function setPosition(pos) {
  if (!POSITIONS.includes(pos) || pos === position) return;
  position = pos;
  saveConfig();
  if (win && !win.isDestroyed()) {
    win.webContents.send("position-changed", position);
  }
}

function toggleVisibility() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) win.hide();
  else win.show();
}

ipcMain.handle("get-position", () => position);

app.whenReady().then(() => {
  configPath = path.join(app.getPath("userData"), "config.json");
  loadConfig();
  createWindow();

  globalShortcut.register("Control+1", () => setPosition("TL"));
  globalShortcut.register("Control+2", () => setPosition("TR"));
  globalShortcut.register("Control+3", () => setPosition("BL"));
  globalShortcut.register("Control+4", () => setPosition("BR"));
  globalShortcut.register("Control+Shift+H", toggleVisibility);
  globalShortcut.register("Control+Shift+Q", () => app.quit());
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
