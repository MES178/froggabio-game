/* =========================================================
   FroggaBio — Match the Cards
   Edit ONLY the CONFIG block below between events.
   ========================================================= */

const CONFIG = {
  timerSeconds: 45,          // total game time
  vipThresholdSeconds: 15,   // finish in ≤15s → VIP prize; otherwise → regular prize
  maxAttempts: 3,            // max total attempts per device/browser session
  showCongratsScreen: false, // true → win flow includes the "Congratulations" claim
                             // screen; false → "Proceed" goes straight to the voucher
  prizes: {
    vip: {
      name: "VIP Prize",                    // ← change before each event
      validUntil: "Thu 31 Dec 2026 21:00",
      terms: ""
    },
    regular: {
      name: "Branded FroggaBio Pen",
      validUntil: "Thu 31 Dec 2026 21:00",
      terms: ""
    }
  },
  contact: {
    website:    "https://froggabio.com",
    phone:      "tel:+1-800-668-5222",
    email:      "mailto:info@froggabio.com",
    promotions: "https://froggabio.com/promotions"
  }
};

/* ========================================================= */

const PAIRS = 5;
const FLIP_MS = 400;            // matches CSS card flip transition
const MISMATCH_PAUSE_MS = 1000; // pause before unmatched cards flip back
const WARN_AT_SECONDS = 10;     // timer turns red at/below this
const STORAGE_KEYS = {
  attempts: "fb_game_attempts",
  won: "fb_game_won",
  prize: "fb_game_prize"
};
const CONFETTI_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b', '#cc5de8'];

const state = {
  started: false,     // timer running (starts on first card tap)
  over: false,        // current round finished (win or timeout)
  pendingUnflip: null,// { cards: [a, b], timeoutId } — mismatched pair waiting to flip back
  flippedCards: [],   // currently face-up, unmatched cards (max 2)
  matchedPairs: 0,
  deadline: 0,        // ms timestamp when time runs out
  startedAt: 0,       // ms timestamp of first tap
  timerId: null,
  prizeTier: null     // 'vip' | 'regular' once won
};

const els = {
  timer: document.getElementById("timer"),
  board: document.getElementById("board"),
  winPrize: document.getElementById("win-prize"),
  btnRetry: document.getElementById("btn-retry"),
  loseNoAttempts: document.getElementById("lose-no-attempts"),
  btnProceed: document.getElementById("btn-proceed"),
  btnClaim: document.getElementById("btn-claim"),
  cValid: document.getElementById("c-valid"),
  cTerms: document.getElementById("c-terms"),
  cValue: document.getElementById("c-value"),
  vValue: document.getElementById("v-value"),
  lockedMsg: document.getElementById("locked-msg"),
  btnViewVoucher: document.getElementById("btn-view-voucher"),
  confettiLayer: document.getElementById("confetti-layer")
};

/* ---------- localStorage helpers (Safari private mode safe) ---------- */

function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* play without persistence */ }
}

function getAttempts() {
  return parseInt(storageGet(STORAGE_KEYS.attempts) || "0", 10);
}

function hasWon() {
  return storageGet(STORAGE_KEYS.won) === "true";
}

/* ---------- Screen transitions (0.3s opacity fade) ---------- */

function showScreen(id) {
  const next = document.getElementById(id);
  const current = document.querySelector(".screen:not(.hidden)");
  if (current === next) return;

  const reveal = () => {
    next.classList.add("fading");
    next.classList.remove("hidden");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => next.classList.remove("fading"));
    });
  };

  if (current) {
    current.classList.add("fading");
    setTimeout(() => {
      current.classList.add("hidden");
      current.classList.remove("fading");
      reveal();
    }, 300);
  } else {
    reveal();
  }
}

/* ---------- Board setup ---------- */

function shuffle(array) {
  // Fisher–Yates
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function buildDeck() {
  const deck = [];
  for (let id = 1; id <= PAIRS; id++) {
    const card = { id, img: `images/product-${id}.png` };
    deck.push({ ...card }, { ...card });
  }
  return shuffle(deck);
}

function renderBoard() {
  els.board.innerHTML = "";
  buildDeck().forEach(cardData => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.dataset.id = String(cardData.id);
    card.innerHTML =
      '<div class="card-inner">' +
        '<div class="card-face card-face-down"><img src="images/card-back.png" alt=""></div>' +
        `<div class="card-face card-face-up"><img src="${cardData.img}" alt="Product ${cardData.id}"></div>` +
      '</div>';
    card.addEventListener("click", () => onCardTap(card));
    els.board.appendChild(card);
  });
}

function newGame() {
  state.started = false;
  state.over = false;
  if (state.pendingUnflip) clearTimeout(state.pendingUnflip.timeoutId);
  state.pendingUnflip = null;
  state.flippedCards = [];
  state.matchedPairs = 0;
  clearInterval(state.timerId);
  els.timer.classList.remove("warning");
  renderTimer(CONFIG.timerSeconds);
  renderBoard();
  showScreen("screen-game");
}

/* ---------- Timer (starts on first card tap) ---------- */

function renderTimer(secondsLeft) {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  els.timer.textContent = `${m}:${String(s).padStart(2, "0")}`;
  els.timer.classList.toggle("warning", secondsLeft <= WARN_AT_SECONDS);
}

