# Live Chat Overlay — Design Spec

**Date:** 2026-04-30
**Project:** 구름 (university club presentation tool)
**Budget:** ≈ 4 hours from spec approval to live demo

## 1. Goal

A two-piece system that lets the audience send chat messages from their phones, displayed live on top of the presenter's PowerPoint slides.

- **Phone web app** — audience opens a URL, types a nickname once, then sends chat messages.
- **Presenter overlay app** — transparent always-on-top window on a Windows PC, showing the chat feed on top of PowerPoint's fullscreen slideshow.
- **Single-monitor mirrored projection** — what the presenter sees is what the projector shows, so the whole room sees their own chat appear on the slides ("wall of chat" / Twitch energy).

### 1.1 UI language (한국어)

All user-facing copy on **both** apps is **Korean**. Both apps must render Korean text correctly with no missing-glyph boxes (□) on:

- Korean Android & iOS phones (system fonts cover this).
- Windows 10 / 11 (Malgun Gothic / 맑은 고딕 is preinstalled and used by Chromium-based Electron by default).

Shared CSS font stack (used in `apps/phone/style.css` and `apps/overlay/renderer/style.css`):

```css
font-family:
  "Malgun Gothic",            /* Windows preinstalled Korean */
  "Apple SD Gothic Neo",      /* macOS / iOS preinstalled Korean */
  "Noto Sans KR",             /* Linux + general fallback */
  -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
word-break: keep-all;          /* don't break mid-Korean-syllable */
overflow-wrap: break-word;     /* still wrap when a token is too long */
```

No web font is downloaded — system fonts are sufficient and avoid the network/blocking-render cost. Upgrade to Pretendard via CDN is a v2 polish step, not in tonight's scope.

## 2. Non-goals (locked out for v1)

- Per-session join codes (one hardcoded room).
- Moderation UI on the overlay (messages still saved in Firebase; can be wiped from the console).
- Archive viewer for past sessions (data persists, but no UI yet — v2).
- Reactions, polls, upvoted Q&A.
- macOS / Linux builds.
- Cross-browser hardening beyond mobile Chrome and Safari (latest).

## 3. Architecture

```
┌────────────┐  HTTPS write  ┌────────────────────┐  WS listen   ┌──────────────────┐
│  Phone     │ ────────────▶ │ Firebase           │ ◀─────────── │ Electron overlay │
│  web app   │               │ Realtime DB        │              │ (transparent,    │
│ (Hosting)  │               │ /rooms/main/...    │              │  always-on-top,  │
│            │               │                    │              │  click-through)  │
└────────────┘               └────────────────────┘              └──────────────────┘
       phones                       cloud                           presenter PC
```

Three components, one cloud DB. **No backend code anywhere** — Firebase rules enforce shape; rate limiting is client-side only.

## 4. Data model

Path: `/rooms/main/messages/<auto-push-id>`

```jsonc
{
  "nickname": "string, 1..24 chars",
  "text":     "string, 1..200 chars",
  "ts":       1714478400000,  // serverTimestamp(), millis
  "colorIdx": 4               // 0..11, palette index
}
```

`colorIdx` is computed on the phone before write: `djb2(nickname) % 12`. Same nickname always produces the same color. The overlay just reads `colorIdx` and indexes into the same palette.

### Firebase Realtime DB security rules

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

Permissive read (anyone can listen — fine for a live chat) and append-only writes with shape validation. No update / delete from clients. Test mode (open rules) is acceptable for tonight; tighten in v2 if reused.

## 5. Color palette

12 vibrant colors that read well on the dark message bubble:

```
#FF6B6B  #FFD93D  #6BCB77  #4D96FF  #B983FF  #FF9F45
#00C9A7  #FF6F91  #FCE38A  #5BD5DE  #C7F2A4  #FFA1F5
```

```js
function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
const colorIdx = djb2(nickname.normalize('NFC')) % 12;
```

## 6. Phone app

### 6.1 UI flow

