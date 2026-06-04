const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const FONT_RANGE = { min: 16, max: 64, step: 2, def: 28 };
const FADE_RANGE = { min: 2000, max: 30000, step: 2000, def: 8000 };
const BAN_MODE_AUTO_EXIT_MS = 30000;

let win = null;
let configPath = null;
let logFilePath = null;
let fontSize = FONT_RANGE.def;
let fadeMs = FADE_RANGE.def;
let banList = new Set();
let banMode = false;
let banModeAutoExitTimer = null;
let chatHidden = false;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const data = JSON.parse(raw);
    if (typeof data.fontSize === "number") {
      fontSize = clamp(data.fontSize, FONT_RANGE.min, FONT_RANGE.max);
    }
    if (typeof data.fadeMs === "number") {
      fadeMs = clamp(data.fadeMs, FADE_RANGE.min, FADE_RANGE.max);
    }
    if (Array.isArray(data.banList)) {
      banList = new Set(data.banList.filter((s) => typeof s === "string"));
    }
  } catch {
    // first run — keep defaults
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        fontSize,
        fadeMs,
        banList: [...banList],
      }, null, 2),
    );
  } catch (e) {
    console.error("saveConfig failed", e);
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function sessionLogName(d) {
  return `chat-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
    + `-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}.jsonl`;
}

function initLogFile() {
  try {
    const logsDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logsDir, { recursive: true });
    logFilePath = path.join(logsDir, sessionLogName(new Date()));
  } catch (e) {
    console.error("initLogFile failed", e);
    logFilePath = null;
  }
}

function appendLog(rec) {
  if (!logFilePath || !rec || typeof rec !== "object") return;
  try {
    const line = JSON.stringify({ loggedAt: Date.now(), ...rec }) + "\n";
    fs.appendFileSync(logFilePath, line);
  } catch (e) {
    console.error("appendLog failed", e);
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

function setBanMode(active) {
  if (banMode === active) return;
  banMode = active;
  if (win && !win.isDestroyed()) {
    if (banMode) {
      win.setIgnoreMouseEvents(false);
      clearTimeout(banModeAutoExitTimer);
      banModeAutoExitTimer = setTimeout(() => setBanMode(false), BAN_MODE_AUTO_EXIT_MS);
    } else {
      win.setIgnoreMouseEvents(true, { forward: true });
      clearTimeout(banModeAutoExitTimer);
    }
    win.webContents.send("ban-mode-changed", banMode);
  }
}

function addBan(nickname) {
  if (typeof nickname !== "string" || nickname.length < 1) return;
  if (banList.has(nickname)) return;
  banList.add(nickname);
  saveConfig();
  if (win && !win.isDestroyed()) {
    win.webContents.send("ban-list-changed", { list: [...banList], reason: "add", nickname });
  }
}

function clearBans() {
  if (banList.size === 0) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("ban-list-changed", { list: [], reason: "clear", count: 0 });
    }
    return;
  }
  const count = banList.size;
  banList = new Set();
  saveConfig();
  if (win && !win.isDestroyed()) {
    win.webContents.send("ban-list-changed", { list: [], reason: "clear", count });
  }
}

function toggleChatHidden() {
  if (!win || win.isDestroyed()) return;
  chatHidden = !chatHidden;
  win.webContents.send("chat-hidden-changed", chatHidden);
}

ipcMain.handle("get-settings", () => ({
  fontSize, fadeMs,
  banList: [...banList],
  banMode,
}));

ipcMain.on("ban", (_e, nickname) => addBan(nickname));
ipcMain.on("log-message", (_e, rec) => appendLog(rec));

app.whenReady().then(() => {
  configPath = path.join(app.getPath("userData"), "config.json");
  loadConfig();
  initLogFile();
  createWindow();

  // font size
  globalShortcut.register("Control+=", () => adjustFontSize(FONT_RANGE.step));
  globalShortcut.register("Control+-", () => adjustFontSize(-FONT_RANGE.step));
  globalShortcut.register("Control+numadd", () => adjustFontSize(FONT_RANGE.step));
  globalShortcut.register("Control+numsub", () => adjustFontSize(-FONT_RANGE.step));

  // fade
  globalShortcut.register("Control+]", () => adjustFade(FADE_RANGE.step));
  globalShortcut.register("Control+[", () => adjustFade(-FADE_RANGE.step));

  // moderation
  globalShortcut.register("Control+Shift+B", () => setBanMode(!banMode));
  globalShortcut.register("Control+Shift+U", () => clearBans());

  // visibility / quit — Ctrl+Shift+H hides only chat bubbles, badge stays visible
  globalShortcut.register("Control+Shift+H", toggleChatHidden);
  globalShortcut.register("Control+Shift+Q", () => app.quit());
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
