// =======================================================
// AUDIO ENGINE: CHIPTUNE BGM, SFX & SPEECH SYNTHESIS (id-ID)
// Murni Web Audio API & Web Speech API (Tanpa File Eksternal)
// =======================================================

// State Audio Global
let audioCtx = null;
let musicMasterGain = null;
let sfxMasterGain = null;

let bgmEnabled = localStorage.getItem("slime_bgm_enabled") !== "false"; // default true
let sfxEnabled = localStorage.getItem("slime_sfx_enabled") !== "false"; // default true

let audioUnlocked = false;
let bgmIsPlaying = false;
let bgmIntervalId = null;

// Lookahead Scheduling untuk Chiptune BGM
let nextStepTime = 0;
let currentBgmStep = 0;
let currentBgmSection = 0; // 0 = Bagian A, 1 = Bagian B
const STEP_TIME = 0.165; // ~90 BPM (not 1/8)

// State Ducking (mengecilkan musik saat suara baca aktif)
let isDucking = false;
let duckSafetyTimer = null;

// State Speech Synthesis
let idVoice = null;

// ==========================================
// 1. INISIALISASI & UNLOCK AUDIOCONTEXT
// ==========================================
function initAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();

      // Master Gain untuk Musik (Volume pelan ~25%)
      musicMasterGain = audioCtx.createGain();
      musicMasterGain.gain.setValueAtTime(bgmEnabled ? 0.25 : 0.0, audioCtx.currentTime);
      musicMasterGain.connect(audioCtx.destination);

      // Master Gain untuk SFX
      sfxMasterGain = audioCtx.createGain();
      sfxMasterGain.gain.setValueAtTime(sfxEnabled ? 0.8 : 0.0, audioCtx.currentTime);
      sfxMasterGain.connect(audioCtx.destination);
    }
  }

  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

// Browser Autoplay Policy: Unlock pada interaksi pertama pengguna
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  initAudioContext();

  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (e) {}
  }

  // Mulai BGM jika diaktifkan dan game belum selesai
  if (bgmEnabled && typeof state !== "undefined" && !state.gameOver) {
    startBGM();
  }

  // Hapus listener sekali pakai
  window.removeEventListener("pointerdown", unlockAudio);
  window.removeEventListener("keydown", unlockAudio);
  window.removeEventListener("touchstart", unlockAudio);
}

window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);
window.addEventListener("touchstart", unlockAudio);

// ==========================================
// 2. FREKUENSI NADA & MELODI CHIPTUNE SLIME
// ==========================================
const NOTE_FREQS = {
  "C3": 130.81, "D3": 146.83, "E3": 164.81, "F2": 87.31, "F3": 174.61, "G2": 98.00, "G3": 196.00, "A2": 110.00, "A3": 220.00, "B2": 123.47, "B3": 246.94,
  "C4": 261.63, "D4": 293.66, "E4": 329.63, "F4": 349.23, "G4": 392.00, "A4": 440.00, "B4": 493.88,
  "C5": 523.25, "D5": 587.33, "E5": 659.25, "F5": 698.46, "G5": 783.99, "A5": 880.00, "B5": 987.77,
  "C6": 1046.50
};

// Bagian A (Melodi Utama Ceria & Menggemaskan - 32 Step)
const MELODY_SECTION_A = [
  "C5", "E5", "G5", null, "E5", "D5", "C5", null,
  "D5", "E5", "F5", "E5", "D5", "C5", "D5", null,
  "E5", "G5", "A5", "G5", "C6", "A5", "G5", null,
  "A5", "G5", "E5", "D5", "C5", null, null, null
];

const BASS_SECTION_A = [
  "C3", null, "G3", null, "C3", null, "G3", null,
  "F2", null, "C3", null, "F2", null, "C3", null,
  "A2", null, "E3", null, "A2", null, "E3", null,
  "G2", null, "D3", null, "C3", null, "G3", null
];

// Bagian B (Variasi Melodi Berirama Mengambang - 32 Step)
const MELODY_SECTION_B = [
  "A5", null, "G5", null, "F5", "G5", "A5", null,
  "G5", null, "E5", null, "D5", "E5", "G5", null,
  "F5", "A5", "C6", "A5", "G5", "E5", "D5", null,
  "C5", "D5", "E5", "G5", "C5", null, null, null
];

const BASS_SECTION_B = [
  "F2", null, "C3", null, "F2", null, "C3", null,
  "C3", null, "G3", null, "C3", null, "G3", null,
  "D3", null, "A3", null, "G2", null, "D3", null,
  "C3", null, "G3", null, "C3", null, null, null
];

