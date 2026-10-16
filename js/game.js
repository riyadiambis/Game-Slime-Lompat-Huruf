// ==========================================
// GAME LOGIC & VOXEL ENGINE
// Audio & Speech Synthesis dikelola secara modular oleh js/audio.js
// ==========================================

// ==========================================
// KONFIGURASI & STATE GAME VOXEL
// ==========================================
const COLS = 7;
const VISIBLE_ROWS = 13;

const rules = {
  gameMode: "quest",
  orderRule: "strict",   // Selalu "strict" (wajib berurutan 1 sampai 4)
  penaltyRule: "none",   // Ramah anak: makan huruf salah tanpa penalti
  highlightHint: "off"   // Selalu "off" (tanpa penanda warna/halo pada huruf target)
};

let state = {
  score: 0,
  lives: 3,
  wordsCompleted: 0,
  completedWords: [],
  gameOver: false,
  paused: false,
  wordSuccessPaused: false,
  currentWordObj: WORD_BANK[0],
  collectedSlots: ["", "", "", ""], // 4 slots
  pendingLetterRespawns: [], // antrean huruf yang harus muncul kembali setelah 2 detik
  shieldTimer: 0,
  cameraRow: 1,
  player: {
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
  },
  rows: new Map(), // rowIndex -> rowData
  particles: [],
  floatingTexts: []
};

// Pengucapan huruf (speakLetter, speakLetterAndSyllable) disediakan oleh js/audio.js

// ==========================================
// GENERASI BARIS DUNIA VOXEL & HURUF
// ==========================================
// Dapatkan huruf yang sedang dicari saat ini (slot kosong paling pertama)
function getCurrentTargetLetter() {
  if (!state.currentWordObj || !state.currentWordObj.word) return "";
  const targetChars = state.currentWordObj.word.split("");
  const nextIdx = state.collectedSlots.findIndex(ch => ch === "");
  return nextIdx !== -1 ? targetChars[nextIdx] : "";
}

// Dapatkan seluruh sisa huruf yang masih dibutuhkan dalam kata (dari slot kosong ke belakang)
function getRemainingNeededLetters() {
  if (!state.currentWordObj || !state.currentWordObj.word) return [];
  const targetChars = state.currentWordObj.word.split("");
  const nextIdx = state.collectedSlots.findIndex(ch => ch === "");
  if (nextIdx === -1) return [];
  return targetChars.slice(nextIdx);
}

function getNeededLetters() {
  const cur = getCurrentTargetLetter();
  return cur ? [cur] : [];
}

function pickSpawnLetter() {
  const currentTarget = getCurrentTargetLetter();
  const remaining = getRemainingNeededLetters();
  const roll = Math.random();

  // 50% peluang: huruf yang PERSIS sedang dicari saat ini
  if (roll < 0.50 && currentTarget) {
    return currentTarget;
  }
  // 25% peluang: salah satu huruf berikutnya di sisa kata (termasuk huruf berulang)
  if (roll < 0.75 && remaining.length > 0) {
    return remaining[Math.floor(Math.random() * remaining.length)];
  }
  // 25% peluang: huruf alfabet acak sebagai pengecoh membaca
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return alphabet[Math.floor(Math.random() * alphabet.length)];
}

function generateRow(rowIndex) {
  if (state.rows.has(rowIndex)) return state.rows.get(rowIndex);

  // Baris awal selalu aman
  const isSafeStart = rowIndex <= 2;
  let rowType = "grass";
  if (!isSafeStart) {
    const r = Math.random();
    if (r < 0.55) rowType = "grass";
    else if (r < 0.82) rowType = "road";
    else rowType = "crumble";
  }

  const tiles = [];
  for (let c = 0; c < COLS; c++) {
    let tileState = "solid";
    let crumbleTimer = 0;
    let item = null;

    // Tambahkan huruf atau item di beberapa petak
    if (rowIndex >= 2) {
      const itemRoll = Math.random();
      if (itemRoll < 0.28) {
        item = {
          type: "letter",
          char: pickSpawnLetter(),
          bobOffset: Math.random() * Math.PI * 2
        };
      } else if (itemRoll < 0.305) {
        item = {
          type: "wildcard",
          char: "★",
          bobOffset: Math.random() * Math.PI * 2
        };
      } else if (itemRoll < 0.315 && state.lives < 3) {
        item = {
          type: "heart",
          char: "♥",
          bobOffset: Math.random() * Math.PI * 2
        };
      }
    }

    tiles.push({
      col: c,
      type: rowType,
      state: tileState,
      crumbleTimer: crumbleTimer,
      item: item
    });
  }

  // Tambahkan rintangan bergerak (Robot Duri Voxel) di jalur "road"
  const obstacles = [];
  if (rowType === "road" && !isSafeStart) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = 1.15 + Math.random() * 1.15 + Math.min(0.8, state.wordsCompleted * 0.08);
    const count = Math.random() < 0.45 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      obstacles.push({
        x: (i * (COLS / count) + Math.random() * 1.5) % COLS,
        dir: dir,
        speed: speed
      });
    }
  }

  const rowData = {
    rowIndex,
    rowType,
    tiles,
    obstacles
  };
  state.rows.set(rowIndex, rowData);
  return rowData;
}

