# goorm-chat (구름)

> A live chat overlay for university club presentations — audience phones send chats, presenter PC displays them transparently on top of PowerPoint slides.

```
┌────────────┐  HTTPS write   ┌────────────────────┐  WS listen   ┌──────────────────┐
│  Phone     │ ─────────────▶ │ Firebase           │ ◀─────────── │ Electron overlay │
│  web app   │                │ Realtime DB        │              │ (transparent,    │
│ (Hosting)  │                │ /rooms/main/...    │              │  click-through)  │
└────────────┘                └────────────────────┘              └──────────────────┘
   audience                          cloud                            presenter PC
```

Three pieces, no backend code: a static phone web page on Firebase Hosting, Realtime Database in the middle, and a transparent always-on-top Electron overlay on Windows that sits over PowerPoint's fullscreen Slideshow mode.

## What it looks like

- **Audience side:** open a URL on their phone (or scan a QR), enter a nickname once, send messages.
- **Presenter side:** a tiny `● 구름` status pill in one corner; new chat bubbles slide up from the opposite corner, oldest at top of the stack and newest at the bottom (Discord-style). Each bubble carries the sender's nickname in their assigned palette color and fades out after a configurable interval.
- **Audience also sees the chat** when the projector mirrors the presenter's screen — Twitch-style "wall of chat" energy on top of the slides.

## Usage (presenter)

1. Plug your laptop into the projector and set display to **Duplicate** (Win+P).
2. Run `GuruemChatOverlay <version>.exe` (or extract `.zip` and run `GuruemChatOverlay.exe` inside). Click **More info → Run anyway** if Windows SmartScreen warns.
3. Open PowerPoint, press `F5` to start the slideshow.
4. Show your title slide with the chat URL or QR code.
5. Talk. Watch the wall of chat scroll across the slides.
6. End with `Ctrl+Shift+Q` (overlay) → `Esc` (PowerPoint).

### Hotkeys

| Key | Action |
| --- | --- |
| `Ctrl+1` / `2` / `3` / `4` | Place bubbles in TL / TR / BL / BR corner |
| `Ctrl+=` / `Ctrl+-` | Font size ±2 px (range 16–64) |
| `Ctrl+]` / `Ctrl+[` | Fade duration ±2 s (range 2–30 s) |
| `Ctrl+Shift+B` | Toggle ban mode (click a bubble to ban; auto-exits after 30 s) |
| `Ctrl+Shift+U` | Clear all bans |
| `Ctrl+Shift+H` | Hide / show chat bubbles (status badge stays visible) |
| `Ctrl+Shift+Q` | Quit overlay cleanly |

Settings (corner, font size, fade time, ban list) persist in `%APPDATA%\GuruemChatOverlay\config.json`.

## Building from source

### Prerequisites

- Node.js 18+
- A Firebase project with **Realtime Database** enabled (not Firestore)
- Windows 10 / 11 x64 to build the overlay

### Setup

1. Clone the repo.
2. Create a Firebase project (see [the design spec](docs/superpowers/specs/2026-04-30-live-chat-overlay-design.md) §6.3 for the exact walkthrough).
3. Create your config files (gitignored — fill in your own values):

   ```js
   // apps/phone/firebase-config.js
   // apps/overlay/renderer/firebase-config.js
   export const firebaseConfig = {
     apiKey:            "...",
     authDomain:        "...",
     databaseURL:       "https://<project>-default-rtdb.<region>.firebasedatabase.app",
     projectId:         "...",
     storageBucket:     "...",
     messagingSenderId: "...",
     appId:             "...",
   };
   ```

4. Paste the security rules from spec §4 into Realtime Database → Rules → Publish.

### Deploy the phone app

```sh
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
# → https://<project-id>.web.app
```

### Build the overlay

```sh
cd apps/overlay
npm install
npm run build:icon   # one-time: regenerate build/icon.ico from the embedded SVG
npm run dist
# → dist/GuruemChatOverlay <version>.exe   (single-file portable)
# → dist/GuruemChatOverlay-<version>-win.zip   (folder zipped, fallback)
```

### Run the overlay in dev (no build)

```sh
cd apps/overlay
npm start
```

A transparent fullscreen window opens; it will look invisible. Send a chat from the phone to confirm bubbles appear.

## Project layout

```
goorm-chat/
├── apps/
│   ├── phone/                      # Audience-facing web app (Firebase Hosting)
│   │   ├── index.html / app.js / style.css / palette.js
│   │   └── firebase-config.js      # gitignored
│   └── overlay/                    # Presenter-facing Electron app
│       ├── main.js                 # transparent always-on-top window + hotkeys
│       ├── preload.js              # IPC bridge
│       ├── renderer/               # bubble lifecycle, Firebase listener
│       ├── scripts/build-icon.js   # generates build/icon.ico
│       ├── build/icon.ico          # app icon
│       └── dist/                   # build output (gitignored)
├── docs/superpowers/
│   ├── specs/                      # design specification
│   └── plans/                      # implementation plan
├── firebase.json / .firebaserc     # Firebase Hosting config
└── CLAUDE.md                       # project conventions + decisions log
```

## Notes & caveats

- The Firebase Web SDK `apiKey` isn't strictly secret — access is enforced by Realtime Database security rules — but `firebase-config.js` is gitignored anyway so the repo can travel cleanly between projects.
- The portable `.exe` is unsigned. Windows SmartScreen will warn on first run; click "More info → Run anyway".
- Ban mode is **client-side only**: it filters messages on the overlay but doesn't block the sender at the server. A determined troll can bypass by changing nickname. v2 should add per-phone client IDs and server-side rule-based blocking.
- Stack max is 5 bubbles; older bubbles fade out automatically (default 8 s, adjustable live).
- Initial-replay messages (the last 5 already-stored messages when the overlay starts) appear without entry animation — only newly arriving messages slide in.

## License

© 2026 구름. All rights reserved.
