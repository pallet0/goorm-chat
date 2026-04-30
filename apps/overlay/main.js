const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const POSITIONS = ["TL", "TR", "BL", "BR"];
const DEFAULT_POSITION = "BL";

// adjustable settings — persisted to userData/config.json
const FONT_RANGE = { min: 16, max: 64, step: 2, def: 28 };
const FADE_RANGE = { min: 2000, max: 30000, step: 2000, def: 8000 };

let win = null;
let configPath = null;
let position = DEFAULT_POSITION;
let fontSize = FONT_RANGE.def;
let fadeMs = FADE_RANGE.def;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const data = JSON.parse(raw);
    if (POSITIONS.includes(data.position)) position = data.position;
    if (typeof data.fontSize === "number") {
      fontSize = clamp(data.fontSize, FONT_RANGE.min, FONT_RANGE.max);
    }
    if (typeof data.fadeMs === "number") {
      fadeMs = clamp(data.fadeMs, FADE_RANGE.min, FADE_RANGE.max);
    }
  } catch {
    // first run — keep defaults
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ position, fontSize, fadeMs }, null, 2),
    );
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

function adjustFontSize(delta) {
  const next = clamp(fontSize + delta, FONT_RANGE.min, FONT_RANGE.max);
  if (next === fontSize) return;
  fontSize = next;
  saveConfig();
  if (win && !win.isDestroyed()) {
    win.webContents.send("font-changed", fontSize);
  }
}

function adjustFade(deltaMs) {
  const next = clamp(fadeMs + deltaMs, FADE_RANGE.min, FADE_RANGE.max);
  if (next === fadeMs) return;
  fadeMs = next;
  saveConfig();
  if (win && !win.isDestroyed()) {
    win.webContents.send("fade-changed", fadeMs);
  }
}

function toggleVisibility() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) win.hide();
  else win.show();
}

ipcMain.handle("get-settings", () => ({ position, fontSize, fadeMs }));

app.whenReady().then(() => {
  configPath = path.join(app.getPath("userData"), "config.json");
  loadConfig();
  createWindow();

  // position
  globalShortcut.register("Control+1", () => setPosition("TL"));
  globalShortcut.register("Control+2", () => setPosition("TR"));
  globalShortcut.register("Control+3", () => setPosition("BL"));
  globalShortcut.register("Control+4", () => setPosition("BR"));

  // font size — Ctrl+=/+ for up, Ctrl+- for down (matches browser zoom)
  globalShortcut.register("Control+=", () => adjustFontSize(FONT_RANGE.step));
  globalShortcut.register("Control+-", () => adjustFontSize(-FONT_RANGE.step));
  // bonus: numpad equivalents in case "=" is awkward on a layout
  globalShortcut.register("Control+numadd", () => adjustFontSize(FONT_RANGE.step));
  globalShortcut.register("Control+numsub", () => adjustFontSize(-FONT_RANGE.step));

  // fade duration — Ctrl+] longer, Ctrl+[ shorter
  globalShortcut.register("Control+]", () => adjustFade(FADE_RANGE.step));
  globalShortcut.register("Control+[", () => adjustFade(-FADE_RANGE.step));

  // visibility / quit
  globalShortcut.register("Control+Shift+H", toggleVisibility);
  globalShortcut.register("Control+Shift+Q", () => app.quit());
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