1. **First visit:** centered card with `<input>` for "닉네임" + "확인" button. On submit, NFC-normalize, trim, validate (1..24 chars), save to `localStorage` under key `chat.nickname`, transition to step 2.
2. **Message screen:**
   - Top bar: current nickname (in its assigned palette color) + tiny "변경" link.
   - Centered: auto-growing `<textarea>` (max 4 visible lines), placeholder "메시지를 입력하세요".
   - Below: "보내기" button (disabled while empty / sending / cooling down).
3. **On send:** trim, validate (1..200 chars), push to RTDB with `serverTimestamp()` for `ts`, clear textarea, briefly show "전송됨" toast, then disable the send button for 2 s (client-side rate limit).
4. **Returning user:** skip step 1 (nickname already in localStorage).
5. **"변경" link:** clears nickname, returns to step 1.

### 6.2 Files

```
apps/phone/
  index.html       # markup, links to firebase JS SDK + app.js + style.css
  app.js           # state machine, validation, firebase write
  style.css        # mobile-first; large tap targets; safe-area insets
  firebase-config.js   # exports the firebaseConfig object
```

### 6.3 Phone app — how to set up & deploy

These steps assume Node.js is installed (`node --version` returns v18+; v22 confirmed on this machine).

**A. Create the Firebase project (~5 min)**

