# Random Floating Chat Placement + Chat Log — Design Spec

**Date:** 2026-06-04
**Project:** 구름 (university club presentation tool)
**Scope:** Overlay app only (`apps/overlay/`). Phone app and Firebase data model unchanged.

## 1. Goal

Change how incoming chat messages appear on the presenter overlay:

1. **Random floating placement** — instead of stacking in one of four corners, each chat bubble appears at a random location on screen for its lifetime, then fades out.
2. **Boundary-safe** — a bubble must never be clipped by a screen edge; the entire bubble stays on screen.
3. **Best-effort non-overlap** — when several bubbles are visible at once, new bubbles avoid overlapping existing ones where possible.
4. **Parseable chat log** — every received message is appended to a machine-parseable log file on disk.

**Unchanged behavior (explicitly preserved):**

- Font-size hotkeys `Ctrl+=` / `Ctrl+-` (and numpad variants).
- Float-time hotkeys `Ctrl+]` / `Ctrl+[` — `fadeMs` remains the on-screen lifetime of each bubble.
- Ban mode (`Ctrl+Shift+B`, click-to-ban, `Ctrl+Shift+U`), `MAX_VISIBLE = 5`.
- `Ctrl+Shift+H` (hide chat), `Ctrl+Shift+Q` (quit).
- Firebase listener, palette/colorIdx, Korean font stack.

## 2. Non-goals

- No change to the phone app or Firebase schema.
- No server-side logging (log is local to the presenter PC).
- No in-overlay log viewer (the file is for after-the-fact parsing).
- No collision-free guarantee — overlap avoidance is best-effort only.

## 3. Decisions (from brainstorm, 2026-06-04)

| Decision | Choice |
|----------|--------|
| 4-corner anchoring (`Ctrl+1–4`) | **Removed.** Status badge kept, fixed in bottom-right. |
| Overlap when bubbles coincide | **Best-effort avoidance**, fall back to least-overlap. |
| Log format | **JSON Lines** (`.jsonl`), append-only. |
| Log scope | **All received** messages; banned ones flagged `banned:true`. |
| Log file granularity | **Per session** — one file per overlay launch. |
| Log location | `userData/logs/chat-YYYYMMDD-HHMMSS.jsonl`. |

## 4. Placement model (renderer)

The flex `#stack` container is replaced by a full-screen field:

```css
#field { position: fixed; inset: 0; pointer-events: none; }
.bubble { position: absolute; max-width: 42vw; }  /* cap so long text fits */
```

Each bubble is an absolutely-positioned child of `#field`, placed at a random
`(x, y)` chosen so the whole bubble stays on screen.

**Algorithm per new bubble:**

1. Build the bubble element, append to `#field` while visually hidden
   (`visibility: hidden`) so it has layout but does not flash at `(0,0)`.
2. Measure real size `w = el.offsetWidth`, `h = el.offsetHeight`.
3. Compute the safe box with `margin ≈ 24px`:
   - `xMax = vw − w − margin`, `yMax = vh − h − margin`.
   - If `xMax < margin` (bubble wider than safe area, shouldn't happen given the
     42vw cap) clamp `x = margin`; same for `y`. This is the boundary-safety guarantee.
4. Choose `(x, y)` via `pickPosition(...)` (overlap avoidance, §5).
5. Set `left`/`top`, then reveal (`visibility: visible`) and trigger the fade+scale-in.

## 5. Overlap avoidance — pure module `renderer/placement.js`

Placement math is a **pure function** with no DOM access, so it is unit-testable:

```js
// pickPosition({ vw, vh, w, h, margin, gap, existing, tries, rng }) -> { x, y }
//   existing: array of { x, y, w, h } rects of currently-visible bubbles
//   gap:      min spacing added around each existing rect when testing overlap
//   tries:    number of random candidates to attempt (~30)
//   rng:      () => [0,1) — injected for deterministic tests
```

Behavior:

1. For up to `tries` attempts, pick a random `(x, y)` inside the safe box.
2. Reject a candidate whose rect, inflated by `gap`, intersects any `existing` rect.
3. Return the first non-colliding candidate.
4. If all candidates collide, return the candidate with the **least total overlap area**
   (graceful degradation when the screen is crowded).
