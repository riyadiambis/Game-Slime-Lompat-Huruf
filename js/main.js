// ==========================================
// GAME LOOP
// ==========================================
let animFrameId = null;
let lastTimestamp = 0;

function gameLoop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
  lastTimestamp = timestamp;

  updateGame(dt);
  renderGame(timestamp);

  animFrameId = requestAnimationFrame(gameLoop);
}

// ==========================================
// RESET & INISIALISASI PERMAINAN
// ==========================================
function startNewGame() {
  state.score = 0;
  state.lives = 3;
  state.wordsCompleted = 0;
  state.completedWords = [];
  state.gameOver = false;
  state.paused = false;
  state.wordSuccessPaused = false;
  state.shieldTimer = 0;
  state.hitCount = 0;
  state.rows.clear();
  state.particles = [];
  state.floatingTexts = [];
  state.pendingLetterRespawns = [];

  state.player = {
    col: 3,
    row: 1,
    renderX: 3,
    renderY: 1,
    jumpZ: 0,
    jumping: false,
    jumpProgress: 0,
    startCol: 3,
    startRow: 1,
    targetCol: 3,
    targetRow: 1,
    facing: "up"
  };
  state.cameraRow = 1;

  for (let r = 0; r <= VISIBLE_ROWS + 3; r++) {
    generateRow(r);
  }

  pickNextTargetWord();
  document.getElementById("gameOverModal").classList.add("hidden");
  const successModal = document.getElementById("wordSuccessModal");
  if (successModal) successModal.classList.add("hidden");

  updateHUD();
  if (bgmEnabled && audioUnlocked) {
    startBGM();
  }
}

// ==========================================
// EVENT LISTENERS (KEYBOARD, TOUCH, KLIK, UI)
// ==========================================
// Pintasan uji pop up (tombol P & klik slot ke-4) hanya aktif jika URL berisi ?debug
// agar anak tidak bisa tanpa sengaja melewati kata dan mendapat poin gratis
const DEBUG_MODE = new URLSearchParams(window.location.search).has("debug");

window.addEventListener("keydown", e => {
  if (state.gameOver || state.paused) return;
  // Sebagian event (misal autofill browser) tidak memiliki e.key
  if (typeof e.key !== "string") return;

  // 3. ANTI KEPENCET TIDAK SENGAJA saat Pop Up Sukses Kata Tampil
  // Pop up ditutup HANYA lewat tombol Lanjut atau tombol Enter.
  // Tombol spasi dan panah TIDAK menutup pop up dan TIDAK menggerakkan slime.
  if (state.wordSuccessPaused) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (typeof proceedToNextWord === "function") {
        proceedToNextWord();
      }
    } else if (e.key === " " || e.key.startsWith("Arrow") || ["w", "a", "s", "d", "W", "A", "S", "D"].includes(e.key)) {
      e.preventDefault();
    }
    return;
  }

  const key = e.key.toLowerCase();
  if (key === "p" && DEBUG_MODE) {
    unlockAudio();
    const testWord = state.currentWordObj ? state.currentWordObj.word : "MEJA";
    completeWordSuccess(testWord, state.player.col, state.player.row, 100);
    return;
  }
  if (key === "arrowup" || key === "w" || key === " ") {
    e.preventDefault();
    tryJump(0, 1, "up");
  } else if (key === "arrowdown" || key === "s") {
    e.preventDefault();
    tryJump(0, -1, "down");
  } else if (key === "arrowleft" || key === "a") {
    e.preventDefault();
    tryJump(-1, 0, "left");
  } else if (key === "arrowright" || key === "d") {
    e.preventDefault();
    tryJump(1, 0, "right");
  }
});

document.getElementById("btnUp").addEventListener("click", () => tryJump(0, 1, "up"));
document.getElementById("btnDown").addEventListener("click", () => tryJump(0, -1, "down"));
document.getElementById("btnLeft").addEventListener("click", () => tryJump(-1, 0, "left"));
document.getElementById("btnRight").addEventListener("click", () => tryJump(1, 0, "right"));

// Klik langsung di area canvas untuk melompat ke arah klik (koordinat akurat sesuai getBoardMetrics)
canvas.addEventListener("pointerdown", e => {
  if (state.gameOver || state.paused || state.wordSuccessPaused) return;
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  const { tileW, tileH, startX, baseScreenY } = window.getBoardMetrics(rect.width, rect.height);
  const relRow = state.player.renderY - state.cameraRow;
  const px = startX + (state.player.renderX + 0.5) * tileW;
  const py = baseScreenY - relRow * tileH;

  const dx = clickX - px;
  const dy = clickY - py;

  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) tryJump(1, 0, "right");
    else tryJump(-1, 0, "left");
  } else {
    if (dy < 0) tryJump(0, 1, "up");
    else tryJump(0, -1, "down");
  }
});

// Tombol Pop Up Sukses Rangkai Kata
const btnNextWord = document.getElementById("btnNextWord");
if (btnNextWord) {
  btnNextWord.addEventListener("click", () => {
    if (typeof proceedToNextWord === "function") {
      proceedToNextWord();
    }
  });
}

const btnHearWord = document.getElementById("btnHearWord");
if (btnHearWord) {
  btnHearWord.addEventListener("click", () => {
    if (typeof speakWord === "function") {
      speakWord();
    }
  });
}

