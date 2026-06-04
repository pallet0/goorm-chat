import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, query, limitToLast, onChildAdded, remove,
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
const messagesRef = ref(db, "rooms/main/messages");
const messagesQuery = query(messagesRef, limitToLast(MAX_VISIBLE));

// Flush accumulated history on startup, THEN listen for new messages only — so
// turning the overlay on never dumps the previous session's backlog on screen.
// Awaiting remove() before attaching the listener guarantees nothing replays.
// (Each session's messages are still archived to the local .jsonl log.)
(async function startFeed() {
  try {
    await remove(messagesRef);
  } catch (e) {
    console.error("flush failed; old messages may replay", e);
  }

  onChildAdded(messagesQuery, (snap) => {
    const m = snap.val();
    if (!m) return;
    const banned = !!(m.nickname && banSet.has(m.nickname));

    window.api.logMessage({
      ts: m.ts ?? null,
      key: snap.key,
      nickname: m.nickname ?? "",
      text: m.text ?? "",
      colorIdx: m.colorIdx ?? 0,
      banned,
    });

    if (banned) return; // filtered from display
    pushBubble(snap.key, m, /* animate */ true);
  });
})();

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
