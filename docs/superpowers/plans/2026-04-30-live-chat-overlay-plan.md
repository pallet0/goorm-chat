# Live Chat Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Korean live-chat overlay system from `docs/superpowers/specs/2026-04-30-live-chat-overlay-design.md` — a phone web app that pushes chats to Firebase RTDB, plus a Windows Electron transparent always-on-top overlay that displays them on top of PowerPoint.

**Architecture:** Two static HTML apps (phone + overlay renderer) connected via Firebase Realtime Database. Electron main process owns the transparent fullscreen window, hotkeys, and per-user position config; renderer is an ES-module web app that listens to Firebase and animates message bubbles. No bundler.

**Tech Stack:** Vanilla HTML/CSS/JS · Firebase JS SDK 10 (CDN, modular) · Firebase Realtime Database · Firebase Hosting · Electron 31 · electron-builder (portable target).

**Budget note (4-hour MVP):** Strict TDD is suspended for this plan. The code surface is overwhelmingly UI/integration (DOM, Electron BrowserWindow, Firebase listeners) where unit tests give little value. Verification is the manual end-to-end test plan in spec §9, run during Tasks 4, 8, and 10.

---

## File map (target state at end of plan)

```
구름/
├── .gitignore                                  # Task 1
├── apps/
│   ├── phone/
│   │   ├── index.html                          # Task 2 step 2
│   │   ├── style.css                           # Task 2 step 3
│   │   ├── palette.js                          # Task 2 step 1
│   │   ├── app.js                              # Task 2 step 4
│   │   └── firebase-config.js                  # Task 3 (gitignored)
│   └── overlay/
│       ├── package.json                        # Task 5
│       ├── main.js                             # Task 6 step 1
│       ├── preload.js                          # Task 6 step 2
│       └── renderer/
│           ├── index.html                      # Task 7 step 1
│           ├── style.css                       # Task 7 step 2
│           ├── palette.js                      # Task 7 step 3
│           ├── app.js                          # Task 7 step 4
│           └── firebase-config.js              # Task 8 step 1 (gitignored)
├── firebase.json                               # Task 4 (generated)
└── .firebaserc                                 # Task 4 (generated)
```

`palette.js` is intentionally **duplicated** across `apps/phone/` and `apps/overlay/renderer/`. Each file is ~25 lines; sharing would require a bundler we explicitly chose not to introduce. A `// MIRROR:` comment at the top of each file makes the duplication obvious.

---

## Task 0: Verify Firebase prerequisites (user action)

**Files:** _(none — Firebase Console only)_

The user has stated "firebase is up". Verify these exist before writing any code:

- [ ] **Step 1: Confirm Firebase project + Web App registered.**
  Open <https://console.firebase.google.com> → select project → ⚙ **Project settings** → **General** → **Your apps** → there should be at least one **Web** app. If not, click **Add app** → `</>` and register with nickname `phone`.

- [ ] **Step 2: Confirm Realtime Database is created.**
  Left sidebar → **Build** → **Realtime Database**. If not created: click **Create Database**, region = closest (asia-southeast1 for Korea), **Start in test mode**.

- [ ] **Step 3: Paste the security rules.**
  Realtime Database → **Rules** tab → replace contents with:

  ```json
  {
    "rules": {
      "rooms": {
        "main": {
          "messages": {
            ".read": true,
            ".indexOn": ["ts"],
            "$msg": {
              ".write": "!data.exists() && newData.hasChildren(['nickname','text','ts','colorIdx'])",
              "nickname": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 24" },
              "text":     { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 200" },
              "ts":       { ".validate": "newData.val() === now" },
              "colorIdx": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 11" }
            }
          }
        }
      }
    }
  }
  ```

  Click **Publish**.

- [ ] **Step 4: Copy the `firebaseConfig` object.**
  ⚙ **Project settings** → **General** → scroll to **Your apps** → **SDK setup and configuration** → select **Config**. Copy the whole `firebaseConfig = { ... }` block — you'll paste it twice in Task 3 and Task 8.

  Confirm the config includes `databaseURL` (RTDB URL). If missing, the database wasn't created in Step 2.

---

## Task 1: Scaffold project + git init

**Files:**
- Create: `apps/phone/`
- Create: `apps/overlay/renderer/`
- Create: `docs/superpowers/plans/` (already exists, this file lives there)
- Create: `.gitignore`

- [ ] **Step 1: Create directories.**

  ```bash
  mkdir -p apps/phone
  mkdir -p apps/overlay/renderer
  ```