// ==========================================
// LOGIKA KATA 4 HURUF & SKOR
// ==========================================
function pickNextTargetWord() {
  const remaining = WORD_BANK.filter(
    w => w.word !== (state.currentWordObj && state.currentWordObj.word)
  );
  state.currentWordObj = remaining[Math.floor(Math.random() * remaining.length)];
  state.collectedSlots = ["", "", "", ""];
  state.pendingLetterRespawns = [];
  refreshExistingRowLetters();
  updateHUD();
}

function refreshExistingRowLetters() {
  const currentTarget = getCurrentTargetLetter();
  if (!currentTarget) return;

  // Cek apakah huruf yang sedang dicari saat ini sudah ada di baris depan
  let countTargetAhead = 0;
  for (let r = state.player.row + 1; r <= state.player.row + 5; r++) {
    const rowData = generateRow(r);
    for (const tile of rowData.tiles) {
      if (tile.item && tile.item.type === "letter" && tile.item.char === currentTarget) {
        countTargetAhead++;
      }
    }
  }

  // Jika belum ada di baris depan, pastikan muncul di salah satu petak yang aman dijangkau
  if (countTargetAhead === 0) {
    const targetRowIdx = state.player.row + 2 + Math.floor(Math.random() * 3);
    const rowData = generateRow(targetRowIdx);
    const emptyCols = [];
    for (let c = 0; c < COLS; c++) {
      if (!rowData.tiles[c].item && rowData.tiles[c].state !== "fallen") {
        emptyCols.push(c);
      }
    }
    if (emptyCols.length > 0) {
      const chosenCol = emptyCols[Math.floor(Math.random() * emptyCols.length)];
      rowData.tiles[chosenCol].item = {
        type: "letter",
        char: currentTarget,
        bobOffset: Math.random() * Math.PI * 2
      };
    }
  }
}

function showToast(msg, colorClass = "text-emerald-300") {
  const toast = document.getElementById("statusToast");
  toast.textContent = msg;
  toast.className = `pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full bg-slate-950/90 border border-slate-700 text-xs sm:text-sm font-bold ${colorClass} opacity-100 transition-opacity duration-200 shadow-lg z-20`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("opacity-100");
    toast.classList.add("opacity-0");
  }, 1700);
}

function spawnParticles(col, row, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3.5;
    state.particles.push({
      col,
      row,
      vx: Math.cos(angle) * speed * 0.08,
      vy: Math.sin(angle) * speed * 0.08,
      vz: 2 + Math.random() * 3.5,
      z: 0.2,
      color,
      life: 1.0
    });
  }
}

function spawnFloatingText(col, row, text, color = "#34d399") {
  state.floatingTexts.push({
    col,
    row,
    z: 1.2,
    text,
    color,
    life: 1.0
  });
}

function handleCollectItem(tile, col, row) {
  const item = tile.item;
  if (!item) return;

  if (item.type === "heart") {
    tile.item = null;
    state.lives = Math.min(3, state.lives + 1);
    playSFX("heart"); // Bunyi "pop" lembut
    spawnParticles(col, row, "#f43f5e", 16);
    spawnFloatingText(col, row, "+1 NYAWA ♥", "#fb7185");
    updateHUD();
    return;
  }

  if (item.type === "wildcard") {
    tile.item = null;
    fillWildcardLetter(col, row);
    return;
  }

  if (item.type === "letter") {
    const ch = item.char;
    tile.item = null;
    processCollectedLetter(ch, col, row);
  }
}