// Mainkan 1 not lead melodi chiptune
function playChiptuneLead(freq, time, duration) {
  if (!audioCtx || !musicMasterGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  // Gelombang square dengan filter lembut agar nuansa retro 8-bit tetap manis dan tidak bising
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, time);

  gain.gain.setValueAtTime(0.09, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + duration - 0.02);

  osc.connect(gain);
  gain.connect(musicMasterGain);

  osc.start(time);
  osc.stop(time + duration);
}

// Mainkan 1 not bass chiptune
function playChiptuneBass(freq, time, duration) {
  if (!audioCtx || !musicMasterGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  // Gelombang triangle bulat kenyal untuk bassline slime
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, time);

  gain.gain.setValueAtTime(0.18, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

  osc.connect(gain);
  gain.connect(musicMasterGain);

  osc.start(time);
  osc.stop(time + duration);
}

// Scheduler BGM berulang
function schedulerBGM() {
  if (!bgmEnabled || !bgmIsPlaying || !audioCtx) return;

  while (nextStepTime < audioCtx.currentTime + 0.25) {
    const melodyArray = currentBgmSection === 0 ? MELODY_SECTION_A : MELODY_SECTION_B;
    const bassArray = currentBgmSection === 0 ? BASS_SECTION_A : BASS_SECTION_B;

    const leadNote = melodyArray[currentBgmStep];
    const bassNote = bassArray[currentBgmStep];

    if (leadNote && NOTE_FREQS[leadNote]) {
      playChiptuneLead(NOTE_FREQS[leadNote], nextStepTime, STEP_TIME * 0.9);
    }
    if (bassNote && NOTE_FREQS[bassNote]) {
      playChiptuneBass(NOTE_FREQS[bassNote], nextStepTime, STEP_TIME * 0.95);
    }

    nextStepTime += STEP_TIME;
    currentBgmStep++;

    if (currentBgmStep >= 32) {
      currentBgmStep = 0;
      // Bergantian bagian A dan bagian B agar tidak cepat bosan
      currentBgmSection = (currentBgmSection + 1) % 2;
    }
  }
}

function startBGM() {
  if (!bgmEnabled) return;
  initAudioContext();
  if (!audioCtx) return;

  if (bgmIsPlaying) return;
  bgmIsPlaying = true;
  nextStepTime = audioCtx.currentTime + 0.05;

  if (musicMasterGain) {
    musicMasterGain.gain.setValueAtTime(isDucking ? 0.06 : 0.25, audioCtx.currentTime);
  }

  if (bgmIntervalId) clearInterval(bgmIntervalId);
  bgmIntervalId = setInterval(schedulerBGM, 45);
}

function stopBGM() {
  bgmIsPlaying = false;
  if (bgmIntervalId) {
    clearInterval(bgmIntervalId);
    bgmIntervalId = null;
  }
  if (musicMasterGain && audioCtx) {
    musicMasterGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
  }
}

// ==========================================
// 3. AUDIO DUCKING (PENGECILAN MUSIK OTOMATIS)
// ==========================================
function duckBGM(duck) {
  if (!musicMasterGain || !audioCtx || !bgmEnabled) return;

  if (duck) {
    isDucking = true;
    musicMasterGain.gain.cancelScheduledValues(audioCtx.currentTime);
    musicMasterGain.gain.setTargetAtTime(0.06, audioCtx.currentTime, 0.05);

    if (duckSafetyTimer) clearTimeout(duckSafetyTimer);
    duckSafetyTimer = setTimeout(() => {
      duckBGM(false);
    }, 4000);
  } else {
    isDucking = false;
    if (duckSafetyTimer) clearTimeout(duckSafetyTimer);
    musicMasterGain.gain.cancelScheduledValues(audioCtx.currentTime);
    musicMasterGain.gain.setTargetAtTime(0.25, audioCtx.currentTime, 0.15);
  }
}

// ==========================================
// 4. EFEK SUARA (SFX) WEB AUDIO API
// ==========================================
function playSFX(type) {
  if (!sfxEnabled) return;
  initAudioContext();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const dest = sfxMasterGain || audioCtx.destination;

  switch (type) {
    case "jump": {
      // "boing" kenyal khas slime
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(170, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.07);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.13);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.14);
      break;
    }

    case "land": {
      // "plop" pelan saat menyentuh permukaan blok jeli
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(65, now + 0.08);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.09);
      break;
    }

    case "letter_ok": {
      // "ting" ceria + bunyi gelembung pecah
      // 1. Letupan gelembung halus
      const pop = audioCtx.createOscillator();
      const popG = audioCtx.createGain();
      pop.type = "sine";
      pop.frequency.setValueAtTime(360, now);
      pop.frequency.exponentialRampToValueAtTime(760, now + 0.04);
      popG.gain.setValueAtTime(0.2, now);
      popG.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      pop.connect(popG);
      popG.connect(dest);
      pop.start(now);
      pop.stop(now + 0.05);

      // 2. Chime "ting" ceria kristal
      const chime = audioCtx.createOscillator();
      const chimeG = audioCtx.createGain();
      chime.type = "sine";
      chime.frequency.setValueAtTime(1046.5, now + 0.02); // C6
      chime.frequency.setValueAtTime(1318.5, now + 0.07); // E6
      chimeG.gain.setValueAtTime(0.24, now + 0.02);
      chimeG.gain.exponentialRampToValueAtTime(0.01, now + 0.24);
      chime.connect(chimeG);
      chimeG.connect(dest);
      chime.start(now + 0.02);
      chime.stop(now + 0.24);
      break;
    }

    case "letter_wrong": {
      // TIDAK ADA BUNYI SAMA SEKALI (Aturan Belajar Ramah Anak)
      break;
    }

    case "hit": {
      // "dug" berat saat terkena slime jahat / kehilangan nyawa
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.2);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.22);
      break;
    }

    case "star": {
      // Arpeggio 3 nada naik saat mengambil bintang joker
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, idx) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(freq, now + idx * 0.065);
        g.gain.setValueAtTime(0.22, now + idx * 0.065);
        g.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.065 + 0.16);
        o.connect(g);
        g.connect(dest);
        o.start(now + idx * 0.065);
        o.stop(now + idx * 0.065 + 0.16);
      });
      break;
    }

    case "heart": {
      // Bunyi "pop" lembut saat mengambil item hati
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(310, now);
      osc.frequency.exponentialRampToValueAtTime(560, now + 0.06);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.13);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.13);
      break;
    }

    case "word_complete": {
      // Jingle kemenangan 5 nada saat kata lengkap
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5, E5, G5, C6, E6
      notes.forEach((freq, idx) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(freq, now + idx * 0.07);
        g.gain.setValueAtTime(0.24, now + idx * 0.07);
        g.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.07 + 0.28);
        o.connect(g);
        g.connect(dest);
        o.start(now + idx * 0.07);
        o.stop(now + idx * 0.07 + 0.28);
      });
      break;
    }

    case "game_over": {
      // 3 nada turun pelan saat game over & hentikan BGM
      stopBGM();
      const notes = [329.63, 293.66, 261.63]; // E4, D4, C4
      notes.forEach((freq, idx) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(freq, now + idx * 0.22);
        g.gain.setValueAtTime(0.24, now + idx * 0.22);
        g.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.22 + 0.32);
        o.connect(g);
        g.connect(dest);
        o.start(now + idx * 0.22);
        o.stop(now + idx * 0.22 + 0.32);
      });
      break;
    }
  }
}