- [ ] **Step 2: Write `.gitignore`.**

  ```gitignore
  # dependencies
  node_modules/

  # build output
  dist/

  # firebase tooling
  .firebase/
  *-debug.log

  # secrets — Firebase Web SDK keys are not strictly secret (they're enforced by rules),
  # but keeping config files out of git lets the user reuse the repo across projects.
  **/firebase-config.js

  # brainstorm artifacts
  .superpowers/
  ```

- [ ] **Step 3: Initialize git and make the first commit.**

  ```bash
  git init
  git add CLAUDE.md docs/ .gitignore
  git commit -m "chore: initial scaffold (spec + plan + gitignore)"
  ```

  Expected output: `[main (root-commit) ...] chore: initial scaffold (spec + plan + gitignore)`.

---

## Task 2: Phone app — code (no Firebase yet)

**Files:**
- Create: `apps/phone/palette.js`
- Create: `apps/phone/index.html`
- Create: `apps/phone/style.css`
- Create: `apps/phone/app.js`

- [ ] **Step 1: `apps/phone/palette.js`.**

  ```js
  // MIRROR: keep this file identical to apps/overlay/renderer/palette.js.

  export const PALETTE = [
    "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF",
    "#B983FF", "#FF9F45", "#00C9A7", "#FF6F91",
    "#FCE38A", "#5BD5DE", "#C7F2A4", "#FFA1F5",
  ];

  // djb2 string hash — deterministic, fits in 32 bits, fine for color bucketing.
  export function djb2(s) {
    let h = 5381;
    const str = s.normalize("NFC");
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  export function colorIdxFor(nickname) {
    return djb2(nickname) % PALETTE.length;
  }
  ```

- [ ] **Step 2: `apps/phone/index.html`.**

  ```html
  <!DOCTYPE html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#0e0e10">
    <title>구름 라이브 채팅</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body>
    <main>
      <section id="nickname-screen" class="screen">
        <h1>닉네임을 입력하세요</h1>
        <form id="nickname-form" autocomplete="off">
          <input id="nickname-input" type="text" maxlength="24" placeholder="닉네임" required autofocus>
          <button type="submit">확인</button>
        </form>
      </section>

      <section id="message-screen" class="screen hidden">
        <header class="bar">
          <span id="current-nickname"></span>
          <button type="button" id="change-nickname" class="link">변경</button>
        </header>
        <form id="message-form" autocomplete="off">
          <textarea id="message-input" maxlength="200" placeholder="메시지를 입력하세요" rows="3" required></textarea>
          <button type="submit" id="send-button">보내기</button>
        </form>
      </section>

      <div id="toast" class="toast hidden" role="status" aria-live="polite"></div>
    </main>

    <script type="module" src="app.js"></script>
  </body>
  </html>
  ```

- [ ] **Step 3: `apps/phone/style.css`.**

  ```css
  :root {
    --bg: #0e0e10;
    --fg: #f5f5f7;
    --muted: #888;
    --accent: #4D96FF;
    --field: #1a1a1d;
    --border: #2a2a2e;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    height: 100%;
    background: var(--bg);
    color: var(--fg);
    font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR",
                 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    word-break: keep-all;
    overflow-wrap: break-word;
    -webkit-tap-highlight-color: transparent;
  }

  main {
    min-height: 100%;
    display: flex;
  }

  .screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: max(env(safe-area-inset-top, 16px), 24px)
             24px
             max(env(safe-area-inset-bottom, 16px), 24px);
    gap: 12px;
  }

  .screen.hidden, .toast.hidden { display: none; }

  /* nickname screen */
  #nickname-screen {
    justify-content: center;
    align-items: center;
    text-align: center;
  }
  #nickname-screen h1 {
    font-size: 22px;
    font-weight: 600;
    margin-bottom: 24px;
  }
  #nickname-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    max-width: 360px;
  }

  /* message screen */
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  #current-nickname {
    font-weight: 700;
    font-size: 16px;
  }
  #message-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
  }
  #message-input {
    flex: 1;
    min-height: 120px;
    font-size: 18px;
    resize: none;
  }

  /* shared inputs */
  input, textarea {
    font: inherit;
    background: var(--field);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    outline: none;
    width: 100%;
  }
  input:focus, textarea:focus { border-color: var(--accent); }

  button {
    font: inherit;
    font-weight: 600;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 14px 16px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  button:disabled { opacity: 0.5; }

  button.link {
    background: none;
    color: var(--muted);
    font-weight: 400;
    font-size: 14px;
    padding: 8px;
  }

  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.85);
    color: #fff;
    padding: 10px 18px;
    border-radius: 999px;
    font-size: 14px;
    pointer-events: none;
  }
  ```