// Event untuk menguji perayaan kata (klik slot terakhir atau tekan P)
const slot3El = document.getElementById("slot3");
if (slot3El && DEBUG_MODE) {
  slot3El.style.cursor = "pointer";
  slot3El.addEventListener("click", () => {
    // Jangan picu perayaan ganda saat pop up tampil / game selesai / dijeda
    if (state.gameOver || state.paused || state.wordSuccessPaused) return;
    unlockAudio();
    const testWord = state.currentWordObj ? state.currentWordObj.word : "MEJA";
    completeWordSuccess(testWord, state.player.col, state.player.row, 100);
  });
}

document.getElementById("btnSkipWord").addEventListener("click", () => {
  // Saat pop up sukses tampil, kata berikutnya dipilih oleh tombol Lanjut
  if (state.gameOver || state.wordSuccessPaused) return;
  unlockAudio();
  if (rules.gameMode === "quest") {
    pickNextTargetWord();
    showToast("Kata target diganti!", "text-cyan-600");
  } else {
    state.collectedSlots = ["", "", "", ""];
    updateHUD();
    showToast("Slot huruf direset!", "text-cyan-600");
  }
});

// Tombol Musik Latar
const btnMusic = document.getElementById("btnMusicToggle");
if (btnMusic) {
  btnMusic.addEventListener("click", () => toggleBGM());
}

// Tombol Efek Suara & Suara Baca
const btnSound = document.getElementById("btnSoundToggle");
if (btnSound) {
  btnSound.addEventListener("click", () => toggleSFX());
}

document.getElementById("btnRestartGame").addEventListener("click", () => {
  unlockAudio();
  startNewGame();
});

// Modal Aturan & Kustomisasi
// Pasangan [id select di modal, kunci di rules] untuk pengaturan yang disimpan
const SETTING_SELECTS = [
  ["selectCrumbleTiles", "crumbleTiles"],
  ["selectMonsterSpeed", "monsterSpeed"],
  ["selectLivesMode", "livesMode"]
];

document.getElementById("btnRulesModal").addEventListener("click", () => {
  state.paused = true;
  document.getElementById("rulesModal").classList.remove("hidden");
});

document.getElementById("btnCloseRules").addEventListener("click", () => {
  state.paused = false;
  document.getElementById("rulesModal").classList.add("hidden");
});

document.getElementById("btnApplyRules").addEventListener("click", () => {
  rules.gameMode = document.getElementById("selectGameMode").value;
  rules.orderRule = document.getElementById("selectOrderRule").value;
  rules.penaltyRule = document.getElementById("selectPenaltyRule").value;
  rules.highlightHint = document.getElementById("selectHighlightHint").value;
  for (const [selectId, ruleKey] of SETTING_SELECTS) {
    const el = document.getElementById(selectId);
    if (el) rules[ruleKey] = el.value;
  }
  saveSettings();
  state.paused = false;
  document.getElementById("rulesModal").classList.add("hidden");
  startNewGame();
  showToast("Aturan baru berhasil diterapkan!", "text-emerald-600");
});

// ==========================================
// TOMBOL FULLSCREEN (HTML5 FULLSCREEN API)
// ==========================================
const btnFullscreen = document.getElementById("btnFullscreen");
if (btnFullscreen) {
  const getFullscreenElement = () =>
    document.fullscreenElement || document.webkitFullscreenElement || null;

  btnFullscreen.addEventListener("click", () => {
    // requestFullscreen bisa ditolak (misal iPhone), abaikan agar tidak muncul error
    try {
      let result;
      if (!getFullscreenElement()) {
        if (document.documentElement.requestFullscreen) {
          result = document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
          result = document.documentElement.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          result = document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          result = document.webkitExitFullscreen();
        }
      }
      if (result && typeof result.catch === "function") result.catch(() => {});
    } catch (e) {}
  });

  const onFullscreenChange = () => {
    const isFull = !!getFullscreenElement();
    btnFullscreen.title = isFull ? "Keluar Layar Penuh" : "Layar Penuh";
    setTimeout(resizeCanvas, 100);
  };
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
}

// ==========================================
// LEGENDA KONTROL (AUTO-HIDE SETELAH 5 DETIK & TOGGLE '?')
// ==========================================
const legendPill = document.getElementById("legendPill");
const btnToggleLegend = document.getElementById("btnToggleLegend");
let legendTimer = setTimeout(() => {
  if (legendPill) {
    legendPill.classList.add("hidden");
  }
}, 5000);

if (btnToggleLegend && legendPill) {
  btnToggleLegend.addEventListener("click", () => {
    legendPill.classList.toggle("hidden");
    if (legendTimer) clearTimeout(legendTimer);
  });
}

// ==========================================
// EVENT RESIZE & INISIALISASI
// ==========================================
window.addEventListener("resize", () => {
  resizeCanvas();
});

window.onload = () => {
  // Samakan pilihan di modal Aturan dengan pengaturan yang tersimpan
  for (const [selectId, ruleKey] of SETTING_SELECTS) {
    const el = document.getElementById(selectId);
    if (el) el.value = rules[ruleKey];
  }
  resizeCanvas();
  updateAudioUI();
  startNewGame();
  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(gameLoop);
};