// ==========================================
// 5. SUARA BACA (SPEECHSYNTHESIS - BAHASA INDONESIA)
// ==========================================
function loadIndonesianVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;
    idVoice =
      voices.find(v => v.lang === "id-ID" || v.lang === "id_ID") ||
      voices.find(v => v.lang && v.lang.toLowerCase().startsWith("id")) ||
      voices.find(v => v.name && v.name.toLowerCase().includes("indonesia")) ||
      null;
  } catch (err) {
    idVoice = null;
  }
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  loadIndonesianVoice();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadIndonesianVoice;
  }
}

// Eksekusi pengucapan suara dengan pembatalan tumpukan & ducking musik
function speakText(text, onComplete) {
  if (!sfxEnabled) {
    if (onComplete) onComplete();
    return;
  }

  if (typeof window === "undefined" || !window.speechSynthesis) {
    if (onComplete) onComplete();
    return;
  }

  try {
    // Batalkan ucapan sebelumnya agar tidak bertumpuk
    window.speechSynthesis.cancel();

    // Duck musik BGM saat suara baca diputar
    duckBGM(true);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    if (idVoice) {
      utterance.voice = idVoice;
    }
    utterance.rate = 0.8; // Kecepatan ramah anak
    utterance.pitch = 1.05;

    let hasEnded = false;
    const finish = () => {
      if (hasEnded) return;
      hasEnded = true;
      duckBGM(false);
      if (onComplete) onComplete();
    };

    utterance.onend = finish;
    utterance.onerror = finish;

    // Safety fallback jika browser tidak memicu onend
    setTimeout(finish, Math.max(1800, text.length * 200));

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    duckBGM(false);
    if (onComplete) onComplete();
  }
}