5. Edge case: empty `existing` → first candidate returned immediately.

`app.js` calls `pickPosition` with the live viewport size, the measured bubble size,
and the rects of the bubbles currently tracked in the `bubbles[]` array.

## 6. Removed code

- `Ctrl+1–4` global shortcuts and `setPosition` (main).
- `position` config field, `position-changed` IPC, `onPositionChanged` (preload/renderer).
- `setStackClass`, the `.TL/.TR/.BL/.BR` stack corner CSS, `POSITION_LABEL`.
- Status badge corner-following: it is now a single fixed bottom-right rule.

## 7. Chat log (main process)

A new IPC channel carries each **live** message from renderer to main; the main
process owns the file (it already owns `fs` and the `userData` path for `config.json`).

- **Filename** is stamped once at launch: `logs/chat-YYYYMMDD-HHMMSS.jsonl` under
  `app.getPath("userData")`. The `logs/` dir is created if missing.
- Renderer logs every message it receives from Firebase **after the initial replay**
  (the same `initialReplayDone` gate already used to suppress entry animations), so
  stale pre-session messages are not recorded.
- Each record is one line, appended with `fs.appendFileSync`:

```json
{"loggedAt":1730000000123,"ts":1730000000000,"key":"-Nabc123","nickname":"홍길동","text":"안녕하세요","colorIdx":3,"banned":false}
```

  - `loggedAt` — main-process receive time (ms epoch), authoritative ordering.
  - `ts` — the message's own Firebase `serverTimestamp` (ms), may be null on rare races.
  - `key` — Firebase push key (globally chronological id).
  - `banned` — `true` if `nickname` was in the ban set when received.
- **Error isolation:** all file I/O is wrapped in try/catch with `console.error`; a
  logging failure must never affect the overlay display.

### IPC summary

| Channel | Direction | Payload |
|---------|-----------|---------|
| `log-message` | renderer → main | `{ ts, key, nickname, text, colorIdx, banned }` |

(main adds `loggedAt` and writes the line; no reply needed.)

## 8. Animation

- **Entry:** fade in + slight scale-up (e.g. `scale(0.92) → scale(1)`, opacity `0 → 1`)
  at the chosen `(x, y)`. Replaces the corner slide-up.
- **Exit:** fade out + slight scale-down, then remove from DOM (existing `removeBubble`
  timing of ~300ms retained).

## 9. Error handling

- Measurement returns 0 (e.g. empty text) → fall back to a clamped random position; never throw.
- `pickPosition` always returns a point inside the safe box.
- Log write failure → caught, logged to console, overlay continues.
- Firebase/init failures handled as today (defaults applied).

## 10. Testing

- **Unit (`node --test`, no new deps):** `renderer/placement.js`
  - returns a point inside the safe box for an empty screen;
  - avoids a single blocking rect when a free spot exists (deterministic `rng`);
  - falls back to least-overlap when every candidate collides;
  - clamps when the bubble is as wide as the safe area.
  - Add `"test": "node --test"` to `apps/overlay/package.json`.
- **Manual (run the app):** bubbles land fully on screen at varied spots, don't clip
  edges, avoid overlap when sparse; font/float-time hotkeys still work; a `.jsonl`
  log file appears under `userData/logs/` and each line parses as JSON.

## 11. Files touched

- `apps/overlay/renderer/placement.js` — **new**, pure placement math.
- `apps/overlay/renderer/placement.test.js` — **new**, unit tests.
- `apps/overlay/renderer/app.js` — floating placement, logging call, remove position handling.
- `apps/overlay/renderer/style.css` — `#field` + absolute bubbles, fixed badge, new animation, remove corner classes.
- `apps/overlay/renderer/index.html` — `#stack` → `#field`, badge no longer corner-classed.
- `apps/overlay/main.js` — remove position shortcuts/config; add per-session log file + `log-message` IPC.
- `apps/overlay/preload.js` — remove `onPositionChanged`; add `logMessage`.
- `apps/overlay/package.json` — add `test` script.