- [ ] **Step 4: `apps/phone/app.js`.**

  ```js
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import {
    getDatabase, ref, push, serverTimestamp,
  } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
  import { firebaseConfig } from "./firebase-config.js";
  import { PALETTE, colorIdxFor } from "./palette.js";

  const STORAGE_KEY = "chat.nickname";
  const COOLDOWN_MS = 2000;

  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const messagesRef = ref(db, "rooms/main/messages");

  const els = {
    nickScreen: document.getElementById("nickname-screen"),
    msgScreen:  document.getElementById("message-screen"),
    nickForm:   document.getElementById("nickname-form"),
    nickInput:  document.getElementById("nickname-input"),
    msgForm:    document.getElementById("message-form"),
    msgInput:   document.getElementById("message-input"),
    sendBtn:    document.getElementById("send-button"),
    current:    document.getElementById("current-nickname"),
    changeBtn:  document.getElementById("change-nickname"),
    toast:      document.getElementById("toast"),
  };

  let nickname = (localStorage.getItem(STORAGE_KEY) || "").trim();
  let cooldown = false;

  function showScreen(which) {
    els.nickScreen.classList.toggle("hidden", which !== "nick");
    els.msgScreen.classList.toggle("hidden",  which !== "msg");
    if (which === "msg") {
      els.current.textContent = nickname;
      els.current.style.color = PALETTE[colorIdxFor(nickname)];
      els.msgInput.focus();
    } else {
      els.nickInput.focus();
    }
  }

  function showToast(text) {
    els.toast.textContent = text;
    els.toast.classList.remove("hidden");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => els.toast.classList.add("hidden"), 1500);
  }

  // initial route
  if (nickname.length >= 1 && nickname.length <= 24) {
    showScreen("msg");
  } else {
    nickname = "";
    showScreen("nick");
  }

  // nickname submit
  els.nickForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = els.nickInput.value.normalize("NFC").trim();
    if (v.length < 1 || v.length > 24) return;
    nickname = v;
    localStorage.setItem(STORAGE_KEY, nickname);
    showScreen("msg");
  });

  // change nickname
  els.changeBtn.addEventListener("click", () => {
    nickname = "";
    localStorage.removeItem(STORAGE_KEY);
    els.nickInput.value = "";
    showScreen("nick");
  });

  // message submit
  els.msgForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (cooldown) return;
    const text = els.msgInput.value.normalize("NFC").trim();
    if (text.length < 1 || text.length > 200) return;
    cooldown = true;
    els.sendBtn.disabled = true;
    try {
      await push(messagesRef, {
        nickname,
        text,
        ts: serverTimestamp(),
        colorIdx: colorIdxFor(nickname),
      });
      els.msgInput.value = "";
      els.msgInput.style.height = "auto";
      showToast("전송됨");
    } catch (err) {
      console.error(err);
      showToast("전송 실패");
    } finally {
      setTimeout(() => {
        cooldown = false;
        els.sendBtn.disabled = false;
      }, COOLDOWN_MS);
    }
  });

  // textarea auto-grow up to 200px
  els.msgInput.addEventListener("input", () => {
    els.msgInput.style.height = "auto";
    els.msgInput.style.height = Math.min(els.msgInput.scrollHeight, 200) + "px";
  });
  ```

- [ ] **Step 5: Commit.**

  ```bash
  git add apps/phone
  git commit -m "feat(phone): static UI + send-message flow (no Firebase config yet)"
  ```

---

## Task 3: Phone app — paste Firebase config + local smoke test

**Files:**
- Create: `apps/phone/firebase-config.js` (NOT committed — gitignored)

- [ ] **Step 1: Write `apps/phone/firebase-config.js` with the user's real config.**

  Paste the `firebaseConfig` object from Task 0 step 4 into this file:

  ```js
  // Firebase Web SDK config — do not commit (gitignored).
  export const firebaseConfig = {
    apiKey:            "REPLACE_WITH_YOURS",
    authDomain:        "REPLACE_WITH_YOURS",
    databaseURL:       "REPLACE_WITH_YOURS",
    projectId:         "REPLACE_WITH_YOURS",
    storageBucket:     "REPLACE_WITH_YOURS",
    messagingSenderId: "REPLACE_WITH_YOURS",
    appId:             "REPLACE_WITH_YOURS",
  };
  ```

  All seven `REPLACE_WITH_YOURS` strings must be replaced. `databaseURL` is mandatory (RTDB-specific).

