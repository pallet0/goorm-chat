# Random Floating Chat Placement + Chat Log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make incoming chat bubbles float at random, boundary-safe, best-effort-non-overlapping screen positions instead of stacking in a corner, and append every received message to a per-session JSON Lines log file.

**Architecture:** A new pure ES-module `renderer/placement.mjs` computes a safe `(x,y)` for each bubble (unit-tested with `node --test`). The renderer (`app.js`) measures each bubble, asks `placement.mjs` for a spot, absolutely-positions it, and forwards every live message to the Electron main process over a new `log-message` IPC channel. Main (`main.js`) owns a per-session `.jsonl` file under `userData/logs/` and appends one line per message. Corner anchoring (`Ctrl+1–4`) is removed; the status badge is pinned top-left.

**Tech Stack:** Electron 31, vanilla ESM in the renderer, Firebase Realtime DB (unchanged), Node's built-in `node:test` runner (no new dependencies).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `apps/overlay/renderer/placement.mjs` | Pure placement math: `pickPosition`, `rectsIntersect`, `overlapArea`. No DOM. | **Create** |
| `apps/overlay/renderer/placement.test.mjs` | `node:test` unit tests for the above. | **Create** |
| `apps/overlay/package.json` | Add `"test": "node --test renderer/"` script. | Modify |
| `apps/overlay/main.js` | Remove position state/shortcuts; add per-session log file + `log-message` IPC. | Modify |
| `apps/overlay/preload.js` | Remove `onPositionChanged`; add `logMessage`. | Modify |
| `apps/overlay/renderer/index.html` | `#stack` → `#field`; badge loses corner class. | Modify |
| `apps/overlay/renderer/style.css` | `#field` + absolute bubbles, fixed top-left badge, fade+scale animation, remove corner classes. | Modify |
| `apps/overlay/renderer/app.js` | Floating placement, logging call, `MAX_VISIBLE = 12`, remove position handling. | Modify |
| `CLAUDE.md` | Append decisions-log entry. | Modify |

**Why `.mjs`:** the package is CommonJS (`main.js`/`preload.js` use `require`). Naming the pure module `.mjs` lets `node --test` load it as ESM without setting `"type":"module"` (which would break the Electron main process). The browser imports it via the explicit `./placement.mjs` specifier.

---

## Task 1: Pure placement module (`placement.mjs`) with unit tests

**Files:**
- Create: `apps/overlay/renderer/placement.mjs`
- Create: `apps/overlay/renderer/placement.test.mjs`
- Modify: `apps/overlay/package.json` (add `test` script)

- [ ] **Step 1: Add the `test` script to `package.json`**

In `apps/overlay/package.json`, change the `scripts` block from:

```json
  "scripts": {
    "start": "electron .",
    "build:icon": "node scripts/build-icon.js",
    "dist": "electron-builder --win"
  },
```

to:

```json
  "scripts": {
    "start": "electron .",
    "test": "node --test renderer/",
    "build:icon": "node scripts/build-icon.js",
    "dist": "electron-builder --win"
  },
```

- [ ] **Step 2: Write the failing tests**

Create `apps/overlay/renderer/placement.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPosition, rectsIntersect, overlapArea } from "./placement.mjs";

// Deterministic rng: returns queued values in order (x, y, x, y, ...).
function makeRng(values) {
  let i = 0;
  return () => values[i++];
}

test("rectsIntersect detects overlap with gap", () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };
  const b = { x: 150, y: 0, w: 100, h: 100 };
  assert.equal(rectsIntersect(a, b, 0), false);   // 50px apart
  assert.equal(rectsIntersect(a, b, 60), true);    // gap closes the 50px gap
});

test("overlapArea computes intersection area", () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };
  const b = { x: 50, y: 50, w: 100, h: 100 };
  assert.equal(overlapArea(a, b), 50 * 50);
});

test("returns a point inside the safe box on an empty screen", () => {
  const p = pickPosition({
    vw: 1000, vh: 800, w: 200, h: 100,
    margin: 24, gap: 12, existing: [], rng: () => 0.5,
  });
  assert.ok(p.x >= 24 && p.x <= 1000 - 200 - 24);
  assert.ok(p.y >= 24 && p.y <= 800 - 100 - 24);
});

test("avoids a single blocking rect when a free spot exists", () => {
  // try1 lands on the blocker (collides); try2 lands free and is returned.
  const rng = makeRng([0, 0, 0.9, 0.9]);
  const p = pickPosition({
    vw: 1000, vh: 1000, w: 100, h: 100,
    margin: 0, gap: 0, existing: [{ x: 0, y: 0, w: 200, h: 200 }],
    tries: 30, rng,
  });
  assert.deepEqual(p, { x: 810, y: 810 });
});

test("falls back to least-overlap when every candidate collides", () => {
  // A full-width band at the top forces every candidate to collide.
  // try1 overlaps fully (10000); try2 overlaps less (5500) -> try2 wins.
  const rng = makeRng([0, 0, 0, 0.05]);
  const p = pickPosition({
    vw: 1000, vh: 1000, w: 100, h: 100,
    margin: 0, gap: 0, existing: [{ x: 0, y: 0, w: 1000, h: 100 }],
    tries: 2, rng,
  });
  assert.equal(p.x, 0);
  assert.equal(p.y, 45);
});

test("clamps to margin when the bubble is as wide as the safe area", () => {
  // vw - w - margin == margin -> spanX is 0 -> x is always the left margin.
  const p = pickPosition({
    vw: 100, vh: 200, w: 100, h: 50,
    margin: 0, gap: 0, existing: [], rng: () => 0.5,
  });
  assert.equal(p.x, 0);
  assert.equal(p.y, 75);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/overlay && npm test`
