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
  const idx = ((m.colorIdx ?? 0) % PALETTE.length + PALETTE.length) % PALETTE.length;
  nick.style.color = PALETTE[idx];

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