1. Open <https://console.firebase.google.com> and sign in with the same Google account you'll use for deploys.
2. Click **Add project**. Name: e.g. `guruem-chat`. Disable Google Analytics (we don't need it). Click **Create project**, then **Continue** when ready.
3. On the project home page, click the **`</>`** (Web) icon to register a Web App.
   - App nickname: `phone`.
   - Do **NOT** check "Also set up Firebase Hosting" here — we'll do that from the CLI.
   - Click **Register app**.
4. **Copy the entire `firebaseConfig` object that appears.** Looks like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "...firebaseapp.com",
     databaseURL: "https://...firebaseio.com",  // <-- needed!
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
   Save it for step 6.
5. Click **Continue to console**.
6. Left sidebar → **Build** → **Realtime Database** → **Create Database**.
   - Region: closest to Korea (e.g., `asia-southeast1`). Click **Next**.
   - Security rules: choose **Start in test mode** (open for 30 days). We'll paste the proper rules in step 7. Click **Enable**.
7. In the database view, click the **Rules** tab. Paste the rules from §4 above. Click **Publish**.
8. Note the database URL at the top of the **Data** tab — looks like `https://<project>-default-rtdb.<region>.firebasedatabase.app/`. Confirm it matches `databaseURL` in your config object.
9. Paste the `firebaseConfig` object into both:
   - `apps/phone/firebase-config.js`
   - `apps/overlay/renderer/firebase-config.js`

**B. Deploy the phone app to Firebase Hosting (~5 min)**

1. Install the Firebase CLI globally (one-time): `npm install -g firebase-tools`. (Or skip global with `npx firebase-tools <cmd>` everywhere.)
2. From the repo root: `firebase login`. Browser opens; sign in.
3. `firebase init hosting` — answer prompts:
   - **Use an existing project** → pick the one created above.
   - **What do you want to use as your public directory?** → `apps/phone`
   - **Configure as a single-page app?** → **No**
   - **Set up automatic builds and deploys with GitHub?** → No
   - **File apps/phone/index.html already exists. Overwrite?** → **No** (keep ours)
4. `firebase deploy --only hosting` — URL printed at the end (e.g., `https://guruem-chat.web.app`). Open it on a phone. Test sending a message.

**C. (Optional) Generate a QR code for the audience**

- Use any free QR generator (e.g., `qrserver.com/v1/create-qr-code/?data=<URL>`). Embed the resulting PNG in the title slide of the deck.

## 7. Overlay app (Electron)

### 7.1 Window properties

```js
const win = new BrowserWindow({
  transparent: true,
  frame: false,
  hasShadow: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  fullscreen: true,
  resizable: false,
  movable: false,
  focusable: false,        // helps PowerPoint keep keyboard focus
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    preload: path.join(__dirname, 'preload.js')
  }
});
win.setAlwaysOnTop(true, 'screen-saver');
win.setIgnoreMouseEvents(true, { forward: true });   // click-through
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
```

The combination of `transparent`, `frame: false`, `setAlwaysOnTop('screen-saver')`, and `setIgnoreMouseEvents` lets the window sit on top of PowerPoint's fullscreen Slideshow without stealing focus or blocking clicks.

### 7.2 Renderer behavior

- On load: read the palette + position config (passed via preload).
- Subscribe to `/rooms/main/messages` ordered by `ts`, **`limitToLast(5)`**, listen for `child_added`.
- On `child_added`: render a new bubble anchored at the configured corner, animate it in.
- A bubble disappears in either of two ways:
  - **8 s timeout** since arrival (set on render).
  - **Bumped:** when a 6th bubble arrives, the oldest is removed early.
- Initial load: when subscribing, RTDB will replay up to the last 5 historical messages with `child_added` events. We track an `initialReplayDone` flag (set to `true` on the first `value` event after subscription) and **skip the entry animation** for messages received before the flag flips, so the overlay starts populated without a flurry of slide-ins.

### 7.3 Bubble animation

- **In:** `transform: translateY(+40px)` → `translateY(0)`, `opacity: 0` → `1`, 200 ms ease-out.
- **Out:** `opacity: 1` → `0`, `transform: translateY(-20px)`, 300 ms ease-in.
- For top-anchored corners (TL/TR), invert the Y deltas (slide down, fade up).

### 7.4 Position handling

- `Ctrl+1` = TL, `Ctrl+2` = TR, `Ctrl+3` = BL, `Ctrl+4` = BR.
- Registered in main process via `globalShortcut`.
- Persisted to `app.getPath('userData')/config.json` as `{ "position": "BL" }`.
- Default at first launch: **BL** (bottom-left).
- IPC: when a hotkey fires, main sends `position-changed` to the renderer; renderer re-anchors with a 150 ms cross-fade.

### 7.5 Other hotkeys

- `Ctrl+=` / `Ctrl+-` — adjust bubble font size by ±2 px (range 16–64 px, default 28). Also `Ctrl+NumPad+` / `Ctrl+NumPad-` as numpad fallback.
- `Ctrl+]` / `Ctrl+[` — adjust per-bubble fade duration by ±2 s (range 2–30 s, default 8 s).
- `Ctrl+Shift+B` — toggle **ban mode** (see §7.5.1).
- `Ctrl+Shift+U` — clear the entire local ban list (panic undo).
- `Ctrl+Shift+H` — hide / show chat bubbles. **The status badge stays visible** so the presenter can confirm the app is still running. Toggle is transient (not persisted across restarts).
- `Ctrl+Shift+Q` — quit (avoids clashing with PowerPoint's `Esc` for ending the slideshow).

All adjustments are persisted to `userData/config.json` and survive restarts. A small top-center indicator (`위치: 왼쪽 아래` / `글자 크기: 32px` / `표시 시간: 10초` / `차단 모드 ON`) flashes for 1.5 s on each change so the presenter can see the new value.

### 7.5.1 Ban mode

A lightweight in-app moderation tool. Local-overlay-side filtering — does not write to Firebase; banned users can theoretically bypass by changing nickname.

- `Ctrl+Shift+B` toggles ban mode ON/OFF.
- While ON:
  - The status badge turns red (background `rgba(120,0,0,0.6)`, dot `#ff4646`, label `차단 모드`).
  - Click-through is disabled (`setIgnoreMouseEvents(false)`) so bubbles can be clicked.
  - Each visible bubble gains a red outline and `cursor: pointer`.
  - **Clicking a bubble adds its `nickname` to the local block-list and removes the bubble.** Future messages from that nickname are silently filtered.
  - Auto-exit after **30 s** of being on (safety — so the presenter can't accidentally leave click-through disabled).
- `Ctrl+Shift+U` clears the entire block-list at once (with an indicator showing how many entries were removed).
- The block-list is a `Set<string>` of banned nicknames, persisted as a JSON array under the `banList` key in `userData/config.json`.

### 7.5.2 Status badge

A tiny persistent pill (`● 구름`) is rendered in the corner **opposite** the chat anchor — so it never competes for attention with bubbles. Background `rgba(0,0,0,0.45)`, font 13 px, gap 7 px, with a green pulsing dot. Its placement class follows `#stack`'s class via `setStackClass`. Hidden together with the rest of the overlay when `Ctrl+Shift+H` is pressed.

### 7.6 Bubble visual

- Background: `rgba(0, 0, 0, 0.75)`.
- Border-radius: `12px`. Padding: `12px 16px`. Margin between bubbles: `8px`.
- Font: Korean-first stack from §1.1, **28 px**, line-height 1.3, `word-break: keep-all`.
- Nickname: bold, color = `palette[colorIdx]`.
- Text: white, regular weight, breaks on word boundaries.
- Max-width: `40%` of screen width (so a long message doesn't dominate).
- Slight `text-shadow: 0 1px 2px rgba(0,0,0,0.6)` so text reads even if PowerPoint background is bright.

### 7.7 Files

```
apps/overlay/
  package.json
  main.js               # createWindow, hotkeys, IPC, config persistence
  preload.js            # exposes getPosition() + onPositionChanged() to renderer
  renderer/
    index.html
    app.js              # firebase listener, bubble lifecycle
    style.css           # bubble + corner anchoring
    firebase-config.js  # same shape as phone side
```

### 7.8 Overlay app — how to set up & run (development)

1. From `apps/overlay/`: `npm install`.
2. Confirm the Firebase config has been pasted into `apps/overlay/renderer/firebase-config.js` (see §6.3 step A.9).
3. `npm start`.
4. A fullscreen transparent window appears. **It will look invisible** — that's expected. To verify it's running, look in Task Manager for the Electron process, or send a test message from the phone (a bubble should pop up).
5. Quit with `Ctrl+Shift+Q`.

### 7.9 Overlay app — how to build the portable .exe

1. From `apps/overlay/`: `npm run dist` (alias for `electron-builder --win portable`).
2. Build output appears in `apps/overlay/dist/`. The portable executable is `<ProductName>-<version>-portable.exe`.
3. Copy that single `.exe` onto a USB stick (or transfer however you want).
4. On the presenter PC, **double-click** the `.exe`. No install, no admin needed. The Firebase config is bundled inside.
5. (First-run on Windows may show SmartScreen warning since the binary is unsigned. Click **More info** → **Run anyway**.)

### 7.10 Day-of run sequence

1. Plug presenter laptop into projector. Confirm display is **mirrored** (not extended).
2. Start the portable overlay `.exe`. (Window is invisible until first message.)
3. Open PowerPoint. **Slideshow → From Beginning** (`F5`).
4. Show the title slide containing the chat URL / QR code. Wait for audience to join.
5. Send one test message from your own phone to confirm bubbles appear on the projected screen.
6. Start the talk. Use `Ctrl+1/2/3/4` to nudge bubble corner if a slide gets crowded.
7. End: `Ctrl+Shift+Q` (quit overlay) → `Esc` (exit PowerPoint slideshow).

## 8. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Firebase project setup runs over budget | Medium | The walkthrough in §6.3 is exact-step. Don't deviate. |
| Electron transparent + click-through misbehaves on this Windows version | Medium | Smoke-test the empty transparent window FIRST (before adding any chat code). If `setIgnoreMouseEvents` is broken, fall back to `focusable: false` only — presenter can still alt-tab past it. |
| Venue WiFi is flaky | Medium | Pre-test on phone hotspot; bring hotspot as backup; both phone app and overlay must work on the same hotspot. |
| Audience misuses chat (spam, profanity) | Low (~30 friendly people) | If a bad message appears, an admin can delete it directly in the Firebase console — RTDB pushes the deletion to the overlay live. For wholesale wipe, delete `/rooms/main/messages` in the console. |
| Phone JavaScript SDK fails to load on iOS | Low | Use the official CDN bundle (not modular imports) — it works on Safari ≥ 14. Test on at least one iPhone before doors open. |
| Anti-virus / SmartScreen flags the unsigned `.exe` | Likely | Brief presenter to click "Run anyway". |

## 9. Test plan

Run these in order before the talk. **Each must pass.**

1. **Smoke (overlay only):** start the empty transparent overlay, then start PowerPoint slideshow. Click on PowerPoint — clicks must pass through (slide advances). If not, we have an `setIgnoreMouseEvents` bug to fix.
2. **End-to-end:** send a message from a phone → bubble appears at the configured corner within ~1 s.
3. **Stack behaviour:** rapid-fire 7 messages from the phone → only 5 bubbles visible at any moment, oldest fades when the 6th arrives.
4. **Position toggle:** press `Ctrl+1`, `Ctrl+2`, `Ctrl+3`, `Ctrl+4` — bubbles re-anchor cleanly. Restart the overlay — last position is remembered.
5. **Color stability:** send two messages with the same nickname → same color. Different nickname → different color.
6. **Long message:** 200-char message → bubble wraps inside max-width, doesn't run off-screen.
7. **Empty / over-cap:** try to send `""` and a 201-char string from the phone — both rejected client-side (and rules-side as a backup).
8. **Reload survival:** refresh the phone tab → nickname persists from localStorage; sending still works.
9. **Visibility toggle:** `Ctrl+Shift+H` hides overlay. Press again → returns. (Useful if presenter wants chat gone for a sensitive slide.)
10. **Quit:** `Ctrl+Shift+Q` exits cleanly.
11. **Korean rendering:** send a message and a nickname in Korean (e.g., nickname `동아리회장`, text `안녕하세요, 발표 정말 흥미로워요!`). Verify on both the phone and the overlay — no missing-glyph boxes, no mid-syllable line breaks.

## 10. Decisions log

Captured during the brainstorming session, locked unless explicitly reopened:

- **Audience size:** small (~30) with headroom to medium → Firebase free tier suffices.
- **Identity:** user-chosen nickname, persisted in `localStorage`.
- **Session model:** collapsed from per-session join codes to **one hardcoded room** for v1 (4-hour budget cut).
- **Moderation UI:** dropped (data still saved; manual wipe via Firebase console if needed).
- **Persistence UI:** dropped (messages persist in DB; "browse past sessions" view is a v2).
- **Scope:** chat only — no reactions, polls, or Q&A.
- **Visibility:** both presenter and audience see overlay (single-monitor mirrored projection).
- **OS:** Windows.
- **Visual:** 4 selectable corners (`Ctrl+1..4`); deterministic per-user color from a curated 12-palette; max 5 bubbles at once; **fade time adjustable `Ctrl+]`/`Ctrl+[` (default 8 s, range 2–30 s)**; **font size adjustable `Ctrl+=`/`Ctrl+-` (default 28 px, range 16–64 px)**; persistent **`● 구름` status badge** in opposite corner; on-screen indicator flashes new value on each adjustment.
- **Moderation v1.1:** local-overlay click-to-ban via `Ctrl+Shift+B` ban mode + click bubble; `Ctrl+Shift+U` to clear all bans; auto-exit ban mode after 30 s. Local-only (does not write to Firebase rules); v2 should harden with a per-phone client ID.
- **Language:** all UI copy in Korean; system Korean fonts (Malgun Gothic / Apple SD Gothic Neo / Noto Sans KR) — no web font downloaded.
- **Stack:** Firebase Realtime DB + static HTML on Firebase Hosting + Electron overlay; no React / TypeScript / bundler in v1.
- **Distribution:** portable `.exe` via `electron-builder` (no installer).

## 11. Repository layout (target)

> **Note:** This layout is the *target* state after the implementation step. **None of these files exist yet** — only this spec, `CLAUDE.md`, and the `.superpowers/` brainstorm artifacts are on disk right now. The `apps/phone/` and `apps/overlay/` directories will be created in the execute step (after the plan).

```
구름/
├── CLAUDE.md
├── README.md                         # written during execute step
├── apps/
│   ├── phone/
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── style.css
│   │   └── firebase-config.js        # gitignored if/when repo is git-init'd
│   └── overlay/
│       ├── package.json
│       ├── main.js
│       ├── preload.js
│       ├── renderer/
│       │   ├── index.html
│       │   ├── app.js
│       │   ├── style.css
│       │   └── firebase-config.js    # gitignored
│       └── dist/                     # build output, gitignored
├── docs/superpowers/
│   ├── specs/
│   │   └── 2026-04-30-live-chat-overlay-design.md   # this file
│   └── plans/
│       └── 2026-04-30-live-chat-overlay-plan.md     # written next via writing-plans
├── firebase.json                     # generated by firebase init
└── .firebaserc                       # generated by firebase init
```