Expected: FAIL — `Cannot find module './placement.mjs'` (module not created yet).

- [ ] **Step 4: Write the minimal implementation**

Create `apps/overlay/renderer/placement.mjs`:

```js
// Pure geometry helpers for floating-bubble placement. No DOM access, so this
// module is unit-testable under `node --test`. All rects are { x, y, w, h }.

export function rectsIntersect(a, b, gap = 0) {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

export function overlapArea(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy;
}

// Pick a boundary-safe (x, y) for a w*h bubble inside a vw*vh viewport,
// avoiding `existing` rects where possible.
//   margin: min distance from any screen edge (guarantees nothing is clipped)
//   gap:    extra spacing required around each existing rect
//   tries:  number of random candidates to attempt before giving up
//   rng:    () => [0,1), injected for deterministic tests
// Returns the first non-colliding candidate; if all collide, the one with the
// least total overlap area; if no candidate was generated, the top-left corner
// of the safe box.
export function pickPosition({
  vw, vh, w, h, margin = 24, gap = 12, existing = [], tries = 30, rng = Math.random,
}) {
  const xLo = margin;
  const yLo = margin;
  const spanX = Math.max(0, vw - w - margin - xLo);
  const spanY = Math.max(0, vh - h - margin - yLo);

  let best = null;
  let bestOverlap = Infinity;

  for (let i = 0; i < tries; i++) {
    const x = xLo + rng() * spanX;
    const y = yLo + rng() * spanY;
    const cand = { x, y, w, h };

    let collides = false;
    let total = 0;
    for (const r of existing) {
      if (rectsIntersect(cand, r, gap)) {
        collides = true;
        total += overlapArea(cand, r);
      }
    }

    if (!collides) return { x, y };
    if (total < bestOverlap) {
      bestOverlap = total;
      best = { x, y };
    }
  }

  return best ?? { x: xLo, y: yLo };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/overlay && npm test`
Expected: PASS — all 6 tests pass (`# pass 6`, `# fail 0`).

- [ ] **Step 6: Commit**

```bash
git add apps/overlay/renderer/placement.mjs apps/overlay/renderer/placement.test.mjs apps/overlay/package.json
git commit -m "feat(overlay): pure boundary-safe placement module + tests"
```

---

## Task 2: Main process — per-session log file + remove position

**Files:**
- Modify: `apps/overlay/main.js`

- [ ] **Step 1: Replace `main.js` with the updated version**

Overwrite `apps/overlay/main.js` with:

```js
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
```

- [ ] **Step 2: Verify the file parses**

Run: `cd apps/overlay && node --check main.js`
Expected: no output, exit code 0 (syntax OK).

- [ ] **Step 3: Commit**

```bash
git add apps/overlay/main.js
git commit -m "feat(overlay): per-session jsonl log + remove corner position state"
```

---

## Task 3: Preload — swap position bridge for logging bridge

**Files:**
- Modify: `apps/overlay/preload.js`

- [ ] **Step 1: Replace `preload.js`**

