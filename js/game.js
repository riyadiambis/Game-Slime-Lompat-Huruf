// ==========================================
// WEB AUDIO SYNTHESIZER (TANPA FILE EKSTERNAL)
// ==========================================
let audioCtx = null;
let soundEnabled = true;

function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playSound(type) {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === "jump") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(460, now + 0.09);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === "letter_ok") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.06); // E5
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.18);
  } else if (type === "word_complete") {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "triangle";
      o.connect(g);
      g.connect(audioCtx.destination);
      o.frequency.setValueAtTime(freq, now + idx * 0.06);
      g.gain.setValueAtTime(0.22, now + idx * 0.06);
      g.gain.exponentialRampToValueAtTime(0.008, now + idx * 0.06 + 0.22);
      o.start(now + idx * 0.06);
      o.stop(now + idx * 0.06 + 0.22);
    });
  } else if (type === "wrong" || type === "hit") {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.linearRampToValueAtTime(95, now + 0.2);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
    osc.start(now);
    osc.stop(now + 0.22);
  }
}

// ==========================================
// KONFIGURASI & STATE GAME VOXEL
// ==========================================
const COLS = 7;
const VISIBLE_ROWS = 13;

const rules = {
  gameMode: "quest",     // "quest" | "free"
  orderRule: "any",      // "any" | "strict"
  penaltyRule: "score",  // "score" | "life"
  highlightHint: "on"    // "on" | "off"
};

