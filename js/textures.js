/* ============================================================
 * Sky Pedal — procedural textures
 * すべての画像はCanvas 2Dで実行時に描き起こす（外部画像なし・ロード最小）。
 * noise / glow / smoke はスラスト・ロードスター系エンジンから継承。
 * ============================================================ */
window.SP = window.SP || {};
SP.Tex = (() => {
  'use strict';

  const ANISO = () => (SP.renderer ? Math.min(8, SP.renderer.capabilities.getMaxAnisotropy()) : 4);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  function mulberry32(a){
    return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  // tileable value noise + fbm
  function makeNoise(seed){
    const rnd = mulberry32(seed);
    const perm = new Uint8Array(256), vals = new Float32Array(256);
    for (let i = 0; i < 256; i++){ perm[i] = i; vals[i] = rnd(); }
    for (let i = 255; i > 0; i--){ const j = (rnd() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    const lat = (ix, iy, px, py) => { ix = ((ix % px) + px) % px; iy = ((iy % py) + py) % py; return vals[perm[(perm[ix & 255] + iy) & 255]]; };
    function noise(x, y, px, py){
      const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = lat(ix, iy, px, py), b = lat(ix + 1, iy, px, py), c = lat(ix, iy + 1, px, py), d = lat(ix + 1, iy + 1, px, py);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
    function fbm(x, y, oct, px, py){
      let amp = .5, f = 1, s = 0, n = 0;
      for (let o = 0; o < oct; o++){ s += amp * noise(x * f, y * f, px * f, (py || px) * f); n += amp; amp *= .5; f *= 2; }
      return s / n;
    }
    return { noise, fbm, rnd };
  }

  function canvas(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  function toTex(c, o = {}){
    const t = new THREE.CanvasTexture(c);
    if (o.srgb !== false) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = o.aniso || ANISO();
    if (o.repeat !== false){ t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    if (o.nomip){ t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    return t;
  }
  function paint(w, h, fn){
    const [c, x] = canvas(w, h); const img = x.createImageData(w, h); const d = img.data;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++){
      const k = (j * w + i) * 4; const col = fn(i, j);
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = col.length > 3 ? col[3] : 255;
    }
    x.putImageData(img, 0, 0); return [c, x];
  }
  const cache = {};
  const memo = (k, fn) => cache[k] || (cache[k] = fn());

  /* ---------- soft sprites ---------- */
  function glow(){
    return memo('glow', () => {
      const [c, x] = canvas(128, 128); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, 'rgba(255,255,255,.7)'); g.addColorStop(.45, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128); return toTex(c, { repeat: false });
    });
  }
  function flare(){
    return memo('flare', () => {
      const [c, x] = canvas(256, 64);
      const g = x.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 30, 256, 4);
      const r = x.createRadialGradient(128, 32, 0, 128, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = r; x.fillRect(96, 0, 64, 64); return toTex(c, { repeat: false });
    });
  }
  function smoke(){
    return memo('smoke', () => {
      const N = makeNoise(41);
      const [c] = paint(128, 128, (i, j) => {
        const d = Math.hypot(i - 64, j - 64) / 64; const n = N.fbm(i / 18, j / 18, 4, 8, 8);
        const a = Math.max(0, 1 - d) ** 1.6 * (.5 + n * .8); return [255, 255, 255, clamp01(a) * 255];
      });
      return toTex(c, { repeat: false });
    });
  }
  // a cumulus puff: dense, round-shouldered, a little lumpy at the rim
  function puff(){
    return memo('puff', () => {
      const N = makeNoise(77);
      const [c] = paint(128, 128, (i, j) => {
        const dx = (i - 64) / 64, dy = (j - 64) / 64;
        const n = N.fbm(i / 14, j / 14, 4, 10, 10);
        const d = Math.hypot(dx, dy) - (n - .5) * .35;
        const a = clamp01((1 - d) * 2.4) ** 1.3;
        return [255, 255, 255, a * 255];
      });
      return toTex(c, { repeat: false });
    });
  }
  // feather: a vane with barbs, used for the wings (alpha cut-out, white so it can be tinted)
  function feather(){
    return memo('feather', () => {
      const [c, x] = canvas(128, 256);
      x.clearRect(0, 0, 128, 256);
      for (let k = 0; k < 9; k++){
        const yy = 20 + k * 25, w = 34 + Math.sin(k / 8 * Math.PI) * 26;
        const g = x.createLinearGradient(64 - w, 0, 64 + w, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.2, 'rgba(255,255,255,.9)'); g.addColorStop(.5, 'rgba(255,255,255,1)'); g.addColorStop(.8, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.beginPath(); x.ellipse(64, yy + 30, w, 34, 0, 0, Math.PI * 2); x.fill();
      }
      x.globalCompositeOperation = 'destination-out';
      x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1.2;
      for (let k = 0; k < 60; k++){ const y0 = 10 + k * 4.1; x.beginPath(); x.moveTo(64, y0); x.lineTo(4, y0 + 22); x.moveTo(64, y0); x.lineTo(124, y0 + 22); x.stroke(); }
      x.globalCompositeOperation = 'source-over';
      x.strokeStyle = 'rgba(255,255,255,1)'; x.lineWidth = 3; x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 256); x.stroke();
      return toTex(c, { repeat: false });
    });
  }

  /* ---------- ground textures ---------- */
  function grass(){
    return memo('grass', () => {
      const N = makeNoise(11), rnd = mulberry32(5);
      const [c, x] = paint(256, 256, (i, j) => {
        const n = N.fbm(i / 32, j / 32, 5, 8, 8), m = N.noise(i / 6, j / 6, 43, 43);
        const k = .65 + n * .5 + m * .12;
        return [70 * k + 34, 128 * k + 30, 64 * k + 18];
      });
      for (let k = 0; k < 400; k++){ x.fillStyle = rnd() < .5 ? 'rgba(255,240,180,.5)' : 'rgba(255,255,255,.55)'; x.fillRect(rnd() * 256, rnd() * 256, 1.4, 1.4); }
      for (let k = 0; k < 60; k++){ x.fillStyle = ['#ffd84a', '#ff8fb6', '#ffffff', '#9fd0ff'][k % 4]; x.beginPath(); x.arc(rnd() * 256, rnd() * 256, 1.6, 0, 7); x.fill(); }
      const t = toTex(c); return t;
    });
  }
  function rock(){
    return memo('rock', () => {
      const N = makeNoise(23);
      const [c] = paint(256, 256, (i, j) => {
        const strata = Math.sin(j / 256 * Math.PI * 2 * 7 + N.fbm(i / 40, j / 40, 3, 6, 6) * 6) * .5 + .5;
        const n = N.fbm(i / 20, j / 20, 5, 13, 13);
        const k = .55 + n * .45 + strata * .14;
        return [150 * k + 18, 118 * k + 14, 100 * k + 12];
      });
      return toTex(c);
    });
  }
  function road(){
    return memo('road', () => {
      const N = makeNoise(3), rnd = mulberry32(9);
      const [c, x] = paint(128, 256, (i, j) => {
        const n = N.fbm(i / 10, j / 10, 4, 13, 26); const k = .5 + n * .35;
        return [196 * k + 40, 170 * k + 34, 132 * k + 26];
      });
      x.fillStyle = 'rgba(255,255,255,.6)'; for (let k = 0; k < 4; k++) x.fillRect(62, k * 64 + 8, 4, 30);
      for (let k = 0; k < 200; k++){ x.fillStyle = 'rgba(90,70,50,.3)'; x.fillRect(rnd() * 128, rnd() * 256, 2, 2); }
      return toTex(c);
    });
  }
  // stucco wall with windows for the sky-city houses/towers
  function wall(v = 0){
    return memo('wall' + v, () => {
      const N = makeNoise(31 + v), rnd = mulberry32(17 + v);
      const base = [[246, 238, 222], [236, 224, 208], [222, 232, 240]][v % 3];
      const [c, x] = paint(128, 256, (i, j) => { const n = N.fbm(i / 16, j / 16, 3, 8, 16); const k = .9 + n * .12; return [base[0] * k, base[1] * k, base[2] * k]; });
      for (let r = 0; r < 6; r++) for (let q = 0; q < 3; q++){
        if (rnd() < .2) continue;
        const X = 14 + q * 40, Y = 18 + r * 40;
        x.fillStyle = '#3a4a6a'; x.fillRect(X, Y, 20, 24);
        x.fillStyle = rnd() < .35 ? '#ffd890' : '#6a8ab0'; x.fillRect(X + 2, Y + 2, 16, 20);
        x.fillStyle = '#f8f4ec'; x.fillRect(X + 9, Y + 2, 2, 20); x.fillRect(X + 2, Y + 11, 16, 2);
        x.fillStyle = 'rgba(0,0,0,.15)'; x.fillRect(X - 2, Y + 24, 24, 3);
      }
      return toTex(c);
    });
  }
  // the moon: craters, maria and a bright limb
  function moon(){
    return memo('moon', () => {
      const N = makeNoise(99), rnd = mulberry32(42);
      const W = 512, H = 256;
      const [c, x] = paint(W, H, (i, j) => {
        const n = N.fbm(i / 64, j / 64, 6, 8, 4), m = N.fbm(i / 150 + 3, j / 150, 3, 4, 2);
        let k = .72 + n * .35 - smoothstep(.5, .62, m) * .28;
        return [238 * k, 232 * k, 222 * k];
      });
      for (let k = 0; k < 140; k++){
        const X = rnd() * W, Y = rnd() * H, r = Math.pow(rnd(), 3) * 22 + 2;
        const g = x.createRadialGradient(X - r * .2, Y - r * .2, r * .2, X, Y, r);
        g.addColorStop(0, 'rgba(60,55,50,.28)'); g.addColorStop(.8, 'rgba(40,36,32,.18)'); g.addColorStop(.92, 'rgba(255,250,240,.35)'); g.addColorStop(1, 'rgba(255,250,240,0)');
        x.fillStyle = g; x.beginPath(); x.arc(X, Y, r, 0, 7); x.fill();
      }
      return toTex(c, { repeat: false });
    });
  }
  function smoothstep(a, b, v){ const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); }

  // canvas used by the share card / photo frame (not a GPU texture)
  function shareCanvas(w, h){ return canvas(w, h); }

  return { makeNoise, mulberry32, glow, flare, smoke, puff, feather, grass, rock, road, wall, moon, shareCanvas };
})();