// Pembagian suku kata kata 4 huruf Indonesia (misal: ME-JA, BO-LA, I-KAN)
function getWordSyllables(word) {
  if (!word || word.length < 2) return [word, ""];
  const w = word.toLowerCase();
  const vowels = ["a", "i", "u", "e", "o"];

  const SYLLABLE_DICT = {
    "ikan": ["i", "kan"],
    "awan": ["a", "wan"],
    "apik": ["a", "pik"],
    "emas": ["e", "mas"],
    "adik": ["a", "dik"],
    "apel": ["a", "pel"],
    "atap": ["a", "tap"],
    "atas": ["a", "tas"],
    "ayah": ["a", "yah"],
    "ayam": ["a", "yam"],
    "obat": ["o", "bat"],
    "otak": ["o", "tak"],
    "otot": ["o", "tot"],
    "ular": ["u", "lar"],
    "ulat": ["u", "lat"],
    "umur": ["u", "mur"],
    "unik": ["u", "nik"],
    "upah": ["u", "pah"],
    "usia": ["u", "sia"],
    "usul": ["u", "sul"],
    "utuh": ["u", "tuh"],
    "uang": ["u", "ang"]
  };

  if (SYLLABLE_DICT[w]) {
    return SYLLABLE_DICT[w];
  }

  // Pola V-CVC (vokal di awal: i-kan)
  if (vowels.includes(w[0]) && !vowels.includes(w[1])) {
    return [w.slice(0, 1), w.slice(1)];
  }

  // Pola umum 4 huruf Indonesia: CV-CV (me-ja, bo-la, bu-ku)
  return [w.slice(0, 2), w.slice(2)];
}

// 1. Bacakan huruf tunggal (saat huruf benar diambil)
function speakLetter(ch) {
  speakText(ch.toUpperCase());
}

// 2. Bacakan huruf ke-2 beserta suku kata pertama (contoh: "E... me")
function speakLetterAndSyllable(ch, syl1) {
  speakText(`${ch.toUpperCase()}... ${syl1.toLowerCase()}`);
}

// 3. Bacakan kata lengkap: per suku kata lalu kata utuh (contoh: "me... ja... meja!")
function speakWordCelebration(word, syl1, syl2) {
  speakText(`${syl1.toLowerCase()}... ${syl2.toLowerCase()}... ${word.toLowerCase()}!`);
}

// ==========================================
// 6. KONTROL SUARA (TOMBOL MUSIK & SPEAKER)
// ==========================================
function updateAudioUI() {
  const btnMusic = document.getElementById("btnMusicToggle");
  const btnSound = document.getElementById("btnSoundToggle");

  if (btnMusic) {
    btnMusic.textContent = bgmEnabled ? "🎵" : "🔇";
    btnMusic.title = bgmEnabled ? "Musik Latar: Nyala (Klik untuk Matikan)" : "Musik Latar: Mati (Klik untuk Nyalakan)";
  }

  if (btnSound) {
    btnSound.textContent = sfxEnabled ? "🔊" : "🔈";
    btnSound.title = sfxEnabled ? "Suara Efek & Baca: Nyala (Klik untuk Matikan)" : "Suara Efek & Baca: Mati (Klik untuk Nyalakan)";
  }
}

function toggleBGM() {
  unlockAudio();
  bgmEnabled = !bgmEnabled;
  localStorage.setItem("slime_bgm_enabled", bgmEnabled);

  if (musicMasterGain && audioCtx) {
    musicMasterGain.gain.setValueAtTime(bgmEnabled ? 0.25 : 0.0, audioCtx.currentTime);
  }

  if (bgmEnabled) {
    if (typeof state !== "undefined" && !state.gameOver) {
      startBGM();
    }
  } else {
    stopBGM();
  }

  updateAudioUI();
}

function toggleSFX() {
  unlockAudio();
  sfxEnabled = !sfxEnabled;
  localStorage.setItem("slime_sfx_enabled", sfxEnabled);

  if (sfxMasterGain && audioCtx) {
    sfxMasterGain.gain.setValueAtTime(sfxEnabled ? 0.8 : 0.0, audioCtx.currentTime);
  }

  if (!sfxEnabled && typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  updateAudioUI();
}

// Ekspor ke window global
window.initAudioContext = initAudioContext;
window.unlockAudio = unlockAudio;
window.startBGM = startBGM;
window.stopBGM = stopBGM;
window.duckBGM = duckBGM;
window.playSFX = playSFX;
window.speakLetter = speakLetter;
window.speakLetterAndSyllable = speakLetterAndSyllable;
window.speakWordCelebration = speakWordCelebration;
window.getWordSyllables = getWordSyllables;
window.updateAudioUI = updateAudioUI;
window.toggleBGM = toggleBGM;
window.toggleSFX = toggleSFX;