// Helper pembagian suku kata yang aman (jika audio.js belum siap atau standalone)
function getWordSyllablesSafe(word) {
  if (typeof getWordSyllables === "function") {
    return getWordSyllables(word);
  }
  if (!word || word.length < 2) return [word, ""];
  const w = word.toLowerCase();
  const vowels = ["a", "i", "u", "e", "o"];
  if (vowels.includes(w[0]) && !vowels.includes(w[1])) {
    return [w.slice(0, 1), w.slice(1)];
  }
  return [w.slice(0, 2), w.slice(2)];
}

function fillWildcardLetter(col, row) {
  const targetChars = state.currentWordObj.word.split("");
  const currentSlotIndex = state.collectedSlots.findIndex(s => s === "");
  if (currentSlotIndex !== -1) {
    const filledChar = targetChars[currentSlotIndex];
    state.collectedSlots[currentSlotIndex] = filledChar;
    state.score += 30;
    const completesWord = !state.collectedSlots.some(s => s === "");

    // Jika bintang mengisi slot terakhir, biarkan jingle & suara perayaan kata yang tampil
    // (arpeggio bintang memakai nada yang sama dengan jingle sehingga terdengar bertabrakan)
    if (!completesWord) {
      playSFX("star"); // Arpeggio 3 nada naik saat ambil bintang joker

      // Suara baca sesuai posisi slot
      if (currentSlotIndex === 1) {
        // Saat slot 2 terisi: bacakan suku kata pertama (contoh: "E... me")
        const [syl1] = getWordSyllablesSafe(state.currentWordObj.word);
        speakLetterAndSyllable(filledChar, syl1);
      } else {
        speakLetter(filledChar);
      }
    }

    spawnParticles(col, row, "#facc15", 18);
    spawnFloatingText(col, row, `★ ${filledChar} (+30)`, "#facc15");
    checkWordCompletion(col, row);
    refreshExistingRowLetters();
    updateHUD();
  }
}

function processCollectedLetter(ch, col, row) {
  const targetChars = state.currentWordObj.word.split("");
  const currentSlotIndex = state.collectedSlots.findIndex(s => s === "");
  if (currentSlotIndex === -1) return;

  // Mode bebas: huruf apa saja langsung mengisi slot berikutnya
  const isFreeMode = rules.gameMode === "free";
  const expectedChar = isFreeMode ? ch : targetChars[currentSlotIndex];

  if (ch === expectedChar) {
    // ==========================================
    // HURUF BENAR (sesuai urutan berikutnya)
    // ==========================================
    state.collectedSlots[currentSlotIndex] = ch;
    state.score += 25;
    playSFX("letter_ok"); // "ting" ceria + gelembung pecah

    // Suara baca: saat huruf benar diambil
    // (suku kata hanya relevan di mode misi, karena di mode bebas kata belum tentu sama dengan target)
    if (currentSlotIndex === 1 && !isFreeMode) {
      // Saat slot 2 terisi: bacakan huruf & suku kata pertama (contoh MEJA: "me")
      const [syl1] = getWordSyllablesSafe(state.currentWordObj.word);
      speakLetterAndSyllable(ch, syl1);
    } else {
      speakLetter(ch); // Bacakan huruf
    }

    spawnParticles(col, row, "#10b981", 16);
    spawnFloatingText(col, row, `✓ ${ch} (+25)`, "#34d399");
    checkWordCompletion(col, row);
    refreshExistingRowLetters();
  } else {
    // ==========================================
    // HURUF SALAH (bukan urutan berikutnya)
    // ==========================================
    // Slime memakan huruf itu (gelembung hilang)
    // TIDAK ADA BUNYI SAMA SEKALI (Aturan Belajar Ramah Anak)
    // TIDAK mengurangi nyawa, TIDAK mengurangi skor
    spawnParticles(col, row, "#bae6fd", 8);

    // Cek apakah huruf yang dimakan masih dibutuhkan di slot berikutnya
    const remainingNeeded = targetChars.slice(currentSlotIndex);
    const isStillNeeded = remainingNeeded.includes(ch);

    if (isStillNeeded) {
      if (!state.pendingLetterRespawns) state.pendingLetterRespawns = [];
      state.pendingLetterRespawns.push({
        char: ch,
        timer: 2.0 // Muncul kembali setelah 2 detik di posisi depan
      });
    }
  }
  updateHUD();
}

