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
const statusBadge = document.getElementById("status-badge");
const statusText = statusBadge.querySelector(".status-text");
const bubbles = []; // { key, nickname, el, timer } — newest pushed last

let fadeAfterMs = DEFAULT_FADE_MS;
let indicatorTimer = null;
let banSet = new Set();
let banMode = false;

function setStackClass(pos) {
  const corners = ["TL", "TR", "BL", "BR"];
  for (const c of corners) {
    stack.classList.remove(c);
    statusBadge.classList.remove(c);
  }
  stack.classList.add(pos);
  statusBadge.classList.add(pos);
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

function applyBanModeUI() {
  document.body.classList.toggle("ban-mode", banMode);
  statusBadge.classList.toggle("ban", banMode);
  statusText.textContent = banMode ? "차단 모드" : "구름";
}

(async function init() {
  try {
    const s = await window.api.getSettings();
    setStackClass(s.position || DEFAULT_POSITION);
    applyFontSize(s.fontSize || DEFAULT_FONT_PX);
    fadeAfterMs = s.fadeMs || DEFAULT_FADE_MS;
    banSet = new Set(s.banList || []);
    banMode = !!s.banMode;
    applyBanModeUI();
  } catch (e) {
    console.error("getSettings failed, using defaults", e);
    setStackClass(DEFAULT_POSITION);
    applyFontSize(DEFAULT_FONT_PX);
    applyBanModeUI();
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
  window.api.onBanModeChanged((active) => {
    banMode = active;
    applyBanModeUI();
    showIndicator(active ? "차단 모드 ON" : "차단 모드 OFF");
  });
  window.api.onBanListChanged((payload) => {
    banSet = new Set(payload.list || []);
    if (payload.reason === "add" && payload.nickname) {
      showIndicator(`차단됨: ${payload.nickname}`);
      // remove any other visible bubbles from this nickname
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
  if (m.nickname && banSet.has(m.nickname)) return; // filtered
  pushBubble(snap.key, m, /* animate */ initialReplayDone);
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
  stack.appendChild(el);

  const entry = { key, nickname: m.nickname ?? "", el, timer: null };
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