Overwrite `apps/overlay/preload.js` with:

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("get-settings"),
  requestBan: (nickname) => ipcRenderer.send("ban", nickname),
  logMessage: (rec) => ipcRenderer.send("log-message", rec),
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
```

- [ ] **Step 2: Verify the file parses**

Run: `cd apps/overlay && node --check preload.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add apps/overlay/preload.js
git commit -m "feat(overlay): expose logMessage bridge, drop onPositionChanged"
```

---

## Task 4: Markup & styles — field container, fixed badge, float animation

**Files:**
- Modify: `apps/overlay/renderer/index.html`
- Modify: `apps/overlay/renderer/style.css`

- [ ] **Step 1: Replace `index.html`**

Overwrite `apps/overlay/renderer/index.html` with:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>Chat Overlay</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="field"></div>
  <div id="indicator" class="indicator"></div>
  <div id="status-badge" class="status-badge" aria-hidden="true">
    <span class="status-dot"></span>
    <span class="status-text">구름</span>
  </div>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Replace `style.css`**

Overwrite `apps/overlay/renderer/style.css` with:

```css
:root {
  --bubble-bg: rgba(0, 0, 0, 0.75);
  --bubble-font-size: 28px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: 100%;
  height: 100%;
  background: transparent !important;
  overflow: hidden;
  font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR",
               -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  word-break: keep-all;
  overflow-wrap: break-word;
  -webkit-font-smoothing: antialiased;
}

/* full-screen field — bubbles are absolutely positioned inside it */
#field {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.bubble {
  position: absolute;
  background: var(--bubble-bg);
  color: #fff;
  border-radius: 12px;
  padding: 12px 16px;
  font-size: var(--bubble-font-size);
  line-height: 1.3;
  max-width: 42vw;          /* cap width so long messages still fit on screen */
  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
  opacity: 0;
  transform: scale(0.92);
  transform-origin: center;
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}

.bubble.in {
  opacity: 1;
  transform: scale(1);
}

.bubble.out {
  opacity: 0;
  transform: scale(0.92);
  transition: opacity 300ms ease-in, transform 300ms ease-in;
}

.nickname {
  font-weight: 700;
  margin-right: 8px;
}

/* settings indicator (top-center toast for hotkey feedback) */
.indicator {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translate(-50%, -16px);
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 10px 20px;
  border-radius: 999px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms ease-out, transform 200ms ease-out;
  white-space: nowrap;
  z-index: 10;
}
.indicator.visible {
  opacity: 1;
  transform: translate(-50%, 0);
}

/* persistent status badge — pinned top-left */
.status-badge {
  position: fixed;
  top: 18px;
  left: 18px;
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(0, 0, 0, 0.45);
  color: #e8e8e8;
  padding: 6px 12px 6px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  pointer-events: none;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  user-select: none;
  z-index: 5;
  transition: background 200ms ease-out, color 200ms ease-out;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #46e066;
  box-shadow: 0 0 8px rgba(70, 224, 102, 0.8);
  animation: status-pulse 2s ease-in-out infinite;
  transition: background 200ms ease-out, box-shadow 200ms ease-out;
}

@keyframes status-pulse {
  0%, 100% { opacity: 1;   transform: scale(1); }
  50%      { opacity: 0.55; transform: scale(0.82); }
}

/* ban-mode visual changes */
body.ban-mode #field {
  pointer-events: auto;
}
body.ban-mode .bubble {
  pointer-events: auto;
  cursor: pointer;
  outline: 3px solid rgba(255, 70, 70, 0.85);
  outline-offset: 2px;
  transition: opacity 200ms ease-out, transform 200ms ease-out, outline-color 150ms ease-out;
}
body.ban-mode .bubble:hover {
  outline-color: rgba(255, 90, 90, 1);
  outline-width: 4px;
}

.status-badge.ban {
  background: rgba(120, 0, 0, 0.6);
  color: #ffe0e0;
}
.status-badge.ban .status-dot {
  background: #ff4646;
  box-shadow: 0 0 10px rgba(255, 70, 70, 0.9);
}

/* Ctrl+Shift+H: hide chat bubbles only — status badge stays visible. */
body.chat-hidden #field {
  display: none;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/overlay/renderer/index.html apps/overlay/renderer/style.css
git commit -m "feat(overlay): field container, top-left badge, fade+scale float animation"
```

---

## Task 5: Renderer logic — floating placement + logging

**Files:**
- Modify: `apps/overlay/renderer/app.js`

- [ ] **Step 1: Replace `app.js`**

Overwrite `apps/overlay/renderer/app.js` with:

```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, query, limitToLast, onChildAdded,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { PALETTE } from "./palette.js";
import { pickPosition } from "./placement.mjs";

const MAX_VISIBLE = 12;
const DEFAULT_FADE_MS = 8000;
const DEFAULT_FONT_PX = 28;