function checkWordCompletion(col, row) {
  if (state.collectedSlots.some(s => s === "")) return;

  const formedWord = state.collectedSlots.join("");
  if (rules.gameMode === "free") {
    if (EXTRA_VALID_4_WORDS.has(formedWord)) {
      completeWordSuccess(formedWord, col, row, 120);
    } else {
      completeWordSuccess(formedWord, col, row, 70);
    }
  } else {
    completeWordSuccess(formedWord, col, row, 100);
  }
}

function completeWordSuccess(word, col, row, bonus) {
  state.score += bonus;
  state.wordsCompleted += 1;
  state.completedWords.push(word);

  if (typeof playSFX === "function") {
    playSFX("word_complete"); // Jingle kemenangan 5 nada
  }

  // Suara baca kata lengkap jika modul suara aktif
  if (typeof speakWordCelebration === "function") {
    const [syl1, syl2] = getWordSyllablesSafe(word);
    speakWordCelebration(word, syl1, syl2);
  }

  spawnParticles(col, row, "#facc15", 32);
  spawnFloatingText(col, row, `🎉 ${word}! +${bonus}`, "#facc15");
  showToast(`KATA TERBENTUK: "${word}" (+${bonus} Poin!)`, "text-amber-300");

  // Tampilkan Pop Up Sukses Kata & PAUSE TOTAL permainan
  showWordSuccessModal(word);
}

// 5 Variasi judul acak ceria
const CELEBRATION_TITLES = [
  "Hebat! 🎉",
  "Kamu Berhasil! ⭐",
  "Luar Biasa! 🌟",
  "Pintar Sekali! 👏",
  "Keren Banget! 🚀"
];

let canProceedNextWord = false;
let currentCelebrationWord = "";
let nextWordCooldownTimer = null;

function showWordSuccessModal(word) {
  currentCelebrationWord = word;
  state.wordSuccessPaused = true;

  const modal = document.getElementById("wordSuccessModal");
  const titleEl = document.getElementById("successTitle");
  const wordEl = document.getElementById("successWordText");
  const syl1El = document.getElementById("syllablePill1");
  const syl2El = document.getElementById("syllablePill2");
  const btnNext = document.getElementById("btnNextWord");
  const cooldownHint = document.getElementById("nextWordCooldownHint");

  // 1. Judul acak ceria (4 sampai 5 variasi)
  if (titleEl) {
    const randomTitle = CELEBRATION_TITLES[Math.floor(Math.random() * CELEBRATION_TITLES.length)];
    titleEl.textContent = randomTitle;
  }

  // 2. Kata ditulis BESAR di tengah
  if (wordEl) {
    wordEl.textContent = word.toUpperCase();
  }

  // 3. Dipecah per suku kata dengan warna berbeda
  const [syl1, syl2] = getWordSyllablesSafe(word);
  if (syl1El) syl1El.textContent = syl1.toUpperCase();
  if (syl2El) syl2El.textContent = syl2.toUpperCase();

  // 4. Anti-kepencet tidak sengaja: tombol Lanjut baru aktif 1 detik setelah pop up muncul (tampil redup dulu)
  canProceedNextWord = false;
  window.canProceedNextWord = false;
  if (btnNext) {
    btnNext.disabled = true;
    btnNext.classList.add("opacity-50", "cursor-not-allowed");
    btnNext.classList.remove("opacity-100", "cursor-pointer");
  }
  if (cooldownHint) {
    cooldownHint.textContent = "Tunggu 1 detik...";
    cooldownHint.classList.remove("opacity-0");
  }

  // Batalkan hitung mundur lama agar tombol tidak aktif lebih cepat dari 1 detik
  clearTimeout(nextWordCooldownTimer);
  nextWordCooldownTimer = setTimeout(() => {
    nextWordCooldownTimer = null;
    canProceedNextWord = true;
    window.canProceedNextWord = true;
    if (btnNext) {
      btnNext.disabled = false;
      btnNext.classList.remove("opacity-50", "cursor-not-allowed");
      btnNext.classList.add("opacity-100", "cursor-pointer");
    }
    if (cooldownHint) {
      cooldownHint.textContent = "Tekan tombol Lanjut atau Enter ↵";
    }
  }, 1000);

  if (modal) {
    modal.classList.remove("hidden");
  }
}

