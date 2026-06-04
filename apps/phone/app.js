import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase, ref, push, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { PALETTE, colorIdxFor } from "./palette.js";

const STORAGE_KEY = "chat.nickname";
const COOLDOWN_MS = 750;

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

// Enter sends; Shift+Enter inserts a newline. Ignore Enter while the IME is
// composing (e.g. confirming a Hangul syllable) so half-typed text isn't sent.
els.msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    // requestSubmit routes through the submit handler (cooldown/validation/toast);
    // dispatchEvent is a fallback for older iOS Safari that lacks requestSubmit.
    if (els.msgForm.requestSubmit) els.msgForm.requestSubmit(els.sendBtn);
    else els.msgForm.dispatchEvent(new Event("submit", { cancelable: true }));
  }
});

// textarea auto-grow up to 200px
els.msgInput.addEventListener("input", () => {
  els.msgInput.style.height = "auto";
  els.msgInput.style.height = Math.min(els.msgInput.scrollHeight, 200) + "px";
});