- [ ] **Step 2: Serve the phone app on the local network.**

  From the repo root, in a fresh terminal:

  ```bash
  npx --yes http-server apps/phone -p 8080 --cors -a 0.0.0.0
  ```

  Note your machine's LAN IP (`ipconfig` on Windows). Open `http://<LAN-IP>:8080` on a phone connected to the same Wi-Fi.

- [ ] **Step 3: Manual smoke test.**

  - On the phone: nickname `테스트`, message `안녕하세요`. Tap **보내기**.
  - Toast `전송됨` should appear within 1 s.
  - In the Firebase console → Realtime Database → Data, verify a new child appeared under `/rooms/main/messages/<auto-id>` with `nickname: "테스트"`, `text: "안녕하세요"`, `colorIdx: 0..11`, `ts: <number>`.
  - If write fails: open DevTools (Chrome remote inspect for the phone, or test on desktop browser first), check console for permission-denied → re-check Task 0 step 3 rules.

- [ ] **Step 4: Stop the local server.**

  Ctrl-C the http-server terminal. (Nothing to commit — `firebase-config.js` is gitignored.)

---

## Task 4: Phone app — deploy to Firebase Hosting

**Files:**
- Create: `firebase.json` (generated by CLI)
- Create: `.firebaserc` (generated by CLI)

- [ ] **Step 1: Install the Firebase CLI globally (if not already).**

  ```bash
  npm install -g firebase-tools
  firebase --version
  ```

  Expected: a version like `13.x.x` or higher.

- [ ] **Step 2: Log in.**

  ```bash
  firebase login
  ```

  Browser opens; sign in with the Google account that owns the Firebase project.

- [ ] **Step 3: Initialize Hosting.**

  From the repo root:

  ```bash
  firebase init hosting
  ```

  Answers:
  - **Use an existing project** → pick the project from Task 0.
  - **What do you want to use as your public directory?** → `apps/phone`
  - **Configure as a single-page app (rewrite all urls to /index.html)?** → **No**
  - **Set up automatic builds and deploys with GitHub?** → **No**
  - **File apps/phone/index.html already exists. Overwrite?** → **No**

  This creates `firebase.json` and `.firebaserc` at the repo root.

- [ ] **Step 4: Patch `firebase.json` to ignore the gitignored config file from deploy.**

  The default `firebase.json` deploys everything in `apps/phone`. We want `firebase-config.js` to ship to Hosting (the phone needs it!) but to **NOT** ship the brainstorm folder or any `node_modules` if they end up there. Confirm `firebase.json` looks like:

  ```json
  {
    "hosting": {
      "public": "apps/phone",
      "ignore": [
        "firebase.json",
        "**/.*",
        "**/node_modules/**"
      ]
    }
  }
  ```

  If the CLI generated something different, replace with the above.

- [ ] **Step 5: Deploy.**

  ```bash
  firebase deploy --only hosting
  ```

  Look for `Hosting URL: https://<project-id>.web.app` at the end.

- [ ] **Step 6: Verify deployed app.**

  Open the printed URL on a phone. Repeat the Task 3 step 3 smoke test against the live URL. Verify a new message appears in the Firebase console.

- [ ] **Step 7: Commit.**

  ```bash
  git add firebase.json .firebaserc
  git commit -m "chore: firebase hosting init for phone app"
  ```

---

## Task 5: Overlay — package.json + npm install

**Files:**
- Create: `apps/overlay/package.json`

- [ ] **Step 1: Write `apps/overlay/package.json`.**

  ```json
  {
    "name": "guruem-chat-overlay",
    "version": "0.1.0",
    "description": "Transparent always-on-top chat overlay for 구름 club presentations.",
    "main": "main.js",
    "scripts": {
      "start": "electron .",
      "dist": "electron-builder --win portable"
    },
    "build": {
      "appId": "club.guruem.chat-overlay",
      "productName": "GuruemChatOverlay",
      "directories": { "output": "dist" },
      "win": {
        "target": [{ "target": "portable", "arch": ["x64"] }]
      },
      "files": [
        "main.js",
        "preload.js",
        "renderer/**/*",
        "package.json"
      ]
    },
    "devDependencies": {
      "electron": "^31.0.0",
      "electron-builder": "^24.13.0"
    }
  }
  ```