const field = document.getElementById("field");
const indicator = document.getElementById("indicator");
const statusBadge = document.getElementById("status-badge");
const statusText = statusBadge.querySelector(".status-text");
const bubbles = []; // { key, nickname, el, timer, rect } — newest pushed last

let fadeAfterMs = DEFAULT_FADE_MS;
let indicatorTimer = null;
let banSet = new Set();
let banMode = false;

function applyFontSize(px) {
  document.documentElement.style.setProperty("--bubble-font-size", `${px}px`);
}

function showIndicator(text) {
  indicator.textContent = text;
  indicator.classList.add("visible");
  clearTimeout(indicatorTimer);
  indicatorTimer = setTimeout(() => indicator.classList.remove("visible"), 1500);
}

function applyBanModeUI() {
  document.body.classList.toggle("ban-mode", banMode);
  statusBadge.classList.toggle("ban", banMode);
  statusText.textContent = banMode ? "차단 모드" : "구름";
}

(async function init() {
  try {
    const s = await window.api.getSettings();
    applyFontSize(s.fontSize || DEFAULT_FONT_PX);
    fadeAfterMs = s.fadeMs || DEFAULT_FADE_MS;
    banSet = new Set(s.banList || []);
    banMode = !!s.banMode;
    applyBanModeUI();
  } catch (e) {
    console.error("getSettings failed, using defaults", e);
    applyFontSize(DEFAULT_FONT_PX);
    applyBanModeUI();
  }

  window.api.onFontChanged((size) => {
    applyFontSize(size);
    showIndicator(`글자 크기: ${size}px`);
  });
  window.api.onFadeChanged((ms) => {
    fadeAfterMs = ms;
    showIndicator(`표시 시간: ${(ms / 1000).toFixed(0)}초`);
  });
  window.api.onBanModeChanged((active) => {
    banMode = active;
    applyBanModeUI();
    showIndicator(active ? "차단 모드 ON" : "차단 모드 OFF");
  });
  window.api.onBanListChanged((payload) => {
    banSet = new Set(payload.list || []);
    if (payload.reason === "add" && payload.nickname) {
      showIndicator(`차단됨: ${payload.nickname}`);
      for (const entry of bubbles.slice()) {
        if (entry.nickname === payload.nickname) removeBubble(entry);
      }
    } else if (payload.reason === "clear") {
      showIndicator(`전체 차단 해제 (${payload.count}명)`);
    }
  });
  window.api.onChatHiddenChanged((hidden) => {
    document.body.classList.toggle("chat-hidden", hidden);
    showIndicator(hidden ? "채팅 숨김 ON" : "채팅 숨김 OFF");
  });
})();

// firebase listen
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const messagesQuery = query(
  ref(db, "rooms/main/messages"),
  limitToLast(MAX_VISIBLE),
);

let initialReplayDone = false;
setTimeout(() => { initialReplayDone = true; }, 500);

onChildAdded(messagesQuery, (snap) => {
  const m = snap.val();
  if (!m) return;
  const banned = !!(m.nickname && banSet.has(m.nickname));

  // log every live message (skip the initial replay of pre-session history)
  if (initialReplayDone) {
    window.api.logMessage({
      ts: m.ts ?? null,
      key: snap.key,
      nickname: m.nickname ?? "",
      text: m.text ?? "",
      colorIdx: m.colorIdx ?? 0,
      banned,
    });
  }

  if (banned) return; // filtered from display
  pushBubble(snap.key, m, initialReplayDone);
});

function pushBubble(key, m, animate) {
  if (bubbles.find((b) => b.key === key)) return; // safety: no dupes

  const el = document.createElement("div");
  el.className = "bubble";
  el.dataset.key = key;
  el.dataset.nickname = m.nickname ?? "";

  const nick = document.createElement("span");
  nick.className = "nickname";
  nick.textContent = m.nickname ?? "";
  const idx = ((m.colorIdx ?? 0) % PALETTE.length + PALETTE.length) % PALETTE.length;
  nick.style.color = PALETTE[idx];

  const text = document.createTextNode(m.text ?? "");
  el.appendChild(nick);
  el.appendChild(text);
  field.appendChild(el);

  // measure the rendered bubble, then choose a boundary-safe, non-overlapping spot
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const existing = bubbles.map((b) => b.rect).filter(Boolean);
  const { x, y } = pickPosition({
    vw: window.innerWidth,
    vh: window.innerHeight,
    w, h,
    existing,
  });
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;

  const entry = { key, nickname: m.nickname ?? "", el, timer: null, rect: { x, y, w, h } };
  bubbles.push(entry);

  // click-to-ban — only effective when ban mode is on (CSS controls pointer-events)
  el.addEventListener("click", () => {
    if (!banMode) return;
    if (!entry.nickname) return;
    window.api.requestBan(entry.nickname);
    removeBubble(entry); // immediate visual feedback; main fans the ban-list-changed event back
  });

  if (animate) {
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  } else {
    el.classList.add("in");
  }

  entry.timer = setTimeout(() => removeBubble(entry), fadeAfterMs);

  while (bubbles.length > MAX_VISIBLE) {
    removeBubble(bubbles[0]);
  }
}

