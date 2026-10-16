// =======================================================
// RENDERER 2.5D KAWAI SLIME & JELLY WORLD DI CANVAS
// Semua grafis murni digambar via kode Canvas 2D
// =======================================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// State lokal renderer untuk efek visual (shake, partikel, & squash)
let screenShake = 0;
let prevHitCount = 0;
let prevWordsCompleted = 0;
let wasJumping = false;
let landingSquashTimer = 0; // durasi squash memipih saat mendarat
let lastTimestampRender = 0;

// Pool efek partikel lokal (tetesan slime, gelembung pecah, konfeti)
let slimeDroplets = [];
let confettiList = [];

function resizeCanvas() {
  const wrapper = document.getElementById("canvasWrapper");
  if (!wrapper) return;
  const rect = wrapper.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(320, Math.floor(rect.width * dpr));
  canvas.height = Math.max(320, Math.floor(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
}

// ==========================================
// HITUNG SKALA UKURAN VOXEL & KAMERA RESPONSIF
// ==========================================
function getBoardMetrics(W, H) {
  const isPortrait = H > W;

  let tileW, tileH, tileDepth, boardWidth, startX, baseScreenY;

  if (isPortrait) {
    // Pada HP portrait (layar sempit), peta memenuhi lebar layar dengan margin proporsional (96% W)
    const maxTileW = Math.floor((W * 0.96) / COLS);
    // Batasi minimal 36px (layar lipat 320px) dan maksimal 160px
    tileW = Math.max(36, Math.min(maxTileW, 160));
    tileH = Math.floor(tileW * 0.70);
    tileDepth = Math.max(8, Math.floor(tileH * 0.35));
    boardWidth = tileW * COLS;
    startX = Math.floor((W - boardWidth) / 2);
    // Slime ditempatkan pada 83% dari atas (17% dari bawah) agar jalur di depan slime terlihat lebih banyak
    // dan ruang kosong langit di atas berkurang drastis
    baseScreenY = Math.floor(H * 0.83);
  } else {
    // Pada landscape & desktop, pertahankan estetika dan skala aslinya
    const targetTileH = Math.floor(H / 8.0);
    const maxTileW = Math.floor((W * 0.92) / COLS);
    tileW = Math.min(maxTileW, Math.floor(targetTileH * 1.36));
    tileW = Math.max(48, Math.min(tileW, 165));
    tileH = Math.floor(tileW * 0.70);
    tileDepth = Math.max(12, Math.floor(tileH * 0.35));
    boardWidth = tileW * COLS;
    startX = Math.floor((W - boardWidth) / 2);
    baseScreenY = Math.floor(H * 0.72);
  }

  return { tileW, tileH, tileDepth, boardWidth, startX, baseScreenY };
}
window.getBoardMetrics = getBoardMetrics;

// Helper: Menggambar rounded rectangle
function drawRoundedRect(x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Cek apakah huruf sedang dibutuhkan
function isLetterHighlighted(char) {
  return false;
}

// Spawn tetesan slime saat mendarat
function spawnLandingDroplets(col, row) {
  const count = 7;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const speed = 1.2 + Math.random() * 2.2;
    slimeDroplets.push({
      col: col + (Math.random() - 0.5) * 0.3,
      row: row + (Math.random() - 0.5) * 0.3,
      z: 0.1,
      vx: Math.cos(angle) * speed * 0.05,
      vy: Math.sin(angle) * speed * 0.05,
      vz: 1.5 + Math.random() * 1.8,
      radius: 3.5 + Math.random() * 2.5,
      color: Math.random() < 0.7 ? "#38bdf8" : "#bae6fd",
      life: 1.0,
      decay: 2.2 + Math.random() * 1.2
    });
  }
}

// Spawn tetesan slime saat terluka kena musuh
function spawnHurtDroplets(col, row) {
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 3.5;
    slimeDroplets.push({
      col: col,
      row: row,
      z: 0.4,
      vx: Math.cos(angle) * speed * 0.06,
      vy: Math.sin(angle) * speed * 0.06,
      vz: 2.2 + Math.random() * 3.0,
      radius: 3 + Math.random() * 3,
      color: Math.random() < 0.6 ? "#f43f5e" : "#38bdf8",
      life: 1.0,
      decay: 2.0 + Math.random() * 1.0
    });
  }
}

// Spawn hujan konfeti warna-warni saat kata berhasil tersusun
function spawnConfettiShower() {
  const colors = ["#6ee7b7", "#f472b6", "#38bdf8", "#fde047", "#c084fc", "#fb923c"];
  // Konfeti digambar dalam satuan piksel CSS (setelah ctx.scale(dpr)), bukan piksel buffer
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = canvas.width / dpr;
  for (let i = 0; i < 40; i++) {
    confettiList.push({
      x: Math.random() * cssWidth,
      y: -20 - Math.random() * 120,
      vx: (Math.random() - 0.5) * 2.5,
      vy: 2.0 + Math.random() * 3.2,
      w: 8 + Math.random() * 6,
      h: 5 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.15,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1.0,
      decay: 0.35 + Math.random() * 0.25
    });
  }
}

// ==========================================
// RENDER BLOK PIJAKAN PERMEN JELI (PASTEL)
// ==========================================
function drawJellyBlock(x, y, w, h, depth, tileType, tileState, timestamp, shakeX) {
  const rad = 8;
  const bx = x + shakeX;

  // Konfigurasi palet warna jeli pastel
  let topGrad1 = "#a7f3d0";
  let topGrad2 = "#34d399";
  let frontCol = "#10b981";
  let rimCol   = "#059669";
  let isWater  = false;

  if (tileType === "grass") {
    // Mint Green Jelly
    topGrad1 = "#a7f3d0";
    topGrad2 = "#34d399";
    frontCol = "#10b981";
    rimCol   = "#059669";
  } else if (tileType === "road") {
    // Sky Blue Water Jelly (dengan riak air halus)
    isWater  = true;
    topGrad1 = "#bae6fd";
    topGrad2 = "#60a5fa";
    frontCol = "#2563eb";
    rimCol   = "#1d4ed8";
  } else if (tileType === "crumble") {
    // Strawberry Pastel Jelly
    if (tileState === "cracking") {
      topGrad1 = "#fdba74";
      topGrad2 = "#f97316";
      frontCol = "#ea580c";
      rimCol   = "#c2410c";
    } else {
      topGrad1 = "#fbcfe8";
      topGrad2 = "#f472b6";
      frontCol = "#db2777";
      rimCol   = "#be185d";
    }
  }

  // 1. Bayangan lembut di bawah balok jeli
  ctx.fillStyle = "rgba(15, 23, 42, 0.32)";
  ctx.beginPath();
  ctx.ellipse(bx + w * 0.5, y + depth + 4, w * 0.48, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Sisi Depan / Dinding Jeli (Extruded Skirt)
  ctx.fillStyle = frontCol;
  drawRoundedRect(bx, y - 2, w, depth + 4, rad);
  ctx.fill();

  // Highlight garis bawah skirt
  ctx.strokeStyle = rimCol;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 3. Permukaan Atas Jeli (Rounded Top)
  const topGrad = ctx.createLinearGradient(bx, y - h, bx + w, y);
  topGrad.addColorStop(0, topGrad1);
  topGrad.addColorStop(1, topGrad2);
  ctx.fillStyle = topGrad;
  drawRoundedRect(bx, y - h, w, h, rad);
  ctx.fill();

  // Outline halus permukaan jeli
  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // 4. Efek Riak Air (jika jalur air / road)
  if (isWater) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const waveOffset = Math.sin(timestamp * 0.003 + bx * 0.05) * 2.5;
    ctx.moveTo(bx + w * 0.2, y - h * 0.5 + waveOffset);
    ctx.quadraticCurveTo(bx + w * 0.5, y - h * 0.5 - waveOffset, bx + w * 0.8, y - h * 0.5 + waveOffset);
    ctx.stroke();
  }

  // 5. Efek Retakan Magma (jika crumble cracking)
  if (tileState === "cracking") {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + w * 0.3, y - h * 0.3);
    ctx.lineTo(bx + w * 0.5, y - h * 0.55);
    ctx.lineTo(bx + w * 0.7, y - h * 0.4);
    ctx.stroke();
  }

  // 6. Highlight Kilau Kenyal (Glossy Sheen) di kiri atas permukaan
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  drawRoundedRect(bx + 5, y - h + 3, w * 0.55, Math.max(3, h * 0.28), rad * 0.6);
  ctx.fill();
}