- [ ] **Step 2: Install dependencies.**

  ```bash
  cd apps/overlay
  npm install
  ```

  Expected: `node_modules/` populated, no errors. Electron download is ~80 MB; on slow networks this can take a couple of minutes. Stay in `apps/overlay/` for the rest of Tasks 5–9.

- [ ] **Step 3: Commit.**

  ```bash
  git add apps/overlay/package.json apps/overlay/package-lock.json
  git commit -m "chore(overlay): bootstrap electron app"
  ```

---

## Task 6: Overlay — main.js + preload.js + transparent-window smoke test

**Files:**
- Create: `apps/overlay/main.js`
- Create: `apps/overlay/preload.js`

- [ ] **Step 1: `apps/overlay/main.js`.**

  ```js
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
      // first run, default
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

    win.loadFile(path.join(__dirname, "renderer", "index.html"));

    // Hide from Alt-Tab
    win.setSkipTaskbar(true);
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
  ```

- [ ] **Step 2: `apps/overlay/preload.js`.**

  ```js
  const { contextBridge, ipcRenderer } = require("electron");

  contextBridge.exposeInMainWorld("api", {
    getPosition: () => ipcRenderer.invoke("get-position"),
    onPositionChanged: (cb) =>
      ipcRenderer.on("position-changed", (_event, pos) => cb(pos)),
  });
  ```

- [ ] **Step 3: Add a temporary placeholder renderer for the smoke test.**

  We don't have the real renderer yet. Write a stub so `npm start` doesn't 404:

  `apps/overlay/renderer/index.html`:

  ```html
  <!DOCTYPE html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8">
    <title>Smoke</title>
    <style>
      html, body { width: 100%; height: 100%; margin: 0; background: transparent !important; overflow: hidden; }
      .marker {
        position: absolute; bottom: 24px; left: 24px;
        background: rgba(0,0,0,0.75); color: #fff;
        padding: 12px 16px; border-radius: 12px; font-size: 28px;
        font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
      }
    </style>
  </head>
  <body>
    <div class="marker">스모크 테스트 (Ctrl+Shift+Q to quit)</div>
  </body>
  </html>
  ```

- [ ] **Step 4: Smoke test.**

  ```bash
  npm start
  ```

  Expected:
  - A fullscreen transparent window appears.
  - The "스모크 테스트 (Ctrl+Shift+Q to quit)" bubble is visible at the bottom-left corner.
  - The desktop, taskbar, and any open windows are visible THROUGH the rest of the overlay.
  - Mouse clicks **pass through** the transparent area — clicking through the overlay onto a desktop icon should select that icon, not the overlay.
  - `Ctrl+Shift+H` hides/shows the overlay.
  - `Ctrl+Shift+Q` quits the app cleanly.

  If the overlay is opaque white instead of transparent: open the Windows display settings and check that hardware acceleration is on; on some integrated GPUs, also pass `app.disableHardwareAcceleration()` at the top of `main.js`.

  If clicks DO NOT pass through: confirm the `setIgnoreMouseEvents(true, { forward: true })` line ran (add `console.log("clickthrough on")` after it temporarily). Also try removing `focusable: false` if Windows complains.

- [ ] **Step 5: Commit.**

  ```bash
  git add apps/overlay/main.js apps/overlay/preload.js apps/overlay/renderer/index.html
  git commit -m "feat(overlay): transparent click-through window + smoke renderer"
  ```

---

## Task 7: Overlay — renderer (replaces the smoke stub)

**Files:**
- Modify: `apps/overlay/renderer/index.html` (replace the smoke marker)
- Create: `apps/overlay/renderer/style.css`
- Create: `apps/overlay/renderer/palette.js`
- Create: `apps/overlay/renderer/app.js`

- [ ] **Step 1: Replace `apps/overlay/renderer/index.html`.**

  ```html
  <!DOCTYPE html>
  <html lang="ko">
  <head>
    <meta charset="UTF-8">
    <title>Chat Overlay</title>
    <link rel="stylesheet" href="style.css">
  </head>
  <body>
    <div id="stack" class="BL"></div>
    <script type="module" src="app.js"></script>
  </body>
  </html>
  ```

