# 구름 — Live Chat Overlay

University club ("구름") presentation tool. Audience members open a web page on their phones and send chat messages; a transparent always-on-top overlay on the presenter's PC displays the live feed on top of the slides during PowerPoint presentation mode.

## Workflow (superpowers)

This project follows the superpowers brainstorm → spec → plan → execute flow.

1. **Brainstorm** (this stage) — clarify requirements, choose stack, agree on design.
2. **Spec** — written to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`.
3. **Plan** — written to `docs/superpowers/plans/YYYY-MM-DD-<topic>-plan.md` via the `superpowers:writing-plans` skill.
4. **Execute** — implementation via TDD (`superpowers:test-driven-development`) and verification before completion.

Always invoke the `superpowers:brainstorming` skill before adding features or making design changes. Always invoke `superpowers:writing-plans` after the spec is approved.

## Repository layout (target)

- `apps/phone/` — audience web app (open on phones).
- `apps/overlay/` — presenter PC overlay app (transparent, always-on-top).
- `docs/superpowers/specs/` — design specs.
- `docs/superpowers/plans/` — implementation plans.
- `.superpowers/` — brainstorm visual-companion artifacts. **Add to `.gitignore` once a git repo is initialized.**

(Stack — framework, cloud service, deployment — is being decided in the current brainstorm and will be recorded here when chosen.)

## Operating notes

- **Visual companion (Windows):** the brainstorm server is launched via `superpowers/skills/brainstorming/scripts/start-server.sh --project-dir <repo>` with `run_in_background: true`. Always write at least one HTML file to `<session>/content/` BEFORE giving the user the URL — otherwise the page returns 404. Connection info lives in `<session>/state/server-info`.
- **Working language:** all user-facing UI copy is **Korean** (한국어). Code, identifiers, and docs are English. Both apps use a Korean-first system font stack (Malgun Gothic / Apple SD Gothic Neo / Noto Sans KR) — no web font download in v1.

## Decisions log

(Recorded here as they are made.)

- **2026-04-30** — Stack chosen: Firebase Realtime DB + static HTML on Firebase Hosting + Electron transparent overlay. Windows portable `.exe` via `electron-builder`. No React / TS / bundler in v1.
- **2026-04-30** — Spec: `docs/superpowers/specs/2026-04-30-live-chat-overlay-design.md`.
- **2026-04-30** — Added live-adjustable hotkeys for font size (`Ctrl+=`/`Ctrl+-`) and fade duration (`Ctrl+]`/`Ctrl+[`); both persist to `userData/config.json`. On-screen indicator confirms each change.
- **2026-04-30** — Persistent `● 구름` status badge in corner opposite the chat anchor (so the presenter can confirm the overlay is alive even when no chats are arriving). Follows position via `setStackClass`.
- **2026-04-30** — Post-MVP **ban mode** (`Ctrl+Shift+B` toggle, click bubble to ban, `Ctrl+Shift+U` to clear all). Local block-list persisted in `userData/config.json` (`banList` key). Auto-exits after 30 s. Caveat: local-only filtering; v2 needs server-side per-phone IDs to be tamper-proof.
- **2026-04-30** — `Ctrl+Shift+H` semantics changed from `win.hide()` (hides everything) to a CSS `body.chat-hidden` class that hides only `#stack`. The status badge remains visible so the presenter always has a "still running" indicator. Implemented as IPC `chat-hidden-changed`; transient (not persisted).
- **2026-04-30** — Stack direction unified across all 4 corners: **oldest at top, newest at bottom**, Discord-style. Was previously `flex-direction: column-reverse` for BL/BR (which mistakenly put newest at the top of the stack). Now plain `column` everywhere, with universal slide-up-from-below entry animation and slide-up-and-fade exit.
- **2026-06-04** — Placement changed from 4-corner stacking to **random floating**: each bubble appears at a random, boundary-safe `(x,y)` via pure module `apps/overlay/renderer/placement.mjs` (`pickPosition`, best-effort overlap avoidance, unit-tested with `node --test`). Removed `Ctrl+1–4` corner anchoring and the `position` config field; `#stack` → full-screen `#field` with absolutely-positioned bubbles (`max-width: 42vw`) and a fade+scale animation. Status badge pinned **top-left**. `MAX_VISIBLE` raised `5 → 12`. Font-size (`Ctrl+=/-`) and float-time (`Ctrl+[ / ]`) hotkeys unchanged. Spec: `docs/superpowers/specs/2026-06-04-floating-chat-placement-design.md`.
- **2026-06-04** — Chat history logged to a **per-session JSON Lines** file at `userData/logs/chat-YYYYMMDD-HHMMSS.jsonl` (one record per received message, including banned ones flagged `banned:true`). Renderer forwards live messages over the `log-message` IPC; main appends with `fs.appendFileSync` (`loggedAt` is the authoritative main-side timestamp).
- **2026-06-04** — Overlay **flushes accumulated history on startup**: the renderer `await remove(rooms/main/messages)` *before* attaching `onChildAdded`, so turning the overlay on never dumps the previous session's backlog on screen. This retired the 500 ms `initialReplayDone` replay gate — every received message now logs and animates in (no replayed history to suppress). The per-session `.jsonl` log still archives everything, so deletion only clears the live transport. Requires Realtime DB rules to permit delete on that path (phones already write there). Flush is best-effort: on failure it logs to console and the listener still attaches.