// ==========================================
// RENDER ITEM (GELEMBUNG HURUF, BINTANG, HATI)
// ==========================================
function drawItem(item, x, y, size, timestamp) {
  const cx = x + size * 0.5;
  const cy = y - size * 0.5;
  const radius = size * 0.52;

  if (item.type === "wildcard") {
    // Bintang Joker Berkilau & Berputar Pelan
    const rot = timestamp * 0.0022;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    // Gambar Bintang 5 Sudut Kuning Emas
    const spikes = 5;
    const outerR = radius * 1.1;
    const innerR = radius * 0.55;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const sx = Math.cos(angle) * r;
      const sy = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();

    const starGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, outerR);
    starGrad.addColorStop(0, "#fef08a");
    starGrad.addColorStop(1, "#eab308");
    ctx.fillStyle = starGrad;
    ctx.fill();
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Wajah lucu bintang (mata senyum)
    ctx.fillStyle = "#713f12";
    ctx.beginPath();
    ctx.arc(-outerR * 0.28, -outerR * 0.1, 2.2, 0, Math.PI * 2);
    ctx.arc(outerR * 0.28, -outerR * 0.1, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Pipi merah bintang
    ctx.fillStyle = "rgba(244, 114, 182, 0.8)";
    ctx.beginPath();
    ctx.arc(-outerR * 0.35, outerR * 0.12, 2.8, 0, Math.PI * 2);
    ctx.arc(outerR * 0.35, outerR * 0.12, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Kilau bintang berkedip di sekitar
    const shimmer = Math.sin(timestamp * 0.008) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(254, 240, 138, ${shimmer * 0.9})`;
    ctx.font = '800 12px "Baloo 2", sans-serif';
    ctx.fillText("✦", cx + radius * 0.7, cy - radius * 0.6);
    return;
  }

  if (item.type === "heart") {
    // Hati Jeli Merah Berdenyut Kenyal
    const pulse = 1 + Math.sin(timestamp * 0.008) * 0.12;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);

    const s = radius * 0.7;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.8);
    ctx.bezierCurveTo(-s * 1.3, -s * 0.2, -s * 0.8, -s * 1.2, 0, -s * 0.4);
    ctx.bezierCurveTo(s * 0.8, -s * 1.2, s * 1.3, -s * 0.2, 0, s * 0.8);
    ctx.closePath();

    const heartGrad = ctx.createLinearGradient(0, -s, 0, s);
    heartGrad.addColorStop(0, "#fb7185");
    heartGrad.addColorStop(1, "#e11d48");
    ctx.fillStyle = heartGrad;
    ctx.fill();
    ctx.strokeStyle = "#be123c";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Kilau putih hati
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.beginPath();
    ctx.arc(-s * 0.35, -s * 0.45, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // ==========================================
  // GELEMBUNG BENING UNTUK HURUF (SERAGAM SEMUA)
  // Tidak ada penanda warna/halo agar anak membaca hurufnya
  // ==========================================

  // Bola Gelembung Utama (Translucent Soap Bubble)
  const bubbleGrad = ctx.createRadialGradient(
    cx - radius * 0.35, cy - radius * 0.35, radius * 0.1,
    cx, cy, radius
  );
  bubbleGrad.addColorStop(0, "rgba(255, 255, 255, 0.72)");
  bubbleGrad.addColorStop(0.55, "rgba(224, 242, 254, 0.38)");
  bubbleGrad.addColorStop(1, "rgba(56, 189, 248, 0.62)");

  ctx.fillStyle = bubbleGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Tepi Gelembung dengan pantulan putih halus
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Kilau Busur Putih di Kiri Atas Gelembung
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.4, cy - radius * 0.4, radius * 0.3, radius * 0.16, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();

  // Titik kilau sekunder
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.beginPath();
  ctx.arc(cx - radius * 0.15, cy - radius * 0.55, 2, 0, Math.PI * 2);
  ctx.fill();

  // Pantulan sekunder di kanan bawah
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.beginPath();
  ctx.ellipse(cx + radius * 0.4, cy + radius * 0.4, radius * 0.22, radius * 0.1, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();

  // Teks Huruf di dalam Gelembung (Tebal, Jelas, Gelap)
  ctx.font = `800 ${Math.floor(radius * 1.25)}px "Baloo 2", cursive, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(item.char, cx, cy + 2);
}

// ==========================================
// RENDER MUSUH: SLIME JAHAT (SPIKY EVIL SLIME)
// ==========================================
function drawEvilSlime(x, y, w, h, obs, timestamp) {
  const cx = x + w * 0.5;
  const cy = y - h * 0.35;
  const sw = w * 0.85;
  const sh = h * 0.75;

  // Squish and stretch saat meluncur
  const squish = Math.sin(timestamp * 0.012 * obs.speed) * 0.1;
  const scaleX = 1 + squish;
  const scaleY = 1 - squish;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scaleX, scaleY);

  // 1. Duri-duri kecil di punggung / kepala (3 Duri Tajam)
  const spikeCol = "#f43f5e";
  ctx.fillStyle = spikeCol;
  // Duri kiri
  ctx.beginPath();
  ctx.moveTo(-sw * 0.35, -sh * 0.3);
  ctx.lineTo(-sw * 0.42, -sh * 0.85);
  ctx.lineTo(-sw * 0.18, -sh * 0.45);
  ctx.closePath();
  ctx.fill();
  // Duri tengah (paling tinggi)
  ctx.beginPath();
  ctx.moveTo(-sw * 0.12, -sh * 0.45);
  ctx.lineTo(0, -sh * 1.05);
  ctx.lineTo(sw * 0.12, -sh * 0.45);
  ctx.closePath();
  ctx.fill();
  // Duri kanan
  ctx.beginPath();
  ctx.moveTo(sw * 0.18, -sh * 0.45);
  ctx.lineTo(sw * 0.42, -sh * 0.85);
  ctx.lineTo(sw * 0.35, -sh * 0.3);
  ctx.closePath();
  ctx.fill();

  // 2. Badan Slime Jahat (Ungu - Merah Crimson Mengkilap)
  const evilGrad = ctx.createLinearGradient(0, -sh * 0.6, 0, sh * 0.5);
  evilGrad.addColorStop(0, "#be123c");
  evilGrad.addColorStop(0.5, "#7e22ce");
  evilGrad.addColorStop(1, "#4c1d95");

  ctx.beginPath();
  ctx.moveTo(-sw * 0.45, sh * 0.45);
  ctx.quadraticCurveTo(-sw * 0.52, -sh * 0.4, 0, -sh * 0.55);
  ctx.quadraticCurveTo(sw * 0.52, -sh * 0.4, sw * 0.45, sh * 0.45);
  ctx.quadraticCurveTo(0, sh * 0.55, -sw * 0.45, sh * 0.45);
  ctx.closePath();
  ctx.fillStyle = evilGrad;
  ctx.fill();
  ctx.strokeStyle = "#3b0764";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Kilau jeli di kiri atas
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  ctx.beginPath();
  ctx.ellipse(-sw * 0.22, -sh * 0.28, sw * 0.18, sh * 0.1, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();

  // 3. Alis Marah & Mata Jahat
  const eyeDir = obs.dir > 0 ? 3 : -3;
  // Alis marah hitam pekat
  ctx.strokeStyle = "#1e1b4b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  // Alis kiri
  ctx.moveTo(-sw * 0.3 + eyeDir, -sh * 0.18);
  ctx.lineTo(-sw * 0.08 + eyeDir, -sh * 0.04);
  // Alis kanan
  ctx.moveTo(sw * 0.08 + eyeDir, -sh * 0.04);
  ctx.lineTo(sw * 0.3 + eyeDir, -sh * 0.18);
  ctx.stroke();

  // Mata tajam kuning menyala
  ctx.fillStyle = "#fef08a";
  ctx.beginPath();
  ctx.ellipse(-sw * 0.2 + eyeDir, -sh * 0.02, 5.5, 6.5, 0, 0, Math.PI * 2);
  ctx.ellipse(sw * 0.2 + eyeDir, -sh * 0.02, 5.5, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pupil merah tajam
  ctx.fillStyle = "#dc2626";
  ctx.beginPath();
  ctx.arc(-sw * 0.18 + eyeDir * 1.3, -sh * 0.02, 2.5, 0, Math.PI * 2);
  ctx.arc(sw * 0.22 + eyeDir * 1.3, -sh * 0.02, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Mulut taring runcing jahat
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(-3 + eyeDir, sh * 0.18);
  ctx.lineTo(0 + eyeDir, sh * 0.28);
  ctx.lineTo(3 + eyeDir, sh * 0.18);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ==========================================
// RENDER PEMAIN: KARAKTER SLIME BIRU KENYAL
// ==========================================
function drawPlayerSlime(pPos, pW, pH, timestamp) {
  const cx = pPos.x + pW * 0.5;
  const cy = pPos.y - pH * 0.35;
  const radW = pW * 0.48;
  const radH = pH * 0.52;

  // 1. Squash & Stretch Matematis
  let scaleX = 1.0;
  let scaleY = 1.0;

  if (state.player.jumping) {
    // Saat melompat: memanjang vertikal
    const p = state.player.jumpProgress;
    scaleY = 1 + 0.38 * Math.sin(p * Math.PI);
    scaleX = 1 - 0.22 * Math.sin(p * Math.PI);
  } else {
    // Saat mendarat: memipih kenyal lalu kembali
    if (landingSquashTimer > 0) {
      const t = landingSquashTimer / 0.35;
      const bounce = Math.sin((1 - t) * Math.PI * 2.2) * Math.exp(-(1 - t) * 3);
      scaleX = 1 + 0.35 * bounce;
      scaleY = 1 - 0.3 * bounce;
    } else {
      // Goyang pelan (wobble bernapas) saat diam
      const wobble = Math.sin(timestamp * 0.005) * 0.055;
      scaleX = 1 + wobble;
      scaleY = 1 - wobble;
    }
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scaleX, scaleY);

  // 2. Efek Berkedip Transparan saat Kebal (Invulnerable) & Merah saat terkena musuh
  const isInvulnerable = state.shieldTimer > 0;
  const isHurt = isInvulnerable && state.lives < 3 && (Math.floor(timestamp / 90) % 2 === 0);
  if (isInvulnerable && (Math.floor(timestamp / 90) % 2 === 0)) {
    ctx.globalAlpha = 0.42;
  }

  // 3. Badan Slime Jeli Biru Muda Transparan
  const slimeGrad = ctx.createRadialGradient(
    -radW * 0.3, -radH * 0.4, radW * 0.15,
    0, 0, radW * 1.15
  );

  if (isHurt) {
    slimeGrad.addColorStop(0, "#fee2e2");
    slimeGrad.addColorStop(0.5, "#f43f5e");
    slimeGrad.addColorStop(1, "#be123c");
  } else {
    slimeGrad.addColorStop(0, "rgba(224, 242, 254, 0.95)"); // Putih kebiruan bercahaya
    slimeGrad.addColorStop(0.4, "rgba(56, 189, 248, 0.92)");  // Biru langit cerah
    slimeGrad.addColorStop(1, "rgba(2, 132, 199, 0.98)");    // Biru laut pekat tepi
  }

  ctx.beginPath();
  // Bentuk kubah jeli yang membulat kenyal dengan lekuk atas imut
  ctx.moveTo(-radW, radH * 0.65);
  ctx.quadraticCurveTo(-radW * 1.05, -radH * 0.5, 0, -radH * 0.85);
  ctx.quadraticCurveTo(radW * 1.05, -radH * 0.5, radW, radH * 0.65);
  ctx.quadraticCurveTo(0, radH * 0.85, -radW, radH * 0.65);
  ctx.closePath();

  ctx.fillStyle = slimeGrad;
  ctx.fill();
  ctx.strokeStyle = isHurt ? "#be123c" : "#0284c7";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // 4. Kilau Putih Mengkilap (Specular Gloss) di kiri atas
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.beginPath();
  ctx.ellipse(-radW * 0.38, -radH * 0.42, radW * 0.34, radH * 0.18, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();

  // Titik kilau sekunder
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.beginPath();
  ctx.arc(-radW * 0.15, -radH * 0.65, 3, 0, Math.PI * 2);
  ctx.fill();

  // Pantulan lembut di kanan bawah jeli
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.beginPath();
  ctx.ellipse(radW * 0.42, radH * 0.45, radW * 0.25, radH * 0.1, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();

  // 5. Wajah Imut: Mata Besar Berkedip & Pipi Pink
  const isBlink = (timestamp % 3800) < 180;
  const eyeOffset = state.player.facing === "left" ? -4 : (state.player.facing === "right" ? 4 : 0);

  if (isBlink) {
    // Mata berkedip senyum: ^  ^
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(-radW * 0.32 + eyeOffset, -radH * 0.05, 5, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(radW * 0.32 + eyeOffset, -radH * 0.05, 5, Math.PI, 0);
    ctx.stroke();
  } else {
    // Mata besar hitam berkilau (anime kawaii)
    const eyeR = 6.2;
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(-radW * 0.32 + eyeOffset, -radH * 0.05, eyeR, 0, Math.PI * 2);
    ctx.arc(radW * 0.32 + eyeOffset, -radH * 0.05, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Pantulan cahaya putih besar di mata
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(-radW * 0.32 + eyeOffset - 2, -radH * 0.05 - 2, 2.5, 0, Math.PI * 2);
    ctx.arc(radW * 0.32 + eyeOffset - 2, -radH * 0.05 - 2, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Pantulan cahaya putih kecil di mata
    ctx.beginPath();
    ctx.arc(-radW * 0.32 + eyeOffset + 2, -radH * 0.05 + 2, 1.2, 0, Math.PI * 2);
    ctx.arc(radW * 0.32 + eyeOffset + 2, -radH * 0.05 + 2, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pipi Merah Muda (Blush Pink)
  ctx.fillStyle = "rgba(244, 114, 182, 0.75)";
  ctx.beginPath();
  ctx.ellipse(-radW * 0.52 + eyeOffset, radH * 0.15, 6, 3.5, 0, 0, Math.PI * 2);
  ctx.ellipse(radW * 0.52 + eyeOffset, radH * 0.15, 6, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mulut Senyum Imut :3
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(eyeOffset, radH * 0.12, 4, 0.2, Math.PI - 0.2);
  ctx.stroke();

  ctx.restore();

  // 6. Efek Perisai Berkilau (Word Fever / Invulnerable)
  if (state.shieldTimer > 0) {
    ctx.save();
    const shieldPulse = Math.sin(timestamp * 0.01) * 3;
    const sRad = Math.max(radW, radH) * 1.35 + shieldPulse;
    ctx.strokeStyle = "rgba(253, 224, 71, 0.9)";
    ctx.lineWidth = 3.5;
    ctx.setLineDash([8, 5]);
    ctx.lineDashOffset = -timestamp * 0.04;
    ctx.beginPath();
    ctx.arc(cx, cy, sRad, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(254, 240, 138, 0.18)";
    ctx.fill();
    ctx.restore();
  }
}

// ==========================================
// RENDER UTAMA DUNIA GAME
// ==========================================
function renderGame(timestamp) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;

  // Hitung delta time internal untuk partikel & screen shake
  if (!lastTimestampRender) lastTimestampRender = timestamp;
  const dt = Math.min(0.05, (timestamp - lastTimestampRender) / 1000);
  lastTimestampRender = timestamp;

  // 1. Deteksi Efek Pendaratan Karakter (Squash & Droplets)
  if (wasJumping && !state.player.jumping) {
    landingSquashTimer = 0.35;
    spawnLandingDroplets(state.player.renderX, state.player.renderY);
  }
  wasJumping = state.player.jumping;
  if (landingSquashTimer > 0) {
    landingSquashTimer = Math.max(0, landingSquashTimer - dt);
  }

  // 2. Deteksi Tertabrak Musuh (Screen Shake & Red Slime Droplets)
  // (pakai hitCount, bukan nyawa, agar tetap terasa saat konsep nyawa dinonaktifkan)
  if (state.hitCount > prevHitCount) {
    screenShake = 12;
    spawnHurtDroplets(state.player.renderX, state.player.renderY);
  }
  prevHitCount = state.hitCount;

  // 3. Deteksi Kata Lengkap (Hujan Konfeti)
  if (state.wordsCompleted > prevWordsCompleted) {
    spawnConfettiShower();
  }
  prevWordsCompleted = state.wordsCompleted;

  // 4. Update Screen Shake
  if (screenShake > 0) {
    screenShake = Math.max(0, screenShake - dt * 28);
  }

  // Bersihkan buffer canvas penuh, lalu gambar dalam satuan piksel CSS logis via dpr scale
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);

  // Terapkan Efek Goyang Layar (Screen Shake)
  if (screenShake > 0) {
    const shakeOffsetX = (Math.random() - 0.5) * screenShake * 2.2;
    const shakeOffsetY = (Math.random() - 0.5) * screenShake * 2.2;
    ctx.translate(shakeOffsetX, shakeOffsetY);
  }

  // Latar Belakang Langit Malam Lilac Berbintang Halus
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#090d16");
  bgGrad.addColorStop(0.65, "#171a2e");
  bgGrad.addColorStop(1, "#241f3d");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Bintang-bintang lembut berkedip di latar
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  for (let i = 0; i < 28; i++) {
    const starX = ((i * 79 + 30) % W);
    const starY = ((i * 53 + 20) % (H * 0.7));
    const twinkle = Math.sin(timestamp * 0.003 + i) * 0.4 + 0.6;
    ctx.globalAlpha = twinkle;
    ctx.fillRect(starX, starY, 2, 2);
  }
  ctx.globalAlpha = 1.0;

  // Metrik petak voxel isometrik dinamis sesuai resolusi layar
  const metrics = getBoardMetrics(W, H);
  const { tileW, tileH, tileDepth, startX, baseScreenY } = metrics;

  function worldToScreen(col, row, z = 0) {
    const relRow = row - state.cameraRow;
    const sx = startX + col * tileW;
    const sy = baseScreenY - relRow * tileH - z * (tileH * 0.95);
    return { x: sx, y: sy };
  }

  // Render baris dari belakang slime hingga jalur jauh di depan slime
  // Hitung jumlah baris di depan agar memenuhi tinggi canvas (mengurangi ruang kosong langit)
  const minRow = Math.max(0, Math.floor(state.cameraRow) - 2);
  const rowsAhead = Math.ceil((baseScreenY + tileH) / Math.max(tileH, 20));
  const maxRow = Math.floor(state.cameraRow) + Math.min(VISIBLE_ROWS - 1, Math.max(9, rowsAhead));

  // Render dari baris terjauh ke terdekat (Depth Sorting 2.5D)
  for (let r = maxRow; r >= minRow; r--) {
    const rowData = generateRow(r);

    // 1. Gambar Blok Lantai Permen Jeli
    for (let c = 0; c < COLS; c++) {
      const tile = rowData.tiles[c];
      if (tile.state === "fallen") continue;

      const pos = worldToScreen(c, r, 0);
      const shakeX = tile.state === "cracking" ? (Math.random() - 0.5) * 4.5 : 0;

      drawJellyBlock(
        pos.x,
        pos.y,
        tileW - 3,
        tileH - 3,
        tileDepth,
        tile.type,
        tile.state,
        timestamp,
        shakeX
      );

      // 2. Gambar Gelembung Huruf / Power-up di atas Balok (Ukuran Besar & Jelas Dibaca)
      if (tile.item) {
        const bob = Math.sin(timestamp * 0.004 + tile.item.bobOffset) * 0.16 + 0.32;
        const itemPos = worldToScreen(c + 0.12, r, bob);
        const itemBoxSize = Math.floor(tileW * 0.76);

        // Bayangan lembut gelembung di lantai
        ctx.fillStyle = "rgba(15, 23, 42, 0.28)";
        ctx.beginPath();
        ctx.ellipse(
          pos.x + tileW * 0.48,
          pos.y - tileH * 0.45,
          itemBoxSize * 0.38,
          itemBoxSize * 0.22,
          0, 0, Math.PI * 2
        );
        ctx.fill();

        drawItem(tile.item, itemPos.x, itemPos.y, itemBoxSize, timestamp);
      }
    }

    // 3. Gambar Musuh: Slime Jahat (Spiky Evil Slime)
    rowData.obstacles.forEach(obs => {
      if (obs.x < -1 || obs.x > COLS + 1) return;
      const obsPos = worldToScreen(obs.x + 0.1, r, 0.12);
      const obsW = Math.floor(tileW * 0.78);
      const obsH = Math.floor(tileH * 0.75);

      // Bayangan slime jahat
      ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
      ctx.beginPath();
      ctx.ellipse(obsPos.x + obsW * 0.5, obsPos.y + 4, obsW * 0.45, obsH * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();

      drawEvilSlime(obsPos.x, obsPos.y, obsW, obsH, obs, timestamp);
    });

    // 4. Gambar Karakter Pemain Slime
    if (Math.round(state.player.renderY) === r) {
      // Bayangan slime di lantai
      const pShadow = worldToScreen(state.player.renderX, state.player.renderY, 0);
      const shadowScale = Math.max(0.4, 1 - state.player.jumpZ * 0.42);
      ctx.fillStyle = "rgba(15, 23, 42, 0.42)";
      ctx.beginPath();
      ctx.ellipse(
        pShadow.x + tileW * 0.5,
        pShadow.y - tileH * 0.42,
        tileW * 0.38 * shadowScale,
        tileH * 0.24 * shadowScale,
        0, 0, Math.PI * 2
      );
      ctx.fill();

      // Badan Slime Pemain
      const pPos = worldToScreen(
        state.player.renderX + 0.1,
        state.player.renderY,
        state.player.jumpZ + 0.15
      );
      const pW = Math.floor(tileW * 0.8);
      const pH = Math.floor(tileH * 0.85);

      drawPlayerSlime(pPos, pW, pH, timestamp);
    }
  }

  // 5. Gambar Tetesan Slime Lokal
  slimeDroplets.forEach(d => {
    d.col += d.vx;
    d.row += d.vy;
    d.z += d.vz * dt;
    d.vz -= 9.8 * dt;
    d.life -= dt * d.decay;

    if (d.life > 0) {
      const dPos = worldToScreen(d.col, d.row, Math.max(0, d.z));
      ctx.fillStyle = d.color;
      ctx.globalAlpha = Math.max(0, d.life);
      ctx.beginPath();
      ctx.arc(dPos.x, dPos.y, d.radius * d.life, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  slimeDroplets = slimeDroplets.filter(d => d.life > 0);
  ctx.globalAlpha = 1.0;

  // 6. Gambar Partikel State Bawaan
  state.particles.forEach(p => {
    const ptPos = worldToScreen(p.col + 0.4, p.row, p.z);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.beginPath();
    ctx.arc(ptPos.x, ptPos.y, 4.5 * Math.max(0.3, p.life), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1.0;

  // 7. Gambar Teks Melayang (Font Baloo 2 Lucu dengan Stroke)
  state.floatingTexts.forEach(ft => {
    const ftPos = worldToScreen(ft.col + 0.5, ft.row, ft.z);
    const fontSize = Math.max(16, Math.floor(tileW * 0.22));
    ctx.font = `800 ${fontSize}px "Baloo 2", cursive, sans-serif`;
    ctx.textAlign = "center";
    ctx.globalAlpha = Math.max(0, ft.life);

    // Outline gelap teks
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = Math.max(3, Math.floor(fontSize * 0.2));
    ctx.strokeText(ft.text, ftPos.x, ftPos.y);

    // Isi teks
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ftPos.x, ftPos.y);
  });
  ctx.globalAlpha = 1.0;

  // 8. Gambar Konfeti saat Kata Lengkap
  confettiList.forEach(c => {
    c.x += c.vx;
    c.y += c.vy;
    c.rot += c.vrot;
    c.life -= dt * c.decay;

    if (c.life > 0) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.globalAlpha = Math.max(0, c.life);
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
  });
  confettiList = confettiList.filter(c => c.life > 0);
  ctx.globalAlpha = 1.0;

  ctx.restore();
}