- [ ] **Step 2: `apps/overlay/renderer/style.css`.**

  ```css
  :root {
    --bubble-bg: rgba(0, 0, 0, 0.75);
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

  /* anchored stack */
  #stack {
    position: fixed;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 32px;
    max-width: 50%;
    pointer-events: none;
  }

  /* corners — bottom-anchored corners flip column direction so newest is at the anchor */
  #stack.TL { top: 0;    left: 0;  align-items: flex-start; flex-direction: column; }
  #stack.TR { top: 0;    right: 0; align-items: flex-end;   flex-direction: column; }
  #stack.BL { bottom: 0; left: 0;  align-items: flex-start; flex-direction: column-reverse; }
  #stack.BR { bottom: 0; right: 0; align-items: flex-end;   flex-direction: column-reverse; }

  .bubble {
    background: var(--bubble-bg);
    color: #fff;
    border-radius: 12px;
    padding: 12px 16px;
    font-size: 28px;
    line-height: 1.3;
    max-width: 100%;
    text-shadow: 0 1px 2px rgba(0,0,0,0.6);
    opacity: 0;
    transition: opacity 200ms ease-out, transform 200ms ease-out;
  }

  /* enter direction depends on which corner we're anchored to */
  #stack.BL .bubble, #stack.BR .bubble { transform: translateY(40px); }
  #stack.TL .bubble, #stack.TR .bubble { transform: translateY(-40px); }

  .bubble.in {
    opacity: 1;
    transform: translateY(0);
  }

  /* exit — slide opposite direction with a faster ease */
  .bubble.out {
    opacity: 0;
    transition: opacity 300ms ease-in, transform 300ms ease-in;
  }
  #stack.BL .bubble.out, #stack.BR .bubble.out { transform: translateY(-20px); }
  #stack.TL .bubble.out, #stack.TR .bubble.out { transform: translateY(20px); }

  .nickname {
    font-weight: 700;
    margin-right: 8px;
  }
  ```

- [ ] **Step 3: `apps/overlay/renderer/palette.js`.**

  ```js
  // MIRROR: keep this file identical to apps/phone/palette.js.

  export const PALETTE = [
    "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF",
    "#B983FF", "#FF9F45", "#00C9A7", "#FF6F91",
    "#FCE38A", "#5BD5DE", "#C7F2A4", "#FFA1F5",
  ];

  export function djb2(s) {
    let h = 5381;
    const str = s.normalize("NFC");
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  export function colorIdxFor(nickname) {
    return djb2(nickname) % PALETTE.length;
  }
  ```