function startTimer() {
  state.started = true;
  state.startedAt = Date.now();
  state.deadline = state.startedAt + CONFIG.timerSeconds * 1000;
  state.timerId = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    renderTimer(remaining);
    if (remaining <= 0) onTimeout();
  }, 250);
}

/* ---------- Card flipping & matching ---------- */

function onCardTap(card) {
  if (state.over) return;
  if (card.classList.contains("flipped") || card.classList.contains("matched")) return;

  // A mismatched pair still showing? Flip it back right away so this
  // tap is never ignored — fast players don't lose taps to the pause.
  if (state.pendingUnflip) {
    clearTimeout(state.pendingUnflip.timeoutId);
    state.pendingUnflip.cards.forEach(c => c.classList.remove("flipped"));
    state.pendingUnflip = null;
  }

  if (!state.started) startTimer();

  card.classList.add("flipped");
  state.flippedCards.push(card);

  if (state.flippedCards.length === 2) {
    const [a, b] = state.flippedCards;
    state.flippedCards = [];

    if (a.dataset.id === b.dataset.id) {
      a.classList.add("matched");
      b.classList.add("matched");
      state.matchedPairs++;
      if (state.matchedPairs === PAIRS) onWin();
    } else {
      const timeoutId = setTimeout(() => {
        a.classList.remove("flipped");
        b.classList.remove("flipped");
        state.pendingUnflip = null;
      }, FLIP_MS + MISMATCH_PAUSE_MS);
      state.pendingUnflip = { cards: [a, b], timeoutId };
    }
  }
}

/* ---------- Lose flow ---------- */

function onTimeout() {
  if (state.over) return;
  state.over = true;
  clearInterval(state.timerId);

  const attempts = getAttempts() + 1;
  storageSet(STORAGE_KEYS.attempts, String(attempts));

  const outOfAttempts = attempts >= CONFIG.maxAttempts;
  els.btnRetry.classList.toggle("hidden", outOfAttempts);
  els.loseNoAttempts.classList.toggle("hidden", !outOfAttempts);
  showScreen("screen-lose");
}

/* ---------- Win flow ---------- */

function onWin() {
  state.over = true;
  clearInterval(state.timerId);

  const elapsedSeconds = (Date.now() - state.startedAt) / 1000;
  state.prizeTier = elapsedSeconds <= CONFIG.vipThresholdSeconds ? "vip" : "regular";

  // A win locks out future plays
  storageSet(STORAGE_KEYS.won, "true");
  storageSet(STORAGE_KEYS.attempts, String(CONFIG.maxAttempts));
  storageSet(STORAGE_KEYS.prize, state.prizeTier);

  const prize = CONFIG.prizes[state.prizeTier];
  els.winPrize.textContent = prize.name;
  fillVoucherScreens(state.prizeTier);

  launchConfetti();
  // Short beat so the last matched pair's glow is visible
  setTimeout(() => showScreen("screen-win"), 600);
}

function fillVoucherScreens(tier) {
  const prize = CONFIG.prizes[tier];
  els.cValid.textContent = prize.validUntil;
  els.cTerms.textContent = prize.terms || "—";
  els.cValue.textContent = prize.name;
  els.vValue.textContent = prize.name;
}

/* ---------- Confetti ---------- */

function launchConfetti() {
  const count = 50;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    piece.style.animationDuration = (2.5 + Math.random() * 1.5) + "s";
    piece.style.animationDelay = (Math.random() * 0.8) + "s";
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    els.confettiLayer.appendChild(piece);
  }
  setTimeout(() => { els.confettiLayer.innerHTML = ""; }, 4500);
}

/* ---------- Locked screen (already won / no attempts) ---------- */

function showLockedScreen() {
  const won = hasWon();
  els.lockedMsg.textContent = won
    ? "Game already completed."
    : "No more attempts available.";

  const savedTier = storageGet(STORAGE_KEYS.prize);
  const canViewVoucher = won && (savedTier === "vip" || savedTier === "regular");
  els.btnViewVoucher.classList.toggle("hidden", !canViewVoucher);
  if (canViewVoucher) fillVoucherScreens(savedTier);

  showScreen("screen-locked");
}

/* ---------- Wiring & init ---------- */

function applyContactLinks() {
  const map = {
    "js-promo": CONFIG.contact.promotions,
    "js-web": CONFIG.contact.website,
    "js-phone": CONFIG.contact.phone,
    "js-email": CONFIG.contact.email
  };
  Object.entries(map).forEach(([cls, href]) => {
    document.querySelectorAll("." + cls).forEach(link => {
      link.href = href;
      if (!href.startsWith("tel:") && !href.startsWith("mailto:")) {
        link.target = "_blank";
        link.rel = "noopener";
      }
    });
  });
}

function init() {
  applyContactLinks();

  els.btnRetry.addEventListener("click", newGame);
  els.btnProceed.addEventListener("click", () =>
    showScreen(CONFIG.showCongratsScreen ? "screen-congrats" : "screen-voucher"));
  els.btnClaim.addEventListener("click", () => showScreen("screen-voucher"));
  els.btnViewVoucher.addEventListener("click", () => showScreen("screen-voucher"));

  if (hasWon() || getAttempts() >= CONFIG.maxAttempts) {
    document.getElementById("screen-game").classList.add("hidden");
    showLockedScreen();
  } else {
    renderTimer(CONFIG.timerSeconds);
    renderBoard();
  }
}

init();
