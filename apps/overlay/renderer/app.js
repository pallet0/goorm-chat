import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, query, limitToLast, onChildAdded,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { PALETTE } from "./palette.js";

const MAX_VISIBLE = 5;
const DEFAULT_FADE_MS = 8000;
const DEFAULT_FONT_PX = 28;
const DEFAULT_POSITION = "BL";

const POSITION_LABEL = {
  TL: "왼쪽 위", TR: "오른쪽 위", BL: "왼쪽 아래", BR: "오른쪽 아래",
};

const stack = document.getElementById("stack");
const indicator = document.getElementById("indicator");
const bubbles = []; // { key, el, timer } — newest pushed last

let fadeAfterMs = DEFAULT_FADE_MS;
let indicatorTimer = null;

function setStackClass(pos) {
  stack.classList.remove("TL", "TR", "BL", "BR");
  stack.classList.add(pos);
}

function applyFontSize(px) {
  document.documentElement.style.setProperty("--bubble-font-size", `${px}px`);
}

function showIndicator(text) {
  indicator.textContent = text;
  indicator.classList.add("visible");
  clearTimeout(indicatorTimer);
  indicatorTimer = setTimeout(() => indicator.classList.remove("visible"), 1500);
}

(async function init() {
  try {
    const s = await window.api.getSettings();
    setStackClass(s.position || DEFAULT_POSITION);
    applyFontSize(s.fontSize || DEFAULT_FONT_PX);
    fadeAfterMs = s.fadeMs || DEFAULT_FADE_MS;
  } catch (e) {
    console.error("getSettings failed, using defaults", e);
    setStackClass(DEFAULT_POSITION);
    applyFontSize(DEFAULT_FONT_PX);
  }

  window.api.onPositionChanged((pos) => {
    setStackClass(pos);
    showIndicator(`위치: ${POSITION_LABEL[pos] ?? pos}`);
  });
  window.api.onFontChanged((size) => {
    applyFontSize(size);
    showIndicator(`글자 크기: ${size}px`);
  });
  window.api.onFadeChanged((ms) => {
    fadeAfterMs = ms;
    showIndicator(`표시 시간: ${(ms / 1000).toFixed(0)}초`);
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
  pushBubble(snap.key, m, /* animate */ initialReplayDone);
});

function pushBubble(key, m, animate) {
  if (bubbles.find((b) => b.key === key)) return; // safety: no dupes

  const el = document.createElement("div");
  el.className = "bubble";
  el.dataset.key = key;

  const nick = document.createElement("span");
  nick.className = "nickname";
  nick.textContent = m.nickname ?? "";
  const idx = ((m.colorIdx ?? 0) % PALETTE.length + PALETTE.length) % PALETTE.length;
  nick.style.color = PALETTE[idx];

  const text = document.createTextNode(m.text ?? "");
  el.appendChild(nick);
  el.appendChild(text);
  stack.appendChild(el);

  const entry = { key, el, timer: null };
  bubbles.push(entry);

  if (animate) {
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  } else {
    el.classList.add("in");
  }

  // schedule fade-out using current fadeAfterMs
  entry.timer = setTimeout(() => removeBubble(entry), fadeAfterMs);

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