- [ ] **Step 4: `apps/overlay/renderer/app.js`.**

  ```js
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import {
    getDatabase, ref, query, limitToLast, onChildAdded,
  } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
  import { firebaseConfig } from "./firebase-config.js";
  import { PALETTE } from "./palette.js";

  const MAX_VISIBLE = 5;
  const FADE_AFTER_MS = 8000;

  const stack = document.getElementById("stack");
  const bubbles = []; // { key, el, timer } — newest pushed last

  // 1) sync stack class from saved position, listen for hotkey changes
  (async function applyPosition() {
    try {
      const pos = await window.api.getPosition();
      setStackClass(pos);
    } catch (e) {
      console.error("getPosition failed, defaulting to BL", e);
      setStackClass("BL");
    }
    window.api.onPositionChanged((pos) => setStackClass(pos));
  })();

  function setStackClass(pos) {
    stack.classList.remove("TL", "TR", "BL", "BR");
    stack.classList.add(pos);
  }

  // 2) firebase listen
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const messagesQuery = query(
    ref(db, "rooms/main/messages"),
    limitToLast(MAX_VISIBLE),
  );

  let initialReplayDone = false;
  // Flip the flag after the initial burst so subsequent child_added fires animate.
  setTimeout(() => { initialReplayDone = true; }, 500);

  onChildAdded(messagesQuery, (snap) => {
    const m = snap.val();
    if (!m) return;
    pushBubble(snap.key, m, /* animate */ initialReplayDone);
  });

  // 3) bubble lifecycle
  function pushBubble(key, m, animate) {
    if (bubbles.find((b) => b.key === key)) return; // safety: no dupes

    const el = document.createElement("div");
    el.className = "bubble";
    el.dataset.key = key;

    const nick = document.createElement("span");
    nick.className = "nickname";
    nick.textContent = m.nickname ?? "";
    nick.style.color = PALETTE[((m.colorIdx ?? 0) % PALETTE.length + PALETTE.length) % PALETTE.length];

    const text = document.createTextNode(m.text ?? "");

    el.appendChild(nick);
    el.appendChild(text);
    stack.appendChild(el);

    const entry = { key, el, timer: null };
    bubbles.push(entry);

    // animate in (or appear instantly during initial replay)
    if (animate) {
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
    } else {
      el.classList.add("in");
    }

    // schedule fade-out
    entry.timer = setTimeout(() => removeBubble(entry), FADE_AFTER_MS);

    // bump older bubbles when over capacity
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

- [ ] **Step 5: Commit.**

  ```bash
  git add apps/overlay/renderer
  git commit -m "feat(overlay): renderer — bubble lifecycle, corner anchoring, palette"
  ```

---

## Task 8: Overlay — Firebase config + end-to-end test

**Files:**
- Create: `apps/overlay/renderer/firebase-config.js` (gitignored)

- [ ] **Step 1: Write `apps/overlay/renderer/firebase-config.js`.**

  Identical content to `apps/phone/firebase-config.js` (Task 3 step 1):

  ```js
  // Firebase Web SDK config — do not commit (gitignored).
  export const firebaseConfig = {
    apiKey:            "REPLACE_WITH_YOURS",
    authDomain:        "REPLACE_WITH_YOURS",
    databaseURL:       "REPLACE_WITH_YOURS",
    projectId:         "REPLACE_WITH_YOURS",
    storageBucket:     "REPLACE_WITH_YOURS",
    messagingSenderId: "REPLACE_WITH_YOURS",
    appId:             "REPLACE_WITH_YOURS",
  };
  ```

  Replace placeholders with the same values you pasted in Task 3 step 1.

- [ ] **Step 2: Run the overlay.**

  From `apps/overlay/`:

  ```bash
  npm start
  ```

  Window appears (mostly invisible — that's correct). Any historical messages from earlier smoke tests show up at the bottom-left corner without animation (initial replay).

- [ ] **Step 3: End-to-end test (spec §9 items 2–6, 8–11).**

  - From a phone or desktop browser, open the deployed Hosting URL (Task 4 step 5).
  - Send `안녕하세요!` — bubble appears at bottom-left within ~1 s, animates in. ✅ spec test #2.
  - Send 7 messages rapidly — only 5 visible at any time; oldest fades when 6th arrives. ✅ spec test #3.
  - Press `Ctrl+1` → bubbles re-anchor to top-left. `Ctrl+2` → top-right. `Ctrl+3` → bottom-left. `Ctrl+4` → bottom-right. ✅ spec test #4.
  - Send the same nickname twice → identical color. Different nickname → different color. ✅ spec test #5.
  - Send a 200-char message → bubble wraps inside max-width, no overflow. ✅ spec test #6.
  - Send `""` and a 201-char message → both rejected client-side (no toast, no Firebase write). ✅ spec test #7.
  - Refresh phone tab → nickname persists. ✅ spec test #8.
  - `Ctrl+Shift+H` → overlay hides; press again → returns. ✅ spec test #9.
  - `Ctrl+Shift+Q` → overlay quits cleanly. ✅ spec test #10.
  - Send Korean nickname `동아리회장` and Korean text — no missing-glyph boxes; Korean wraps on word boundaries. ✅ spec test #11.

- [ ] **Step 4: Persistence check.**

  Quit overlay (`Ctrl+Shift+Q`). Re-launch (`npm start`). Position should be remembered (whatever you last set with `Ctrl+1..4`). Verify by sending one new message — bubble appears at the saved corner.

- [ ] **Step 5: If anything fails, fix before moving on. No commit needed (config file is gitignored).**

---

## Task 9: Overlay — build the portable .exe

**Files:**
- Generated: `apps/overlay/dist/GuruemChatOverlay <version>.exe`

- [ ] **Step 1: Run the production build.**

  From `apps/overlay/`:

  ```bash
  npm run dist
  ```

  Build takes ~2–3 min. Output appears in `apps/overlay/dist/`. The portable executable is named like `GuruemChatOverlay 0.1.0.exe`.

- [ ] **Step 2: Verify the .exe runs standalone.**

  Double-click the `.exe`. The transparent overlay window should appear identically to `npm start`. Send a test message from the phone to verify. Quit with `Ctrl+Shift+Q`.

  If Windows SmartScreen blocks: **More info → Run anyway** (binary is unsigned).

- [ ] **Step 3: Copy to USB / location of your choice.**

  This single `.exe` is the entire deliverable for the presenter PC — no install, no admin rights, no `node_modules`. The Firebase config is bundled inside (note: `apiKey` is a Web SDK key, not a secret; access is enforced by RTDB rules).

- [ ] **Step 4: Commit (the build script, not the dist output).**

  ```bash
  git add apps/overlay/package.json apps/overlay/package-lock.json
  git commit --allow-empty -m "build(overlay): portable .exe verified"
  ```

  (`--allow-empty` lets us record the milestone even if no files changed since Task 5's commit. Skip `--allow-empty` if package files actually changed.)

---

## Task 10: Final integration — PowerPoint slideshow

**Files:** _(none — runtime test on real hardware)_

- [ ] **Step 1: Pre-flight.**

  - Confirm presenter laptop is the one that will be used at the venue.
  - Confirm projector / TV connection is **mirrored** (Win+P → Duplicate). Not extended.

- [ ] **Step 2: Launch in presentation order.**

  1. Run `GuruemChatOverlay <version>.exe`. (Window invisible until first message — expected.)
  2. Open PowerPoint. **Slideshow → From Beginning** (`F5`).
  3. Confirm the first slide displays cleanly.
  4. From a phone, open the Hosting URL and send a test message.
  5. Bubble should appear in the configured corner of the projected display.

- [ ] **Step 3: Click-through during slideshow.**

  - Click on the slide area (away from the overlay corner). PowerPoint advances. ✅ confirms click-through works.
  - Click on the overlay's bubble area. Click should still pass through to PowerPoint (PowerPoint advances). ✅ confirms `setIgnoreMouseEvents` is alive in fullscreen.

- [ ] **Step 4: Hotkeys during slideshow.**

  - `Ctrl+1/2/3/4` — bubbles re-anchor live without exiting slideshow. ✅
  - `Ctrl+Shift+H` — bubbles disappear, slideshow continues. Press again — bubbles return. ✅

- [ ] **Step 5: Capacity stress test on the slideshow.**

  Have a friend send 10 messages in 5 seconds while you advance slides. Verify:
  - Only 5 bubbles visible at any time.
  - Slide animations are not blocked.
  - Overlay framerate stays smooth (no obvious stutter).

- [ ] **Step 6: End cleanly.**

  - `Ctrl+Shift+Q` — overlay quits.
  - `Esc` — PowerPoint exits slideshow.

- [ ] **Step 7: Take the win.**

  Show the audience the QR / URL on slide 1, click into slideshow, and let the room start chatting.

---

## Self-review notes

(Recording the writer's check, not requesting another review pass.)

**Spec coverage check:** every requirement in spec §1.1, §4–§7, §9 maps to at least one task —

- §1.1 (Korean) → Tasks 2, 7 (font stacks); Task 8 step 3 (Korean test).
- §4 (data model) → Task 2 step 4 (write shape) and Task 7 step 4 (read shape) match the spec's keys exactly.
- §4 (rules) → Task 0 step 3.
- §5 (palette) → Tasks 2, 7 (mirrored constant + djb2).
- §6.1 UI flow → Task 2 (HTML/CSS/JS).
- §6.2 files → Tasks 2, 3.
- §7.1 window properties → Task 6 step 1 (every flag from the spec is set).
- §7.2 renderer behavior → Task 7 step 4 (`limitToLast(5)`, `child_added`, `initialReplayDone`).
- §7.3 animation → Task 7 step 2 (CSS transitions match 200/300 ms).
- §7.4 position handling → Task 6 step 1 (`globalShortcut`, `userData/config.json`, default BL).
- §7.5 hotkeys (`Ctrl+Shift+Q`, `Ctrl+Shift+H`) → Task 6 step 1.
- §7.6 bubble visual → Task 7 step 2 (rgba black 0.75, radius 12, padding 12×16, font 28 px, max-width 100% of stack which is 50% of screen).
- §7.7 files → Tasks 5–8.
- §7.10 day-of run sequence → Task 10.
- §9 test plan → Tasks 3 step 3, 8 step 3, 10.

**Type / name consistency:** field names (`nickname`, `text`, `ts`, `colorIdx`) match in Tasks 2, 3, 7, 8 and the spec rules. `setPosition`/`get-position`/`position-changed` IPC names consistent across Task 6 main, Task 6 preload, and Task 7 renderer. The `PALETTE` array literal is byte-identical in Task 2 step 1 and Task 7 step 3.

**Placeholders:** none. Every "REPLACE_WITH_YOURS" is part of a config file the user explicitly fills in during Task 3 step 1 / Task 8 step 1, with exact instructions.
