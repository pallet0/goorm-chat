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
