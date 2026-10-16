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
  state.shieldTimer = 0;
  state.rows.clear();
  state.particles = [];
  state.floatingTexts = [];

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
  state.cameraRow = 0;

  for (let r = 0; r <= VISIBLE_ROWS + 3; r++) {
    generateRow(r);
  }

  pickNextTargetWord();
  document.getElementById("gameOverModal").classList.add("hidden");
  updateHUD();
}

// ==========================================
// EVENT LISTENERS (KEYBOARD, TOUCH, KLIK, UI)
// ==========================================
window.addEventListener("keydown", e => {
  if (state.gameOver || state.paused) return;
  const key = e.key.toLowerCase();
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

// Klik langsung di area canvas untuk melompat ke arah klik
canvas.addEventListener("pointerdown", e => {
  if (state.gameOver || state.paused) return;
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  // Bandingkan dengan posisi layar karakter saat ini
  const W = canvas.width;
  const H = canvas.height;
  const tileW = Math.min(Math.floor((W * 0.86) / COLS), 68);
  const tileH = Math.floor(tileW * 0.72);
  const boardWidth = tileW * COLS;
  const startX = Math.floor((W - boardWidth) / 2);
  const baseScreenY = H - Math.floor(tileH * 2.1);
  const relRow = state.player.renderY - state.cameraRow;
  const px = startX + (state.player.renderX + 0.5) * tileW;
  const py = baseScreenY - (relRow + 0.5) * tileH;

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

document.getElementById("btnSkipWord").addEventListener("click", () => {
  initAudio();
  if (rules.gameMode === "quest") {
    pickNextTargetWord();
    showToast("Kata target diganti!", "text-cyan-300");
  } else {
    state.collectedSlots = ["", "", "", ""];
    updateHUD();
    showToast("Slot huruf direset!", "text-cyan-300");
  }
});

document.getElementById("btnSoundToggle").addEventListener("click", e => {
  soundEnabled = !soundEnabled;
  e.currentTarget.textContent = soundEnabled ? "🔊" : "🔇";
});

document.getElementById("btnRestartGame").addEventListener("click", () => {
  initAudio();
  startNewGame();
});

// Modal Aturan & Kustomisasi
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
  state.paused = false;
  document.getElementById("rulesModal").classList.add("hidden");
  startNewGame();
  showToast("Aturan baru berhasil diterapkan!", "text-emerald-300");
});

window.addEventListener("resize", () => {
  resizeCanvas();
});

window.onload = () => {
  resizeCanvas();
  startNewGame();
  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(gameLoop);
};