let state = {
  score: 0,
  lives: 3,
  wordsCompleted: 0,
  completedWords: [],
  gameOver: false,
  paused: false,
  currentWordObj: WORD_BANK[0],
  collectedSlots: ["", "", "", ""], // 4 slots
  shieldTimer: 0,
  cameraRow: 0,
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

// ==========================================
// GENERASI BARIS DUNIA VOXEL & HURUF
// ==========================================
function getNeededLetters() {
  if (rules.gameMode === "free") {
    return ["A", "I", "U", "E", "O", "B", "K", "L", "M", "R", "S", "T"];
  }
  const target = state.currentWordObj.word.split("");
  if (rules.orderRule === "strict") {
    const nextIdx = state.collectedSlots.findIndex(ch => ch === "");
    return nextIdx !== -1 ? [target[nextIdx]] : target;
  } else {
    const needed = [];
    for (let i = 0; i < 4; i++) {
      if (!state.collectedSlots[i]) needed.push(target[i]);
    }
    return needed.length > 0 ? needed : target;
  }
}

function pickSpawnLetter() {
  const needed = getNeededLetters();
  if (Math.random() < 0.58 && needed.length > 0) {
    return needed[Math.floor(Math.random() * needed.length)];
  }
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
  refreshExistingRowLetters();
  updateHUD();
}

function refreshExistingRowLetters() {
  // Pastikan di baris depan pemain selalu ada huruf yang dibutuhkan
  const needed = getNeededLetters();
  if (needed.length === 0) return;
  for (let r = state.player.row + 1; r <= state.player.row + 6; r++) {
    const rowData = generateRow(r);
    if (Math.random() < 0.65) {
      const randCol = Math.floor(Math.random() * COLS);
      rowData.tiles[randCol].item = {
        type: "letter",
        char: needed[Math.floor(Math.random() * needed.length)],
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
    playSound("letter_ok");
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

function fillWildcardLetter(col, row) {
  if (rules.gameMode === "free") {
    const emptyIdx = state.collectedSlots.findIndex(s => s === "");
    if (emptyIdx !== -1) {
      // Isi dengan vokal serbaguna 'A'
      state.collectedSlots[emptyIdx] = "A";
      playSound("letter_ok");
      spawnParticles(col, row, "#facc15", 18);
      spawnFloatingText(col, row, "★ JOKER -> A", "#facc15");
      checkWordCompletion(col, row);
      updateHUD();
    }
    return;
  }

  const target = state.currentWordObj.word.split("");
  const emptyIdx = state.collectedSlots.findIndex(s => s === "");
  if (emptyIdx !== -1) {
    state.collectedSlots[emptyIdx] = target[emptyIdx];
    state.score += 30;
    playSound("letter_ok");
    spawnParticles(col, row, "#facc15", 18);
    spawnFloatingText(col, row, `★ JOKER [${target[emptyIdx]}]`, "#facc15");
    checkWordCompletion(col, row);
    updateHUD();
  }
}

function processCollectedLetter(ch, col, row) {
  if (rules.gameMode === "free") {
    const emptyIdx = state.collectedSlots.findIndex(s => s === "");
    if (emptyIdx !== -1) {
      state.collectedSlots[emptyIdx] = ch;
      state.score += 15;
      playSound("letter_ok");
      spawnParticles(col, row, "#38bdf8", 12);
      spawnFloatingText(col, row, `+${ch}`, "#38bdf8");
      checkWordCompletion(col, row);
      updateHUD();
    }
    return;
  }

  // Mode Target Kata (Quest)
  const target = state.currentWordObj.word.split("");
  let matchedIndex = -1;

  if (rules.orderRule === "strict") {
    const nextEmpty = state.collectedSlots.findIndex(s => s === "");
    if (nextEmpty !== -1 && target[nextEmpty] === ch) {
      matchedIndex = nextEmpty;
    }
  } else {
    for (let i = 0; i < 4; i++) {
      if (state.collectedSlots[i] === "" && target[i] === ch) {
        matchedIndex = i;
        break;
      }
    }
  }

  if (matchedIndex !== -1) {
    state.collectedSlots[matchedIndex] = ch;
    state.score += 25;
    playSound("letter_ok");
    spawnParticles(col, row, "#10b981", 15);
    spawnFloatingText(col, row, `✓ ${ch} (+25)`, "#34d399");
    checkWordCompletion(col, row);
    refreshExistingRowLetters();
  } else {
    // Salah ambil huruf!
    playSound("wrong");
    spawnParticles(col, row, "#ef4444", 12);
    if ( rules.penaltyRule === "life" && state.shieldTimer <= 0 ) {
      state.lives -= 1;
      spawnFloatingText(col, row, `✗ ${ch} (-1 ❤️)`, "#f87171");
      showToast(`Huruf '${ch}' tidak cocok! -1 Nyawa`, "text-rose-400");
      if (state.lives <= 0) {
        triggerGameOver(`Kamu mengambil huruf '${ch}' yang salah hingga kehabisan nyawa.`);
      }
    } else {
      state.score = Math.max(0, state.score - 15);
      spawnFloatingText(col, row, `✗ ${ch} (-15 Poin)`, "#fbbf24");
      showToast(`Huruf '${ch}' bukan bagian kata target!`, "text-amber-300");
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
      // Tetap beri bonus kombinasi 4 huruf tapi lebih kecil
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
  state.shieldTimer = 4.0; // Kebal 4 detik (Word Fever!)
  playSound("word_complete");
  spawnParticles(col, row, "#facc15", 32);
  spawnFloatingText(col, row, `🎉 ${word}! +${bonus}`, "#facc15");
  showToast(`KATA TERBENTUK: "${word}" (+${bonus} Poin & Perisai 4 Detik!)`, "text-amber-300");

  if (rules.gameMode === "quest") {
    pickNextTargetWord();
  } else {
    state.collectedSlots = ["", "", "", ""];
    updateHUD();
  }
}

// ==========================================
// KONTROL LOMPAT KARAKTER VOXEL
// ==========================================
function tryJump(dCol, dRow, facingDir) {
  if (state.gameOver || state.paused) return;
  if (state.player.jumping) return;

  const targetCol = state.player.col + dCol;
  const targetRow = state.player.row + dRow;

  if (targetCol < 0 || targetCol >= COLS) return;
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

  playSound("jump");
}

function triggerGameOver(reasonText) {
  state.gameOver = true;
  playSound("hit");
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

  const modeBadge = document.getElementById("modeBadge");
  const orderBadge = document.getElementById("orderBadge");
  const clueEl = document.getElementById("wordClueText");

  if (rules.gameMode === "quest") {
    modeBadge.textContent = "Mode Target Kata";
    orderBadge.textContent = rules.orderRule === "strict" ? "Urutan: Harus 1→4" : "Urutan: Bebas";
    clueEl.innerHTML = `Petunjuk: <strong class="text-amber-300">${state.currentWordObj.clue}</strong>`;
  } else {
    modeBadge.textContent = "Mode Rangkai Bebas";
    orderBadge.textContent = "4 Huruf Apa Saja";
    clueEl.innerHTML = `Ambil <strong class="text-emerald-300">4 huruf apa pun</strong> untuk membentuk kata 4 huruf!`;
  }

  const targetChars = state.currentWordObj.word.split("");
  for (let i = 0; i < 4; i++) {
    const slotEl = document.getElementById(`slot${i}`);
    const collected = state.collectedSlots[i];
    if (collected) {
      slotEl.textContent = collected;
      slotEl.className =
        "letter-slot filled w-11 h-12 sm:w-13 sm:h-14 rounded-xl bg-emerald-500 border-2 border-emerald-300 flex items-center justify-center font-display font-extrabold text-xl sm:text-2xl text-slate-950";
    } else {
      // Tampilkan bayangan huruf tipis di mode quest agar mudah dipahami
      slotEl.textContent = rules.gameMode === "quest" ? targetChars[i] : "_";
      slotEl.className =
        "letter-slot w-11 h-12 sm:w-13 sm:h-14 rounded-xl bg-slate-800/90 border-2 border-slate-600 flex items-center justify-center font-display font-extrabold text-xl sm:text-2xl " +
        (rules.gameMode === "quest" ? "text-slate-500/70" : "text-slate-400");
    }
  }

  // Riwayat kata di footer
  const historyEl = document.getElementById("wordHistoryPills");
  if (state.completedWords.length === 0) {
    historyEl.innerHTML = `<span class="text-slate-500 italic">Lompat ke kubus huruf untuk mulai merangkai!</span>`;
  } else {
    historyEl.innerHTML = state.completedWords
      .slice(-8)
      .map(
        w =>
          `<span class="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-display font-bold text-xs">${w}</span>`
      )
      .join("");
  }
}

// ==========================================
// UPDATE LOGIKA PERMAINAN (FISIKA, RINTANGAN, DLL)
// ==========================================
function updateGame(dt) {
  if (state.gameOver || state.paused) return;

  if (state.shieldTimer > 0) {
    state.shieldTimer = Math.max(0, state.shieldTimer - dt);
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
    } else {
      const p = state.player.jumpProgress;
      state.player.renderX = state.player.startCol + (state.player.targetCol - state.player.startCol) * p;
      state.player.renderY = state.player.startRow + (state.player.targetRow - state.player.startRow) * p;
      state.player.jumpZ = Math.sin(p * Math.PI) * 0.95;
    }
  }

  // Kamera mengikuti baris pemain secara mulus
  const targetCam = Math.max(0, state.player.renderY - 2.3);
  state.cameraRow += (targetCam - state.cameraRow) * Math.min(1, dt * 6.5);
  // Kamera juga bergerak pelan ke depan agar tetap seru
  if (state.player.row >= 2) {
    state.cameraRow += dt * 0.22;
    if (state.player.renderY < state.cameraRow - 1.1) {
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

    // Update robot duri di baris jalan
    rowData.obstacles.forEach(obs => {
      obs.x += obs.dir * obs.speed * dt;
      if (obs.dir > 0 && obs.x > COLS + 0.5) obs.x = -0.5;
      if (obs.dir < 0 && obs.x < -0.5) obs.x = COLS + 0.5;

      // Deteksi tabrakan dengan pemain (jika tidak sedang di puncak lompatan atau perisai aktif)
      const sameRow = Math.abs(state.player.renderY - r) < 0.42;
      const sameCol = Math.abs(state.player.renderX - obs.x) < 0.52;
      if (sameRow && sameCol && state.player.jumpZ < 0.55) {
        if (state.shieldTimer > 0) {
          // Hancurkan rintangan saat mode perisai
          obs.x = -99;
          spawnParticles(state.player.renderX, r, "#facc15", 15);
          spawnFloatingText(state.player.renderX, r, "PERISAI!", "#facc15");
        } else {
          state.lives -= 1;
          playSound("hit");
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