function removeBubble(entry) {
  const idx = bubbles.indexOf(entry);
  if (idx === -1) return;
  bubbles.splice(idx, 1);
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  entry.el.classList.remove("in");
  entry.el.classList.add("out");
  setTimeout(() => entry.el.remove(), 300);
}
```

- [ ] **Step 2: Re-run the unit tests (placement module is now imported by the app too)**

Run: `cd apps/overlay && npm test`
Expected: PASS — `# pass 6`, `# fail 0` (confirms `placement.mjs` is still valid).

- [ ] **Step 3: Commit**

```bash
git add apps/overlay/renderer/app.js
git commit -m "feat(overlay): random floating placement, message logging, MAX_VISIBLE=12"
```

---

## Task 6: Manual verification + decisions log

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Launch the overlay and verify behavior**

Run: `cd apps/overlay && npm start`

Verify (overlay is click-through and transparent — watch the screen):
- Send messages from the phone app. Each bubble appears at a **different random spot**, fully on screen (none clipped at edges), and bubbles don't pile directly on top of each other when only a few are visible.
- Each bubble fades out after the float time.
- `Ctrl+]` / `Ctrl+[` change the float time (indicator shows "표시 시간: N초"); `Ctrl+=` / `Ctrl+-` change font size — both still work.
- The "● 구름" badge sits in the **top-left** and keeps pulsing.
- `Ctrl+Shift+H` hides bubbles but keeps the badge; `Ctrl+Shift+B` + click bans a nickname.
- `Ctrl+1`–`4` do nothing (corners removed) — confirm no crash.

- [ ] **Step 2: Verify the log file**

After sending a few messages, find the newest file under
`%APPDATA%\GuruemChatOverlay\logs\` (PowerShell):

Run: `Get-Content (Get-ChildItem "$env:APPDATA\GuruemChatOverlay\logs\*.jsonl" | Sort-Object LastWriteTime | Select-Object -Last 1) | ForEach-Object { $_ | ConvertFrom-Json }`
Expected: each line parses as JSON with `loggedAt`, `ts`, `key`, `nickname`, `text`, `colorIdx`, `banned`. No parse errors.

- [ ] **Step 3: Append the decisions-log entry to `CLAUDE.md`**

Add these lines at the end of the "Decisions log" list in `CLAUDE.md`:

```markdown
- **2026-06-04** — Placement changed from 4-corner stacking to **random floating**: each bubble appears at a random, boundary-safe `(x,y)` via pure module `apps/overlay/renderer/placement.mjs` (`pickPosition`, best-effort overlap avoidance, unit-tested with `node --test`). Removed `Ctrl+1–4` corner anchoring and the `position` config field. Status badge pinned **top-left**. `MAX_VISIBLE` raised `5 → 12`. Font-size (`Ctrl+=/-`) and float-time (`Ctrl+[ / ]`) hotkeys unchanged.
- **2026-06-04** — Chat history logged to a **per-session JSON Lines** file at `userData/logs/chat-YYYYMMDD-HHMMSS.jsonl` (one record per received message, including banned ones flagged `banned:true`). Renderer forwards live messages over the `log-message` IPC; main appends with `fs.appendFileSync`. Spec: `docs/superpowers/specs/2026-06-04-floating-chat-placement-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record floating-placement + chat-log decisions"
```

---

## Notes for the implementer

- **Run all commands from `apps/overlay/`** (that's where `package.json` lives).
- **No new npm dependencies** — `node:test` is built into Node 18+.
- `node --check` does not work on `app.js`/`placement.mjs` import resolution, but it validates `main.js` and `preload.js` (CommonJS). The renderer ESM is validated by `npm test` (placement) and `npm start` (full app).
- The Firebase `limitToLast(MAX_VISIBLE)` was `5`; raising it to `12` also widens the initial replay window — that's intentional and harmless (replayed messages are not logged and animate-in is suppressed for them).