function proceedToNextWord() {
  if (!state.wordSuccessPaused) return;
  if (!canProceedNextWord && !window.canProceedNextWord) return;
  canProceedNextWord = false;
  window.canProceedNextWord = false;

  const modal = document.getElementById("wordSuccessModal");
  if (modal) {
    modal.classList.add("hidden");
  }

  // Unpause game
  state.wordSuccessPaused = false;

  // Slime diberi kebal 1,5 detik (berkedip transparan)
  state.shieldTimer = 1.5;

  // Kata baru dimulai, slot kata dikosongkan
  if (rules.gameMode === "quest") {
    pickNextTargetWord();
  } else {
    state.collectedSlots = ["", "", "", ""];
  }
  updateHUD();
}

// Fungsi dengar kata yang aman dipanggil
window.speakWord = function(kata) {
  const target = kata || currentCelebrationWord;
  if (!target) return;
  if (typeof speakWordCelebration === "function") {
    const [syl1, syl2] = getWordSyllablesSafe(target);
    speakWordCelebration(target, syl1, syl2);
  } else if (typeof window.speechSynthesis !== "undefined") {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(target);
      u.lang = "id-ID";
      u.rate = 0.8;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
};

window.proceedToNextWord = proceedToNextWord;
window.showWordSuccessModal = showWordSuccessModal;

// ==========================================
// KONTROL LOMPAT KARAKTER VOXEL
// ==========================================
function tryJump(dCol, dRow, facingDir) {
  if (state.gameOver || state.paused || state.wordSuccessPaused) return;
  if (state.player.jumping) return;

  const targetCol = state.player.col + dCol;
  const targetRow = state.player.row + dRow;

  if (targetCol < 0 || targetCol >= COLS) return;
  // Baris negatif tidak pernah digambar, slime akan hilang ke luar dunia
  if (targetRow < 0) return;
  if (targetRow < Math.floor(state.cameraRow) - 1) return;

  state.player.jumping = true;
  state.player.jumpProgress = 0;
  state.player.startCol = state.player.col;
  state.player.startRow = state.player.row;
  state.player.targetCol = targetCol;
  state.player.targetRow = targetRow;
  state.player.facing = facingDir;

  // Pastikan baris di depan sudah digenerate
  for (let r = targetRow - 2; r <= targetRow + VISIBLE_ROWS; r++) {
    if (r >= 0) generateRow(r);
  }

  playSFX("jump"); // "boing" kenyal khas slime
}

function triggerGameOver(reasonText) {
  // Cegah game over ganda dalam satu frame (misal lantai runtuh + tertabrak bersamaan)
  if (state.gameOver) return;
  state.gameOver = true;
  playSFX("game_over"); // 3 nada turun pelan & stop BGM
  document.getElementById("gameOverReason").textContent = reasonText;
  document.getElementById("finalScoreText").textContent = state.score;
  document.getElementById("finalWordsText").textContent = state.wordsCompleted;

  const listEl = document.getElementById("completedWordsList");
  if (state.completedWords.length > 0) {
    listEl.innerHTML = `Kata berhasil dirangkai: <strong class="text-emerald-300">${state.completedWords.join(", ")}</strong>`;
  } else {
    listEl.textContent = "Belum ada kata 4 huruf yang selesai dirangkai.";
  }

  document.getElementById("gameOverModal").classList.remove("hidden");
}

// ==========================================
// UPDATE HUD & UI
// ==========================================
function updateHUD() {
  document.getElementById("scoreDisplay").textContent = state.score;
  document.getElementById("wordsCountDisplay").textContent = state.wordsCompleted;
  document.getElementById("livesDisplay").textContent =
    state.lives > 0 ? "❤️".repeat(state.lives) : "💀";

  const clueEl = document.getElementById("wordClueText");
  if (clueEl) {
    if (rules.gameMode === "quest") {
      clueEl.innerHTML = `<strong class="text-slate-900">${state.currentWordObj.clue}</strong>`;
    } else {
      clueEl.innerHTML = `<strong class="text-slate-900">Susun kata 4 huruf!</strong>`;
    }
  }

  const activeSlotIdx = state.collectedSlots.findIndex(ch => ch === "");

  for (let i = 0; i < 4; i++) {
    const slotEl = document.getElementById(`slot${i}`);
    if (!slotEl) continue;
    const collected = state.collectedSlots[i];
    if (collected) {
      slotEl.textContent = collected;
      slotEl.className = "letter-slot filled";
    } else if (i === activeSlotIdx) {
      // Slot yang sedang dicari: diberi tanda stabilo kuning berdenyut (menunjukkan posisi, BUKAN hurufnya)
      slotEl.textContent = "_";
      slotEl.className = "letter-slot active-target";
    } else {
      // Slot berikutnya: kosong polos
      slotEl.textContent = "_";
      slotEl.className = "letter-slot";
    }
  }

  // Riwayat kata di bar atas (pills kecil)
  const historyEl = document.getElementById("wordHistoryPills");
  if (historyEl) {
    if (state.completedWords.length === 0) {
      historyEl.innerHTML = "";
    } else {
      historyEl.innerHTML = state.completedWords
        .slice(-3)
        .map(
          w =>
            `<span class="px-1.5 py-0.5 rounded-lg bg-emerald-100 border border-emerald-600 text-emerald-800 font-display font-extrabold text-[11px] shadow-[1px_1px_0_#059669]">${w}</span>`
        )
        .join("");
    }
  }
}

// ==========================================
// UPDATE LOGIKA PERMAINAN (FISIKA, RINTANGAN, DLL)
// ==========================================
function updateGame(dt) {
  if (state.gameOver || state.paused || state.wordSuccessPaused) return;

  if (state.shieldTimer > 0) {
    state.shieldTimer = Math.max(0, state.shieldTimer - dt);
  }

  // Update antrean huruf yang harus muncul kembali (setelah 2 detik di posisi depan yang bisa dijangkau)
  if (state.pendingLetterRespawns && state.pendingLetterRespawns.length > 0) {
    for (let i = state.pendingLetterRespawns.length - 1; i >= 0; i--) {
      const respawnItem = state.pendingLetterRespawns[i];
      respawnItem.timer -= dt;
      if (respawnItem.timer <= 0) {
        let placed = false;
        // Tempatkan di petak aman yang kosong di 2 sampai 5 baris di depan pemain
        for (let r = state.player.row + 2; r <= state.player.row + 5; r++) {
          const rowData = generateRow(r);
          const emptyCols = [];
          for (let c = 0; c < COLS; c++) {
            if (!rowData.tiles[c].item && rowData.tiles[c].state !== "fallen") {
              emptyCols.push(c);
            }
          }
          if (emptyCols.length > 0) {
            const chosenCol = emptyCols[Math.floor(Math.random() * emptyCols.length)];
            rowData.tiles[chosenCol].item = {
              type: "letter",
              char: respawnItem.char,
              bobOffset: Math.random() * Math.PI * 2
            };
            placed = true;
            break;
          }
        }
        if (placed || respawnItem.timer < -2.0) {
          state.pendingLetterRespawns.splice(i, 1);
        }
      }
    }
  }

  // Animasi lompat karakter
  if (state.player.jumping) {
    state.player.jumpProgress += dt * 6.8;
    if (state.player.jumpProgress >= 1) {
      state.player.jumping = false;
      state.player.jumpProgress = 0;
      state.player.col = state.player.targetCol;
      state.player.row = state.player.targetRow;
      state.player.renderX = state.player.col;
      state.player.renderY = state.player.row;
      state.player.jumpZ = 0;
      playSFX("land"); // "plop" pelan saat mendarat

      // Skor maju
      if (state.player.row > state.player.startRow) {
        state.score += 2;
      }

      // Cek petak tempat mendarat
      const rowData = generateRow(state.player.row);
      const tile = rowData.tiles[state.player.col];
      if (tile) {
        if (tile.state === "fallen") {
          triggerGameOver("Kamu melompat ke lubang lantai voxel yang sudah runtuh!");
          return;
        }
        handleCollectItem(tile, state.player.col, state.player.row);
      }
      updateHUD();
      // Kata baru saja lengkap: pop up tampil, hentikan sisa update frame ini
      // agar slime jahat tidak menabrak di balik pop up
      if (state.wordSuccessPaused) return;
    } else {
      const p = state.player.jumpProgress;
      state.player.renderX = state.player.startCol + (state.player.targetCol - state.player.startCol) * p;
      state.player.renderY = state.player.startRow + (state.player.targetRow - state.player.startRow) * p;
      state.player.jumpZ = Math.sin(p * Math.PI) * 0.95;
    }
  }

  // Kamera mengikuti baris pemain secara mulus
  // Slime selalu terlihat di sepertiga bawah layar (baseScreenY = H * 0.72)
  state.cameraRow += (state.player.renderY - state.cameraRow) * Math.min(1, dt * 7.0);

  // Kamera juga bergerak pelan ke depan agar tetap seru
  if (state.player.row >= 2) {
    state.cameraRow += dt * 0.18;
    if (state.player.renderY < state.cameraRow - 1.8) {
      triggerGameOver("Kamu tertinggal oleh pergeseran layar!");
      return;
    }
  }

  // Update lantai runtuh (crumble) & rintangan bergerak
  const minRow = Math.max(0, Math.floor(state.cameraRow) - 2);
  const maxRow = Math.floor(state.cameraRow) + VISIBLE_ROWS;

  for (let r = minRow; r <= maxRow; r++) {
    const rowData = generateRow(r);

    // Cek lantai retak jika diinjak
    if (!state.player.jumping && state.player.row === r) {
      const currentTile = rowData.tiles[state.player.col];
      if (currentTile && currentTile.type === "crumble" && currentTile.state === "solid") {
        currentTile.state = "cracking";
        currentTile.crumbleTimer = 1.15;
      }
    }

    rowData.tiles.forEach(tile => {
      if (tile.state === "cracking") {
        tile.crumbleTimer -= dt;
        if (tile.crumbleTimer <= 0) {
          tile.state = "fallen";
          if (!state.player.jumping && state.player.row === r && state.player.col === tile.col) {
            triggerGameOver("Lantai es/magma di bawah kakimu runtuh! Lompat lebih cepat.");
          }
        }
      }
    });

    if (state.gameOver) return;

    // Update robot duri di baris jalan
    rowData.obstacles.forEach(obs => {
      if (state.gameOver) return;
      obs.x += obs.dir * obs.speed * dt;
      if (obs.dir > 0 && obs.x > COLS + 0.5) obs.x = -0.5;
      if (obs.dir < 0 && obs.x < -0.5) obs.x = COLS + 0.5;

      // Deteksi tabrakan dengan pemain (jika tidak sedang di puncak lompatan atau perisai aktif)
      const sameRow = Math.abs(state.player.renderY - r) < 0.42;
      const sameCol = Math.abs(state.player.renderX - obs.x) < 0.52;
      if (sameRow && sameCol && state.player.jumpZ < 0.55) {
        if (state.shieldTimer > 0) {
          // Hancurkan rintangan saat mode perisai: lempar ke luar layar di sisi asalnya
          // (x = -99 untuk slime yang bergerak ke kiri langsung di-wrap kembali ke tepi kanan)
          obs.x = obs.dir > 0 ? -3 : COLS + 3;
          spawnParticles(state.player.renderX, r, "#facc15", 15);
          spawnFloatingText(state.player.renderX, r, "PERISAI!", "#facc15");
        } else {
          state.lives -= 1;
          playSFX("hit"); // "dug" berat saat kena musuh
          spawnParticles(state.player.renderX, r, "#f43f5e", 22);
          state.shieldTimer = 1.6; // Kebal sesaat setelah tertabrak
          updateHUD();
          if (state.lives <= 0) {
            triggerGameOver("Karaktermu tertabrak Slime Jahat Berduri!");
          } else {
            showToast("Aduh! Tertabrak Slime Jahat (-1 ❤️)", "text-rose-400");
          }
        }
      }
    });
  }

  // Update partikel voxel
  state.particles.forEach(p => {
    p.col += p.vx;
    p.row += p.vy;
    p.z += p.vz * dt;
    p.vz -= 9.8 * dt;
    p.life -= dt * 1.6;
  });
  state.particles = state.particles.filter(p => p.life > 0);

  // Update teks melayang
  state.floatingTexts.forEach(ft => {
    ft.z += dt * 1.4;
    ft.life -= dt * 1.1;
  });
  state.floatingTexts = state.floatingTexts.filter(ft => ft.life > 0);
}
