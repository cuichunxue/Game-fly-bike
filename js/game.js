/* ============================================================
 * Sky Pedal — game core
 * 丘を駆け下りて空へ。雲海・空の街・夕陽の海・星の海を越えて月まで。
 * 飛行物理（位置エネルギーと速度の交換）・入力・カメラ演出・進行・HUD。
 * レンダラー/ポストFX/画質自動調整の骨格はロードスター系エンジンから継承。
 * ============================================================ */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const W = SP.World, Md = SP.Models, FX = SP.FX, AU = SP.Audio;
const ZONES = W.ZONES;

/* ---------- tuning ---------- */
// arcade flight model: a magic bicycle trades height for speed like a glider; pedalling is thrust
const PH = { G: 9.8, CRUISE: 4.6, SPRINT: 6.6, DRAG: .0105, VMIN: 6, VMAX: 48, STALL: 10, BANK: .95, PITCH: .62, ROLL_K: 5, PITCH_K: 3.2,
  DRAIN: 22, REGEN: 15, RING_KICK: 2.5, GOLD_KICK: 6, TAIL: 6, BIKE_R: .8 };
const ASSIST = {
  strong: { key: 'strong', label: 'つよい', hearts: 5, magnet: 1.3, floorGuard: 1, bounce: true,  scoreK: .8 },
  normal: { key: 'normal', label: 'ふつう', hearts: 4, magnet: .55, floorGuard: .6, bounce: false, scoreK: 1 },
  off:    { key: 'off',    label: 'なし',   hearts: 3, magnet: 0,   floorGuard: 0,  bounce: false, scoreK: 1.25 },
};
const QUAL = {
  high: { dpr: 2,    bloom: true,  bloomScale: .8, msaa: true },
  mid:  { dpr: 1.5,  bloom: true,  bloomScale: .5, msaa: false },
  low:  { dpr: 1,    bloom: false, bloomScale: .5, msaa: false },
};
const isTouch = () => matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

/* ---------- settings & progress ---------- */
function load(k, d){ try { const v = JSON.parse(localStorage.getItem(k)); return v ? Object.assign({}, d, v) : d; } catch(e){ return d; } }
function save(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
const settings = load('sp_settings', { music: .6, sfx: .8, muted: false, quality: 'auto', assist: 'normal', invert: false, tilt: false, motion: matchMedia('(prefers-reduced-motion: reduce)').matches, paint: 'sky' });
if (!Md.PAINTS[settings.paint]) settings.paint = 'sky';
if (!ASSIST[settings.assist]) settings.assist = 'normal';
const progress = load('sp_progress', { reached: 0, cleared: false, best: 0, bestTime: 0, stars: ZONES.map(() => [false, false, false]), plays: 0 });
if (!Array.isArray(progress.stars) || progress.stars.length !== ZONES.length) progress.stars = ZONES.map(() => [false, false, false]);

/* ---------- renderer ---------- */
const stage = $('stage');
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false }); }
catch(e){ $('loading').innerHTML = '<div class="card" style="margin:auto"><h2>3D画面を開けませんでした</h2><p class="lead">WebGL に対応した最新の Safari / Chrome / Edge で開いてください。</p><button class="go" onclick="location.reload()"><span>再読み込み</span></button></div>'; return; }
SP.renderer = renderer;
renderer.info.autoReset = false;
renderer.outputEncoding = THREE.LinearEncoding; renderer.toneMapping = THREE.NoToneMapping;
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); if (S.mode === 'play') togglePause(); hint('画面の再準備中…', 3); }, false);
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, 1, .3, 6000);
scene.add(camera);
let qualityKey = settings.quality === 'auto' ? (isTouch() ? 'mid' : 'high') : settings.quality;
let Q = QUAL[qualityKey];

/* ---------- post-processing (ACES, vignette, grain, radial speed blur, aberration) ---------- */
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, exposure: { value: 1 }, vignette: { value: .5 }, grain: { value: .025 }, time: { value: 0 }, aberr: { value: 0 }, blur: { value: 0 }, sat: { value: 1.08 }, res: { value: new THREE.Vector2(1, 1) }, tint: { value: new THREE.Color(0, 0, 0) }, warm: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float exposure, vignette, grain, time, aberr, blur, sat, warm; uniform vec2 res; uniform vec3 tint;
    varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
    vec3 srgb(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4)) - .055, step(.0031308, c)); }
    void main(){
      vec2 dc = vUv - .5; vec3 col;
      if (blur > .002){ vec3 acc = vec3(0.); for (int i = 0; i < 6; i++){ float s = 1. - blur*float(i)*.011; acc += texture2D(tDiffuse, .5 + dc*s).rgb; } col = acc/6.; }
      else col = texture2D(tDiffuse, vUv).rgb;
      if (aberr > .001){ float a = aberr*.006*length(dc)*2.; col.r = texture2D(tDiffuse, vUv + dc*a).r; col.b = texture2D(tDiffuse, vUv - dc*a).b; }
      col = col*exposure + tint;
      col = aces(col);
      col *= mix(vec3(1.), vec3(1.06, 1., .9), warm);
      float l = dot(col, vec3(.2126,.7152,.0722)); col = mix(vec3(l), col, sat);
      float v = smoothstep(.95, .25, length(dc*vec2(1., .82))); col *= mix(1., v, vignette);
      col = srgb(col);
      col += (fract(sin(dot(vUv*res + time*61.7, vec2(12.9898,78.233)))*43758.5453) - .5)*grain;
      gl_FragColor = vec4(col, 1.);
    }`
};
let composer, bloom, finalPass;
function buildComposer(){
  if (composer){ composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  const pr = renderer.getPixelRatio(), w = innerWidth, h = innerHeight;
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: (renderer.capabilities.isWebGL2 && Q.msaa) ? 4 : 0 });
  composer = new THREE.EffectComposer(renderer, rt);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), .35, .5, 1.15);
  bloom.enabled = Q.bloom; composer.addPass(bloom);
  finalPass = new THREE.ShaderPass(FinalShader); composer.addPass(finalPass);
}
function applyQuality(){
  Q = QUAL[qualityKey];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
  buildComposer(); resize();
}
let baseFov = 66;
function resize(){
  const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
  renderer.setSize(w, h, false);
  if (composer){ composer.setPixelRatio(pr); composer.setSize(w, h); bloom.setSize(w * pr * Q.bloomScale, h * pr * Q.bloomScale); finalPass.uniforms.res.value.set(w * pr, h * pr); }
  if (frameX || frameY){ const fx = frameX, fy = frameY; frameX = frameY = -1; setFraming(fx, fy); }
  camera.aspect = w / h; baseFov = camera.aspect < .8 ? 78 : camera.aspect < 1.4 ? 70 : 64; camera.updateProjectionMatrix();
  FX.setPointScale(h * pr / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

/* ---------- state ---------- */
const S = {
  mode: 'loading', phase: 'ground', free: -1, startZone: 0, assist: ASSIST[settings.assist],
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0, v: 0, vy: 0, stamina: 100, tired: false, tail: 0,
  hearts: 4, score: 0, combo: 0, comboT: 0, maxCombo: 0, rings: 0, ringsSeen: 0, lanterns: 0, meteors: 0, nearMiss: 0, skim: 0, starsRun: [],
  followers: [], maxFlock: 0, maxSpeed: 0, time: 0, zone: 0, wingOpen: 0, crank: 0, cadence: 0, coasting: false, cheer: 0,
  invuln: 0, crashT: 0, slow: 0, timeScale: 1, shake: 0, sideCam: 0, introT: 0, idleT: 0, bellT: 0, photo: null, goalT: 0, inCloud: 0, whiteout: 0,
  hints: {}, lastSafe: { x: 0, y: 60, z: 0 }, thermalIn: false, softIn: null, nearT: 0, punch: false, gatePassed: false, endReason: '', idleAirT: 0,
};
const input = { kx: 0, ky: 0, kS: false, tx: 0, ty: 0, tS: false, px: 0, py: 0, pS: false, gx: 0, gy: 0, sx: 0, sy: 0, sprint: false, bell: false, active: false };

let bike, scarf;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const fwd = new THREE.Vector3(0, 0, 1), right = new THREE.Vector3(1, 0, 0), up = new THREE.Vector3(0, 1, 0), vel = new THREE.Vector3();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camUp = new THREE.Vector3(0, 1, 0);

/* ---------- boot sequence ---------- */
function setLoad(p, txt){ $('loadFill').style.width = (p * 100) + '%'; if (txt) $('loadTxt').textContent = txt; }
const bootSteps = [
  ['朝の空を描いています…', () => { SP.Tex.glow(); SP.Tex.smoke(); SP.Tex.puff(); SP.Tex.feather(); }],
  ['丘に草花を植えています…', () => { SP.Tex.grass(); SP.Tex.rock(); SP.Tex.road(); for (let i = 0; i < 3; i++) SP.Tex.wall(i); SP.Tex.moon(); }],
  ['雲海と海を広げています…', () => { W.init(scene, renderer); FX.init(scene); applyQuality(); }],
  ['自転車に羽をつけています…', () => { bike = Md.bicycle(settings.paint); scene.add(bike); scarf = Md.scarf(Md.PAINTS[settings.paint].scarf); scene.add(scarf.mesh); }],
  ['旅のルートを描いています…', () => { W.buildRun({ seed: 7 }); placeAtStart(0); warmWorld(); }],
  ['光を準備しています…', () => { camera.position.set(6, W.yRoad(260) + 2.5, 250); camera.lookAt(0, W.yRoad(260) + 1, 262); renderer.compile(scene, camera); }],
];
let bootI = 0;
function boot(){
  if (bootI < bootSteps.length){
    const [txt, fn] = bootSteps[bootI]; setLoad(bootI / bootSteps.length, txt);
    setTimeout(() => { try { fn(); } catch(e){ console.error(e); } bootI++; boot(); }, 16);
    return;
  }
  setLoad(1, 'READY');
  buildTitleUI(); goTitle();
  setTimeout(() => $('loading').classList.add('done'), 120);
  setTimeout(() => { const l = $('loading'); if (l) l.remove(); }, 900);
  requestAnimationFrame(frame);
}
function warmWorld(){ for (let i = 0; i < 80; i++) W.update(0, camera.position, S.z, 0); }

/* ---------- title / UI ---------- */
function segGroup(id, cb, initial){
  const el = $(id); const btns = [...el.querySelectorAll('button')];
  const set = v => btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
  btns.forEach(b => b.addEventListener('click', () => { AU.init(); AU.sfx('click'); set(b.dataset.v); cb(b.dataset.v); }));
  if (initial !== undefined) set(initial);
  return set;
}
let titleMode = 'journey';
function buildTitleUI(){
  // bike colours
  const sw = $('paintSeg'); sw.innerHTML = '';
  Object.entries(Md.PAINTS).forEach(([k, p]) => {
    const b = document.createElement('button'); b.className = 'swatch'; b.dataset.v = k; b.setAttribute('aria-label', p.name); b.title = p.name;
    b.style.setProperty('--c', '#' + p.frame.toString(16).padStart(6, '0')); b.style.setProperty('--c2', '#' + p.scarf.toString(16).padStart(6, '0'));
    b.setAttribute('aria-pressed', String(k === settings.paint));
    b.addEventListener('click', () => { AU.init(); AU.sfx('bell'); settings.paint = k; save('sp_settings', settings); Md.setPaint(bike, k); scarf.mat.color.setHex(p.scarf); scarf.mat.emissive.setHex(p.scarf); sw.querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-pressed', String(s === b))); S.cheer = 1; });
    sw.appendChild(b);
  });
  segGroup('assistSeg', v => { settings.assist = v; save('sp_settings', settings); }, settings.assist);
  segGroup('modeSeg', v => { titleMode = v; renderWorldPicker(); }, 'journey');
  renderWorldPicker();
  syncSettingsUI();
}
function renderWorldPicker(){
  const el = $('worldPick'); el.innerHTML = '';
  const maxZ = progress.reached;
  ZONES.forEach((Z, k) => {
    const b = document.createElement('button'); b.className = 'wpick'; b.dataset.k = k;
    const locked = titleMode === 'free' ? (k === 0 || k > Math.max(1, maxZ)) : k > maxZ;
    const st = progress.stars[k].filter(Boolean).length;
    b.innerHTML = `<span class="wi">${Z.icon}</span><b>${Z.name}</b><small>${k === 0 ? '' : '★'.repeat(st) + '☆'.repeat(3 - st)}</small>`;
    if (locked){ b.disabled = true; b.classList.add('locked'); b.title = 'ジャーニーで到達すると選べます'; }
    if (titleMode === 'free' && k === 0) b.hidden = true;
    const sel = titleMode === 'free' ? (S.freePick || 1) : S.startZone;
    b.setAttribute('aria-pressed', String(k === sel));
    b.addEventListener('click', () => { AU.init(); AU.sfx('select'); if (titleMode === 'free') S.freePick = k; else S.startZone = k; renderWorldPicker(); });
    el.appendChild(b);
  });
  $('worldRow').hidden = titleMode === 'journey' && maxZ === 0;
  $('startBtn').querySelector('span').textContent = titleMode === 'free' ? 'そらさんぽに出かける' : (S.startZone > 0 ? ZONES[S.startZone].name + 'から とぶ' : 'タップして とびだす');
  const best = progress.best ? `ベスト ${progress.best.toLocaleString()}　` : '';
  const stars = progress.stars.reduce((a, s) => a + s.filter(Boolean).length, 0);
  $('bestLine').textContent = (best + (stars ? `★ ${stars}/12` : '') + (progress.cleared ? '　🌙 月に到達' : '')).trim();
}
function showScreen(id){ ['title', 'pause', 'result'].forEach(s => $(s).hidden = s !== id); }
function goTitle(){
  S.mode = 'title'; showScreen('title'); $('hud').hidden = true; $('touch').hidden = true;
  S.free = -1; W.buildRun({ seed: 7 }); placeAtStart(0); warmWorld(); FX.clear();
  S.followers = []; S.titleT = 0; S.orbit = .6;
  AU.setMode('title'); AU.setMuffle(0);
  renderWorldPicker();
}

/* ---------- start / place ---------- */
const START_Z = 262;
function placeAtStart(zone){
  S.phase = zone === 0 ? 'ground' : 'air';
  S.yaw = 0; S.pitch = 0; S.bank = 0; S.tail = 0; S.invuln = 0;
  if (zone === 0){ S.x = 0; S.z = START_Z; S.y = W.yRoad(S.z); S.v = 0; S.wingOpen = 0; }
  else {
    const z = W.ZONE_Z[zone] + 30; S.z = z; S.x = 0; S.v = 22; S.wingOpen = 1;
    const B = W.bandAt(0, z); S.y = zone === 3 ? W.SEA_Y + 60 : zone === 4 ? -60 : B.floor + 55;
  }
  S.lastSafe = { x: S.x, y: S.y + (S.phase === 'ground' ? 30 : 0), z: S.z };
  placeBike(0);
}
function startRun(opts = {}){
  AU.init();
  const free = opts.free ?? -1, zone = free >= 0 ? free : (opts.zone ?? 0);
  S.free = free; S.startZone = free >= 0 ? S.startZone : zone; S.assist = ASSIST[settings.assist];
  W.buildRun({ seed: 7 + (progress.plays % 5), free: free >= 0, zone: free, startZ: free >= 0 ? W.ZONE_Z[free] : 0 });
  progress.plays++; save('sp_progress', progress);
  placeAtStart(free >= 0 ? free : zone);
  Object.assign(S, { hearts: S.assist.hearts, score: 0, combo: 0, comboT: 0, maxCombo: 0, rings: 0, ringsSeen: 0, lanterns: 0, meteors: 0, nearMiss: 0, skim: 0, starsRun: [],
    followers: [], maxFlock: 0, maxSpeed: 0, time: 0, stamina: 100, tired: false, crashT: 0, slow: 0, sideCam: 0, introT: 0, idleT: 0, photo: null, goalT: 0, gatePassed: false,
    zone: W.zoneAt(S.z), punch: S.z > W.DIVE_Z1, endReason: '', shake: 0, cheer: 0, thermalIn: false, softIn: null, idleAirT: 0 });
  S.lastLineDone = {};
  FX.clear(); warmWorld();
  S.mode = 'play'; showScreen(null); $('hud').hidden = false; $('hud').classList.remove('cine'); $('touch').hidden = false;
  $('touch').classList.toggle('desk', !isTouch());
  $('hint').classList.remove('on'); $('banner').classList.remove('on');
  AU.setSong(S.zone, true); AU.setMode('play'); AU.setMuffle(0);
  FX.setMotes(S.zone);
  buildJourneyBar(); for (const k in hudCache) delete hudCache[k];
  if (S.phase === 'ground'){ hint(isTouch() ? '右下の <b>こぐ</b> を長押しして、こぎだそう！' : '<b>Space</b> を長押しして、こぎだそう！', 6); $('sprintBtn').classList.add('beckon'); }
  else { banner(S.zone); }
  if (settings.tilt) calibrateTilt();
  releaseAll(); lastT = performance.now();
}

/* ---------- messaging ---------- */
let hintT = 0, toastT = 0, bannerT = 0;
function hint(html, dur = 3.5){ const h = $('hint'); h.innerHTML = html; h.classList.add('on'); hintT = dur; }
function once(k, fn){ if (!S.hints[k]){ S.hints[k] = 1; fn(); } }
function toast(big, small = '', dur = 1.4, cls = ''){ const t = $('toast'); $('toastBig').textContent = big; $('toastSmall').textContent = small; t.className = 'toast on ' + cls; toastT = dur; }
function banner(k){
  const Z = ZONES[k], b = $('banner');
  $('bnIcon').textContent = Z.icon; $('bnEn').textContent = Z.en; $('bnName').textContent = Z.name; $('bnSub').textContent = Z.sub;
  b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); bannerT = 3.6;
}
function flash(strength = .7, white = true){ if (settings.motion) strength *= .4; const f = $('flash'); f.classList.toggle('white', white); f.style.transition = 'none'; f.style.opacity = strength; requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = 'opacity .9s'; f.style.opacity = 0; })); }
function vibrate(p){ try { if (navigator.vibrate) navigator.vibrate(p); } catch(e){} }
const popEl = $('popups');
function popup(text, cls = ''){
  const d = document.createElement('div'); d.className = 'pop ' + cls; d.textContent = text;
  d.style.left = (50 + (Math.random() - .5) * 14) + '%';
  popEl.appendChild(d); setTimeout(() => d.remove(), 1100);
  while (popEl.children.length > 5) popEl.firstChild.remove();
}
function mult(){ return Math.min(3, 1 + S.combo * .1) * (1 + S.followers.length * .04); }
function addScore(base, label, cls){
  const pts = Math.round(base * mult() * S.assist.scoreK / 10) * 10;
  S.score += pts; if (label) popup(label + ' +' + pts, cls);
  const sc = $('score'); sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump');
  return pts;
}

/* ---------- journey bar ---------- */
function buildJourneyBar(){
  const el = $('jbar'); el.innerHTML = '';
  if (S.free >= 0){ el.classList.add('free'); el.innerHTML = `<span class="jfree">${ZONES[S.free].icon} そらさんぽ · ${ZONES[S.free].name}</span>`; return; }
  el.classList.remove('free');
  ZONES.forEach((Z, k) => { const s = document.createElement('i'); s.className = 'jseg'; s.style.flexGrow = W.ZONE_Z[k + 1] - W.ZONE_Z[k]; s.innerHTML = `<b></b><em>${Z.icon}</em>`; el.appendChild(s); });
  const m = document.createElement('u'); m.className = 'jbike'; m.id = 'jbike'; m.textContent = '🚲'; el.appendChild(m);
  const moon = document.createElement('span'); moon.className = 'jmoon'; moon.textContent = '🌕'; el.appendChild(moon);
}
function updateJourneyBar(){
  if (S.free >= 0) return;
  const total = W.ZONE_Z[5], k = clamp(S.z / W.GOAL_Z, 0, 1);
  const segs = $('jbar').querySelectorAll('.jseg');
  segs.forEach((s, i) => { const a = W.ZONE_Z[i], b = W.ZONE_Z[i + 1]; s.firstChild.style.width = clamp((S.z - a) / (b - a), 0, 1) * 100 + '%'; s.classList.toggle('cur', i === S.zone); });
  const jb = $('jbike'); if (jb) jb.style.left = (k * W.GOAL_Z / total * 100) + '%';
}

/* ---------- physics ---------- */
const PREV = new THREE.Vector3();
function step(dt){
  const A = S.assist;
  S.time += dt;
  if (S.invuln > 0) S.invuln -= dt;
  if (S.comboT > 0){ S.comboT -= dt; if (S.comboT <= 0){ if (S.combo >= 5) toast('COMBO ×' + S.combo, 'つながった！', 1); S.combo = 0; } }
  if (S.tail > 0) S.tail -= dt;
  if (S.bellT > 0) S.bellT -= dt;
  if (S.nearT > 0) S.nearT -= dt;
  PREV.set(S.x, S.y, S.z);

  if (input.bell){ input.bell = false; if (S.phase === 'ground' || S.phase === 'air') ringBell(); }
  if (S.phase === 'crash') return crashStep(dt);
  if (S.phase === 'goal') return goalStep(dt);
  if (S.phase === 'end') return;

  // stamina: sprinting burns it, gliding gives it back
  const wantSprint = input.sprint && !S.tired;
  const sprint = wantSprint && S.stamina > 0;
  if (sprint && S.phase !== 'ground'){ S.stamina -= PH.DRAIN * dt; if (S.stamina <= 0){ S.stamina = 0; S.tired = true; AU.sfx('tired'); once('tired', () => hint('ひと休み… 手をはなして<b>滑空</b>すると、元気がもどる', 3)); } }
  else S.stamina = Math.min(100, S.stamina + PH.REGEN * dt * (S.phase === 'ground' ? 2 : 1));
  if (S.tired && S.stamina > 30) S.tired = false;
  S.sprinting = sprint;

  if (S.phase === 'ground') groundStep(dt, sprint);
  else airStep(dt, sprint);

  S.maxSpeed = Math.max(S.maxSpeed, S.v);
  // zone changes: a new world
  const zk = W.zoneAt(S.z);
  if (zk !== S.zone && S.free < 0){
    S.zone = zk; banner(zk); AU.sfx('zone'); AU.setSong(zk); FX.setMotes(zk);
    if (zk > progress.reached){ progress.reached = zk; save('sp_progress', progress); }
    if (zk === 4) once('moonHint', () => setTimeout(() => hint('月が見える…！ <b>のぼって</b>、光の門をくぐろう', 4), 3800));
  }
  collect(dt);
  if (S.free < 0 && S.z > W.GOAL_Z && S.phase === 'air') reachGoal();
}

function groundStep(dt, sprint){
  S.idleT += dt;
  // nobody touched anything for a while: the hill gives you a gentle push anyway
  const auto = S.idleT > 3.2 && S.v < 6 ? 2.2 : 0;
  const zz = Math.min(S.z, W.ROAD_END), slope = Math.atan2(W.yRoad(zz) - W.yRoad(zz - 1), 1);   // backward difference: never sample past the edge
  const pedal = sprint ? 4.2 : auto;
  S.v += (-PH.G * Math.sin(slope) + pedal - PH.DRAG * S.v * S.v - .15) * dt;
  S.v = Math.max(0, S.v);
  S.yaw = damp(S.yaw, -input.sx * .25, 6, dt);
  S.x = clamp(S.x + Math.sin(S.yaw) * S.v * dt, -2.8, 2.8);
  S.z += Math.cos(S.yaw) * S.v * dt; S.y = W.yRoad(S.z);
  S.pitch = slope; S.bank = damp(S.bank, -S.yaw * 1.2, 6, dt);
  S.cadence = sprint ? Math.max(1.2, S.v / 4) : auto ? .9 : 0; S.coasting = !sprint && !auto;
  if (S.v > 1 && S.hints.go !== 1){ S.hints.go = 1; $('sprintBtn').classList.remove('beckon'); }
  if (S.z > 360 && S.v > 8) once('edge', () => hint('丘の先は…空！ そのまま<b>とびだせ！</b>', 2.6));
  // the cliff edge: wings unfold, the ground falls away
  if (S.z >= W.ROAD_END){
    S.phase = 'air'; S.airT = 0; S.pitch = slope + .16; S.v = Math.max(S.v, 17); S.vy = 0;
    S.slow = settings.motion ? 0 : 1.1; S.sideCam = 2.4; S.unfoldT = 0;
    AU.sfx('unfold'); AU.sfx('takeoff'); flash(.35, true); vibrate(30);
    toast('とんだ！', '空とぶ自転車、出発', 2.2, 'big');
    setTimeout(() => { if (S.mode === 'play') hint(isTouch() ? '画面を<b>なぞって</b>操縦　↑のぼる ↓さがる ←→まがる' : '<b>← → ↑ ↓</b>（WASD）で操縦。<b>Space</b>でこぐ', 5); }, 2300);
  }
}

function airStep(dt, sprint){
  const A = S.assist, B = W.bandAt(S.x, S.z);
  S.airT = (S.airT || 0) + dt;
  let sx = input.sx, sy = input.sy;
  if (S.wingOpen < 1) S.wingOpen = Math.min(1, S.wingOpen + dt * 1.8);
  // bank & turn (coordinated turn: tighter at low speed)
  S.bank = damp(S.bank, sx * PH.BANK, PH.ROLL_K, dt);
  let yawRate = -(PH.G / Math.max(12, S.v)) * Math.tan(S.bank) * .95;
  yawRate = clamp(yawRate, -1.1, 1.1);
  // the course gently guides you: a soft limit on heading and on how far you stray sideways
  const yawLim = .95;
  if (Math.abs(S.yaw) > yawLim) yawRate -= Math.sign(S.yaw) * (Math.abs(S.yaw) - yawLim) * 3;
  const half = 120;
  if (Math.abs(S.x) > half){ yawRate -= Math.sign(S.x) * Math.min(.8, (Math.abs(S.x) - half) * .03); once('wind', () => hint('風が、旅の道へ押しもどしてくれる', 2.4)); }
  S.yaw = clamp(S.yaw + yawRate * dt, -1.3, 1.3);
  // pitch: what you ask for, with assists near the floor/ceiling and a nose-drop when slow
  let pt = sy * PH.PITCH * (sprint && sy > 0 ? 1.2 : 1);
  const h = S.y - B.floor;
  if (B.kind !== 'cloud' && A.floorGuard > 0 && h < 16){ pt = Math.max(pt, (16 - h) / 16 * .45 * A.floorGuard); }
  if (B.kind === 'cloud' && h < 6) pt = Math.max(pt, (6 - h) / 6 * .3);
  if (S.y > B.ceil - 12) pt = Math.min(pt, -(S.y - (B.ceil - 12)) / 12 * .45);
  if (S.v < PH.STALL) pt = Math.min(pt, -.3 * (PH.STALL - S.v) / 4);
  if (Math.abs(sy) < .05 && Math.abs(pt) < .02) pt = 0;
  S.pitch = damp(S.pitch, pt, PH.PITCH_K, dt);
  // speed: pedal thrust vs gravity along the path vs air drag
  S.coasting = !sprint && S.pitch < -.18;
  const thrust = (S.coasting ? 0 : PH.CRUISE) + (sprint ? PH.SPRINT : 0) + (S.tail > 0 ? PH.TAIL : 0);
  S.v += (thrust - PH.G * Math.sin(S.pitch) * .85 - PH.DRAG * S.v * S.v) * dt;
  S.v = clamp(S.v, PH.VMIN, PH.VMAX);
  // thermals lift you straight up
  let lift = 0, inTh = false;
  for (const e of W.active){
    if (e.kind !== 'thermal') continue;
    const d = Math.hypot(S.x - e.x, S.z - e.z);
    if (d < e.r && S.y > e.y0 - 5 && S.y < e.y1){ lift = 10 * Math.sqrt(1 - d / e.r); inTh = true; }
  }
  if (inTh){ S.stamina = Math.min(100, S.stamina + 35 * dt); if (!S.thermalIn){ AU.sfx('thermal'); popup('上昇気流！', 'gold'); once('thermal', () => hint('上昇気流に乗った！ <b>手をはなすだけ</b>でぐんぐん上がる', 3)); } }
  S.thermalIn = inTh;
  const cp = Math.cos(S.pitch);
  vel.set(S.v * cp * Math.sin(S.yaw), S.v * Math.sin(S.pitch) + lift, S.v * cp * Math.cos(S.yaw));
  // ring magnet (assist): nudge toward the next ring's centre
  if (A.magnet > 0){
    const r = nextRing();
    if (r){ const dz = r.z - S.z; if (dz > 2 && dz < 34){ const dx = r.x - S.x, dy = r.y - S.y; if (Math.hypot(dx, dy) < 9){ vel.x += dx * A.magnet; vel.y += dy * A.magnet; } } }
  }
  S.x += vel.x * dt; S.y += vel.y * dt; S.z += vel.z * dt; S.vy = vel.y;
  if (S.y > B.ceil) S.y = damp(S.y, B.ceil, 4, dt);

  // what's below
  const h2 = S.y - B.floor;
  if (B.kind === 'cloud'){
    if (h2 < 1.5){ S.v *= 1 - .8 * dt; S.y = Math.max(S.y, B.floor - 3); if (Math.random() < .5) FX.cloudPuff(S.x, B.floor + 1, S.z, vel.x, vel.z); if (S.combo && h2 < -1){ S.comboT = Math.min(S.comboT, .3); } once('cloudsink', () => hint('雲に沈むとスピードが落ちる。<b>上へ</b>なぞってぬけ出そう', 3)); }
    else if (h2 < 7){ S.skim += dt; if (Math.random() < .35) FX.cloudPuff(S.x, B.floor + .5, S.z, vel.x, vel.z); skimScore(dt, '雲すれすれ'); }
  } else if (B.kind === 'sea'){
    if (h2 < .9){
      if (A.bounce || S.invuln > 0){ S.y = B.floor + 1.2; S.pitch = .35; S.v *= .85; FX.splash(S.x, B.floor, S.z, vel.x, vel.z, true); AU.sfx('splash'); S.combo = 0; vibrate(20); }
      else return crash('海にドボン！', 'splash');
    } else if (h2 < 6){ S.skim += dt; if (Math.random() < .5) FX.splash(S.x, B.floor + .2, S.z - 1, vel.x, vel.z, false); if (Math.random() < .08) AU.sfx('spray'); skimScore(dt, '波すれすれ'); }
  } else if (B.kind === 'ground' && S.airT > .8){
    if (h2 < .6){ if (A.bounce || S.invuln > 0){ S.y = B.floor + 1; S.pitch = .4; S.v *= .8; AU.sfx('bump'); } else return crash('地面にぶつかった', 'ground'); }
  }
  // the dive through the sea of clouds
  if (S.free < 0 && !S.punch && S.z > W.DIVE_Z0 - 60 && S.y < W.CLOUD_Y - 8){
    S.punch = true; AU.sfx('punch'); flash(.5, true); toast('雲の下へ！', '夕陽の海が広がる', 2.2, 'big'); S.cheer = 1;
  }
  // soft clouds (cumulus): a white-out, a little drag, never a crash
  const soft = W.softAt(S.x, S.y, S.z);
  if (soft && !S.softIn){ AU.sfx('cloud'); }
  S.softIn = soft;
  if (soft) S.v *= 1 - .25 * dt;
  // solid things
  const pr = W.probe(S.x, S.y, S.z, PH.BIKE_R + 3.2);
  if (pr.e){
    if (pr.d < PH.BIKE_R && S.invuln <= 0){
      if (A.bounce && pr.d > -1.6){ bounceOff(pr.e); }
      else return crash(crashText(pr.e), 'hit', pr.e);
    } else if (pr.d < PH.BIKE_R + 3 && pr.d >= PH.BIKE_R && S.v > 16 && pr.e.nearDone !== true && S.nearT <= 0){
      pr.e.nearDone = true; S.nearMiss++; S.nearT = .6;
      AU.sfx('nearmiss', 0, { pan: clamp((pr.e.x - S.x) / 10, -1, 1) * -1 }); addScore(150, 'ニアミス', 'cyan'); comboUp();
    }
  }
  // remember a safe spot to come back to
  if (!soft && S.invuln <= 0 && h2 > 12 && S.y < B.ceil - 10 && (!pr.e || pr.d > 12)){ S.lastSafe.x = S.x; S.lastSafe.y = S.y; S.lastSafe.z = S.z; }
  // idle in the air: a reminder that you can steer
  if (!input.active && Math.abs(input.sx) + Math.abs(input.sy) < .05){ S.idleAirT += dt; if (S.idleAirT > 7) { S.idleAirT = -20; hint(isTouch() ? '画面を<b>なぞる</b>と自由に飛べるよ' : '<b>矢印キー</b>で自由に飛べるよ', 3); } } else S.idleAirT = 0;
  S.cadence = S.coasting ? 0 : sprint ? 2.6 : 1.3;
}
function skimScore(dt, label){
  S.skimAcc = (S.skimAcc || 0) + dt;
  if (S.skimAcc > .5){ S.skimAcc = 0; addScore(40, label, 'cyan'); once('skim', () => hint('すれすれ飛行はボーナス！', 2.2)); }
}
function crashText(e){ return ({ balloon: '気球にぶつかった', island: '浮島にぶつかった', bridge: '橋にぶつかった', airship: '飛行船にぶつかった', stack: '岩にぶつかった', arch: '岩のアーチにぶつかった', lighthouse: '灯台にぶつかった', whale: 'クジラとごっつん！', boat: 'マストにぶつかった', asteroid: '星のかけらにぶつかった' })[e.kind] || 'ぶつかった！'; }
function bounceOff(e){
  // strong assist: bump away softly instead of crashing
  S.v *= .7; S.pitch = .3; S.yaw += S.x > e.x ? -.3 : .3; S.invuln = 1;
  S.x += S.x > e.x ? 2 : -2; S.y += 2;
  AU.sfx('bump'); FX.crashPoof(S.x, S.y, S.z); S.combo = 0; vibrate(25); popup('ぽよん！', 'warn');
}
function nextRing(){
  let best = null;
  for (const e of W.active){ if (e.kind !== 'ring' || e.taken || e.z < S.z) continue; if (!best || e.z < best.z) best = e; }
  return best;
}
function comboUp(){ S.combo++; S.comboT = 4.5; S.maxCombo = Math.max(S.maxCombo, S.combo); if (S.combo > 1) AU.sfx('combo', S.combo); }

/* ---------- collectibles ---------- */
function collect(dt){
  for (const e of W.active){
    if (e.done) continue;
    switch (e.kind){
      case 'ring': {
        if (e.taken){ e.tk = (e.tk || 0) + dt; if (e.tk > .5) e.done = true; break; }
        if (PREV.z < e.z && S.z >= e.z){
          const r = Math.hypot(S.x - e.x, S.y - e.y);
          if (r < 24) S.ringsSeen++;
          if (r < (e.gold ? 3.7 : 3.4)){
            e.taken = true; S.rings++; comboUp();
            const lk = e.line; lk.got = (lk.got || 0) + 1;
            if (e.gold){
              S.v = Math.min(PH.VMAX, S.v + PH.GOLD_KICK); S.tail = 2.2; AU.sfx('gold'); FX.ringBurst(e.x, e.y, e.z, vel.x, vel.y, vel.z, true); vibrate(18);
              if (lk.got === e.n && e.n > 1){ addScore(600, 'パーフェクト!', 'gold'); toast('PERFECT', '追い風に乗った！', 1.1); S.cheer = 1; }
              else addScore(250, '追い風', 'gold');
            } else {
              S.v = Math.min(PH.VMAX, S.v + PH.RING_KICK); AU.sfx('ring', Math.min(13, S.combo - 1), { pan: clamp((e.x - S.x) / 6, -1, 1) * -1 });
              FX.ringBurst(e.x, e.y, e.z, vel.x, vel.y, vel.z, false); addScore(100, '', '');
            }
            S.stamina = Math.min(100, S.stamina + 6);
            once('ring1', () => hint('いいね！ 光の輪をつなげると<b>コンボ</b>で得点アップ', 3));
          }
        }
        break;
      }
      case 'star': {
        if (Math.hypot(S.x - e.x, S.y - e.y, S.z - e.z) < 3.4){
          e.done = true; S.starsRun.push([e.zone, e.sidx]); AU.sfx('star'); FX.starBurst(e.x, e.y, e.z); flash(.25, false);
          addScore(1000, '★ スターメダル', 'gold'); toast('★ スターメダル', ZONES[e.zone].name + '　' + (S.starsRun.filter(s => s[0] === e.zone).length) + '/3', 1.8); S.cheer = 1; vibrate([20, 40, 20]);
          progress.stars[e.zone][e.sidx] = true; save('sp_progress', progress);
        }
        break;
      }
      case 'lantern': if (Math.hypot(S.x - e.x, S.y - e.y, S.z - e.z) < 3.4){ e.done = true; S.lanterns++; AU.sfx('lantern', S.lanterns); FX.sparkle(e.x, e.y, e.z, FX.C.gold, 14, 1); addScore(60, '', ''); } break;
      case 'meteor': { const o = e.obj; if (o && o.position.distanceTo(tmpV.set(S.x, S.y, S.z)) < 5){ e.done = true; S.meteors++; S.tail = 2.6; S.v = Math.min(PH.VMAX, S.v + 6); AU.sfx('meteor'); FX.starBurst(o.position.x, o.position.y, o.position.z); addScore(300, '流れ星キャッチ', 'gold'); once('meteor', () => hint('流れ星をつかまえると<b>追い風</b>！', 2.4)); } break; }
      case 'flock': flockStep(e, dt); break;
      case 'whale': if (e.breach && Math.abs(e.z - S.z) < 200){ e.breach = 0; AU.sfx('whale'); once('whale', () => hint('クジラだ！ ぶつからないように', 2.4)); }
        if (e.splash){ e.splash = 0; if (e.obj) FX.splash(e.obj.position.x, W.SEA_Y, e.obj.position.z, 0, 0, true); if (Math.abs(e.z - S.z) < 150) AU.sfx('splash'); } break;
      case 'thermal': if (Math.abs(e.z - S.z) < 300 && Math.random() < .7) FX.thermal(e.x, clamp(S.y, e.y0 + 20, e.y1 - 20), e.z, e.r, S.time); break;
    }
  }
}

/* ---------- birds: friends who fly with you ---------- */
const MAX_FOLLOW = 24;
function flockStep(e, dt){
  if (!e.birds) return;
  const d = Math.hypot(S.x - e.x, S.y - e.y, S.z - e.z);
  if (e.perch && !e.flew && Math.abs(S.z - e.z) < 30 && S.v > 4){ e.flew = true; AU.sfx('chirp', 1.4); }
  if ((d < 14 || (e.called && d < 90) || (e.perch && e.flew && d < 40)) && S.followers.length < MAX_FOLLOW){
    let n = 0;
    for (const b of e.birds){ if (b.joined || b.gone || S.followers.length >= MAX_FOLLOW) continue; b.joined = true; b.slot = S.followers.length; S.followers.push(b); n++; }
    if (n){ AU.sfx('join', 0, { pan: 0 }); popup('なかま ×' + S.followers.length, 'cyan'); S.maxFlock = Math.max(S.maxFlock, S.followers.length); once('birds', () => hint('鳥たちが<b>なかま</b>になった！ なかまが多いほど得点アップ。<b>ベル</b>で遠くの群れも呼べる', 4)); }
  }
}
function ringBell(){
  if (S.bellT > 0) return; S.bellT = .35;
  AU.sfx('bell', 0); S.cheer = .6;
  let called = 0;
  for (const e of W.active){
    if (e.kind === 'flock' && Math.hypot(S.x - e.x, S.z - e.z) < 110 && e.birds.some(b => !b.joined && !b.gone)){ e.called = true; called++; }
    if (e.kind === 'whale' && Math.abs(e.z - S.z) < 160) setTimeout(() => AU.sfx('whale'), 500);
  }
  if (S.followers.length) setTimeout(() => AU.sfx('chirp', 1), 180);
  if (called) popup('おーい！', 'cyan');
}
function scatterBirds(frac){
  const n = Math.ceil(S.followers.length * frac);
  for (let i = 0; i < n; i++){ const b = S.followers.pop(); if (!b) break; b.gone = true; b.joined = false; b.vx = (Math.random() - .5) * 20; b.vy = 6 + Math.random() * 8; b.vz = (Math.random() - .5) * 20; b.goneT = 3; }
}
let birdT = 0;
const birdQ = new THREE.Quaternion(), birdE = new THREE.Euler();
function updateBirds(dt){
  const sys = W.birds; let n = 0; birdT += dt;
  const fq = birdQ.setFromEuler(birdE.set(-S.pitch, S.yaw, 0, 'YXZ'));
  // followers fly in a V behind you
  S.followers.forEach((b, i) => {
    const row = Math.floor(i / 2) + 1, side = i % 2 ? 1 : -1;
    tmpV.set(side * row * 1.8, .4 + Math.sin(birdT * 1.5 + i) * .3, -row * 2.2 - 1.5).applyQuaternion(fq).add(tmpV2.set(S.x, S.y, S.z));
    const k = 1 - Math.exp(-(3 + (i % 3)) * dt);
    b.x = lerp(b.x, tmpV.x, k); b.y = lerp(b.y, tmpV.y, k); b.z = lerp(b.z, tmpV.z, k);
    if (n < sys.max) sys.set(n++, b.x, b.y, b.z, S.yaw, S.pitch * .6, S.bank * .6, Math.sin(birdT * 9 + i * 1.7) * .7, 1, 0xffffff);
  });
  for (const e of W.active){
    if (e.kind !== 'flock' || !e.birds) continue;
    e.birds.forEach((b, i) => {
      if (b.joined) return;
      if (b.gone){ b.goneT -= dt; if (b.goneT <= 0) return; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; if (n < sys.max) sys.set(n++, b.x, b.y, b.z, Math.atan2(b.vx, b.vz), .4, 0, Math.sin(birdT * 14 + i) * .9, 1, e.color); return; }
      if (e.perch && !e.flew){ b.x = e.x + b.ox * .4; b.y = W.yRoad(e.z + b.oz) + .3 + 1.05; b.z = e.z + b.oz; if (n < sys.max) sys.set(n++, b.x, b.y, b.z, Math.PI * .5 + i, 0, 0, -.2, .9, e.color); return; }
      // circle lazily around the flock centre
      const a = birdT * .6 + b.ph, r = 6 + b.ox * .3;
      b.x = e.x + Math.cos(a) * r; b.z = e.z + Math.sin(a) * r; b.y = e.y + b.oy + Math.sin(birdT + b.ph) * 1.2;
      if (n < sys.max) sys.set(n++, b.x, b.y, b.z, a + Math.PI, 0, .35, Math.sin(birdT * 8 + b.ph) * .8, 1, e.color);
    });
  }
  sys.commit(n);
}

/* ---------- crash / respawn / goal ---------- */
function crash(text, kind, ent){
  if (S.phase !== 'air') return;
  S.phase = 'crash'; S.crashT = 1.5; S.crashKind = kind; S.slow = settings.motion ? 0 : .5; S.shake = 1; S.combo = 0; S.comboT = 0;
  if (kind === 'splash'){ FX.splash(S.x, W.SEA_Y, S.z, vel.x, vel.z, true); AU.sfx('splash'); }
  else { FX.crashPoof(S.x, S.y, S.z); FX.feathers(S.x, S.y, S.z); AU.sfx('crash'); }
  vibrate([40, 30, 60]);
  scatterBirds(.5);
  if (S.free < 0) S.hearts--;
  toast(text, S.free >= 0 ? '' : S.hearts > 0 ? 'のこり ' + '♥'.repeat(S.hearts) : 'もう羽がない…', 1.6, 'warn');
  if (ent && ent.kind === 'whale') once('whaleHit', () => {});
}
function crashStep(dt){
  S.crashT -= dt;
  S.v = damp(S.v, 4, 2, dt);
  S.spin = (S.spin || 0) + dt * 6;
  if (S.crashKind !== 'splash'){ S.y -= dt * 6; } else S.y = damp(S.y, W.SEA_Y - 1, 3, dt);
  S.z += S.v * dt * .4;
  if (S.crashT <= 0){
    S.spin = 0;
    if (S.free < 0 && S.hearts <= 0) return endRun(false);
    respawn();
  }
}
function respawn(){
  const B = W.bandAt(S.lastSafe.x, S.lastSafe.z);
  S.x = clamp(S.lastSafe.x, -60, 60); S.z = Math.max(S.lastSafe.z, S.z - 30);
  S.y = clamp(S.lastSafe.y, B.floor + 18, B.ceil - 15);
  // make sure we come back somewhere clear
  for (let k = 0; k < 30 && W.probe(S.x, S.y, S.z, 6).d < 6; k++){ S.y += 4; if (S.y > B.ceil - 5){ S.y = B.floor + 20; S.z += 15; } }
  S.yaw = 0; S.pitch = 0; S.bank = 0; S.v = 20; S.phase = 'air'; S.invuln = 2.6; S.tail = 0;
  AU.sfx('respawn'); FX.sparkle(S.x, S.y, S.z, FX.C.white, 30, 2);
  hint(S.free >= 0 ? 'もう一度！' : 'だいじょうぶ、もう一度！', 1.6);
}
function reachGoal(){
  S.phase = 'goal'; S.goalT = 0; $('hud').classList.add('cine'); $('touch').hidden = true; releaseAll();
  const g = Math.hypot(S.x, S.y - W.GATE_Y) < 18;
  S.gatePassed = g;
  S.slow = settings.motion ? 0 : 2.6; S.cheer = 1;
  AU.sfx('moon'); AU.setMode('finale'); flash(.45, true); vibrate([30, 60, 30, 60, 90]);
  if (g) addScore(5000, '月の門', 'gold');
  addScore(1000 * S.hearts, '残り羽', 'gold');
  toast(g ? '月の門をくぐった！' : '月にとどいた！', 'ゴール　' + fmtTime(S.time), 3.2, 'big');
  progress.cleared = true; progress.reached = 4; save('sp_progress', progress);
}
function goalStep(dt){
  S.goalT += dt;
  // glide on toward the moon, slowly rising, wings wide
  S.pitch = damp(S.pitch, .12, 1, dt); S.bank = damp(S.bank, 0, 2, dt); S.yaw = damp(S.yaw, 0, 1, dt);
  S.v = damp(S.v, 18, 1, dt);
  S.x += Math.sin(S.yaw) * S.v * dt; S.z += S.v * dt; S.y += Math.sin(S.pitch) * S.v * dt;
  S.cadence = .8; S.coasting = false;
  if (S.goalT > .9 && !S.photo) S.wantPhoto = true;
  if (S.goalT > 1.4 && S.goalT - dt <= 1.4){ for (let i = 0; i < 6; i++) setTimeout(() => { if (S.mode !== 'play') return; FX.firework(S.x + (Math.random() - .5) * 120, S.y + 30 + Math.random() * 60, S.z + 80 + Math.random() * 80, Math.random()); AU.sfx('firework'); }, i * 380); }
  if (S.goalT > 6) endRun(true);
}
function endRun(victory){
  if (S.mode !== 'play') return;
  if (!S.photo) S.wantPhoto = true;
  S.phase = 'end'; S.victory = victory;
  setTimeout(() => showResult(victory), victory ? 200 : 900);
}

/* ---------- result + share ---------- */
function fmtTime(t){ const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }
function rankOf(){
  const k = S.score / (S.victory ? 1 : 1.6);
  return k > 60000 ? 'S' : k > 38000 ? 'A' : k > 20000 ? 'B' : 'C';
}
function showResult(victory){
  S.mode = 'result'; showScreen('result'); $('hud').hidden = true; $('touch').hidden = true; releaseAll();
  AU.setMode(victory ? 'finale' : 'title');
  const free = S.free >= 0;
  const left = Math.max(0, Math.round(W.GOAL_Z - S.z));
  const rank = free ? '—' : rankOf();
  $('grade').textContent = rank; $('grade').dataset.r = rank;
  $('resEyebrow').textContent = free ? 'SKY WALK' : victory ? 'JOURNEY COMPLETE' : 'LANDED';
  $('resTitle').textContent = free ? 'いい散歩だった！' : victory ? '月まで、とどいた！' : `あと ${left.toLocaleString()} m で 月だった！`;
  const newBest = !free && S.score > progress.best;
  if (!free){ if (newBest) progress.best = S.score; if (victory && (!progress.bestTime || S.time < progress.bestTime)) progress.bestTime = S.time; save('sp_progress', progress); }
  const zoneStars = ZONES.map((Z, k) => k ? `<span title="${Z.name}">${Z.icon}${progress.stars[k].map(b => b ? '★' : '☆').join('')}</span>` : '').join('');
  const stats = [
    ['スコア', S.score.toLocaleString() + (newBest ? ' <em>NEW!</em>' : '')],
    ['光の輪', `${S.rings} / ${S.ringsSeen}`], ['最大コンボ', '×' + S.maxCombo], ['なかまの鳥', '最大 ' + S.maxFlock + ' 羽'],
    ['最高速度', Math.round(S.maxSpeed * 3.6) + ' km/h'], ['飛行時間', fmtTime(S.time)],
  ];
  if (S.lanterns) stats.push(['ランタン', S.lanterns + ' 個']);
  if (S.nearMiss) stats.push(['ニアミス', S.nearMiss + ' 回']);
  $('resStats').innerHTML = stats.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  $('resStars').innerHTML = zoneStars;
  $('debrief').innerHTML = debrief(victory, left);
  $('retryBtn').hidden = free || victory || W.zoneAt(S.z) === 0;
  if (!$('retryBtn').hidden){ const k = W.zoneAt(S.z); $('retryBtn').dataset.k = k; $('retryBtn').querySelector('span').textContent = ZONES[k].name + 'から再挑戦'; }
  $('nextBtn').querySelector('span').textContent = free ? 'もう少し飛ぶ' : 'もう一度とぶ';
  renderPhoto(rank);
  renderWorldPicker();
  setTimeout(() => $('nextBtn').focus({ preventScroll: true }), 60);
}
function debrief(victory, left){
  if (S.free >= 0) return 'そらさんぽは、点数を気にせず景色を楽しむモード。ジャーニーで月を目指そう。';
  if (victory) return S.gatePassed ? '光の門をくぐって、月の前を自転車で横切った。<br>写真をシェアして、誰かにもこの空を見せてあげよう。' : '月にとどいた！ 次は<b>光の門の真ん中</b>をくぐってみよう。';
  const tips = [];
  if (S.zone <= 1) tips.push('手をはなすと水平にもどる。<b>こぐ</b>のは上るときだけでOK');
  if (S.zone === 2) tips.push('浮島の<b>下</b>は細くなっている。橋の下をくぐると近道');
  if (S.zone === 3) tips.push('海面に近づくと危ない。<b>上へなぞる</b>か、こいで高度を保とう');
  if (S.zone === 4) tips.push('<b>こぐ＋上へ</b>で上昇。上昇気流がない分、元気ゲージを大切に');
  return `あと <b>${left.toLocaleString()} m</b>。${tips[0] || 'あと少し！'}`;
}
let shareBlob = null;
function renderPhoto(rank){
  const cv = $('photo'), x = cv.getContext('2d'), Wd = cv.width = 1080, Ht = cv.height = 1350;
  const draw = img => {
    x.fillStyle = '#0a0f24'; x.fillRect(0, 0, Wd, Ht);
    if (img){ const s = Math.max(Wd / img.width, (Ht - 260) / img.height); const w = img.width * s, h = img.height * s; x.drawImage(img, (Wd - w) / 2, (Ht - 260 - h) / 2, w, h); }
    const g = x.createLinearGradient(0, Ht - 420, 0, Ht); g.addColorStop(0, 'rgba(10,15,36,0)'); g.addColorStop(.45, 'rgba(10,15,36,.92)'); g.addColorStop(1, '#0a0f24'); x.fillStyle = g; x.fillRect(0, Ht - 420, Wd, 420);
    x.fillStyle = '#fff'; x.textAlign = 'left';
    x.font = '900 64px "Zen Kaku Gothic New","Hiragino Sans",sans-serif'; x.fillText(S.victory ? '月まで、とどいた！' : (S.free >= 0 ? 'そらさんぽ' : '空とぶ自転車で…'), 60, Ht - 170);
    x.font = '700 38px "Zen Kaku Gothic New","Hiragino Sans",sans-serif'; x.fillStyle = '#cfe6ff';
    x.fillText(`SCORE ${S.score.toLocaleString()}　なかま ${S.maxFlock}羽　${fmtTime(S.time)}`, 60, Ht - 105);
    x.font = '800 30px Orbitron,"Arial Black",sans-serif'; x.fillStyle = '#ffd36a'; x.fillText('SKY PEDAL · 空とぶ自転車', 60, Ht - 50);
    if (rank !== '—'){ x.textAlign = 'right'; x.font = '900 150px Orbitron,"Arial Black",sans-serif'; x.fillStyle = '#ffd36a'; x.fillText(rank, Wd - 60, Ht - 60); }
    cv.toBlob(b => { shareBlob = b; }, 'image/jpeg', .88);
  };
  if (S.photo){ const img = new Image(); img.onload = () => draw(img); img.onerror = () => draw(null); img.src = S.photo; } else draw(null);
}
async function sharePhoto(){
  AU.sfx('click');
  const text = S.victory ? `空とぶ自転車で、月までとどいた！ SCORE ${S.score.toLocaleString()} #SkyPedal` : `空とぶ自転車で飛んだ！ SCORE ${S.score.toLocaleString()} #SkyPedal`;
  try {
    if (shareBlob && navigator.canShare){
      const file = new File([shareBlob], 'sky-pedal.jpg', { type: 'image/jpeg' });
      if (navigator.canShare({ files: [file] })){ await navigator.share({ files: [file], text, title: 'Sky Pedal' }); return; }
    }
    if (navigator.share){ await navigator.share({ text, url: location.href, title: 'Sky Pedal' }); return; }
  } catch(e){ if (e && e.name === 'AbortError') return; }
  // fallback: save the picture
  if (shareBlob){ const a = document.createElement('a'); a.href = URL.createObjectURL(shareBlob); a.download = 'sky-pedal.jpg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); hint('写真を保存しました', 2); }
}

/* ---------- bike pose, wings, scarf ---------- */
const tq = new THREE.Quaternion(), te = new THREE.Euler();
function placeBike(dt){
  const U = bike.userData;
  bike.position.set(S.x, S.y, S.z);
  let pitchV = -S.pitch, roll = S.bank, yaw = S.yaw;
  if (S.phase === 'crash'){ roll += (S.spin || 0); pitchV += Math.sin((S.spin || 0) * .7) * .5; }
  bike.rotation.set(pitchV, yaw, roll, 'YXZ');
  // little bob while pedalling in the air
  U.inner.position.y = S.phase === 'air' ? Math.sin(S.time * 2.2) * .06 : 0;
  // wheels and crank
  const wr = S.v / U.R * (dt || 0);
  U.rearW.rotation.x += wr; U.frontW.rotation.x += wr;
  S.crank += S.cadence * Math.PI * 2 * (dt || 0);
  S.cheer = Math.max(0, S.cheer - (dt || 0) * .5);
  Md.poseRider(bike, S.crank, S.sprinting ? 1 : S.phase === 'air' ? .4 : .2, clamp(S.bank * .8, -1, 1), Math.min(1, S.cheer * 1.6));
  // wings: folded on the road, unfold at take-off, flap when sprinting, spread wide in a glide
  const open = S.wingOpen, flapA = S.sprinting ? Math.sin(S.time * 9) * .45 : S.coasting ? -.05 : Math.sin(S.time * 2) * .06;
  U.wings.forEach((w, i) => {
    const s = i ? 1 : -1;
    w.rotation.y = s * (1 - open) * 1.25;
    w.rotation.z = s * (open * (.42 + flapA) - (1 - open) * .2);
    w.scale.setScalar(.35 + open * 1.05);
  });
  // invulnerable blink
  bike.visible = !(S.invuln > 0 && S.mode === 'play' && Math.floor(S.time * 12) % 2 === 0);
  updateScarf(dt || 0);
}
const neck = new THREE.Vector3(), segV = new THREE.Vector3(), rightW = new THREE.Vector3(), backW = new THREE.Vector3();
function updateScarf(dt){
  const sc = scarf, P = sc.pts, U = bike.userData;
  neck.set(0, U.shoulder.y + .06, U.shoulder.z - .04); bike.localToWorld(neck);
  backW.set(0, .15, -1).applyQuaternion(bike.quaternion).normalize();
  rightW.set(1, 0, 0).applyQuaternion(bike.quaternion);
  if (!sc.init){ for (let i = 0; i < sc.N; i++) P[i].copy(neck).addScaledVector(backW, i * .1); sc.init = true; }
  P[0].copy(neck);
  const sp = clamp(S.v / 30, .2, 1.4), seg = .1, t = S.time;
  for (let i = 1; i < sc.N; i++){
    // target: trailing back in the wind, fluttering more toward the tail
    const f = i / sc.N;
    tmpV.copy(P[i - 1]).addScaledVector(backW, seg);
    tmpV.y += Math.sin(t * 13 * sp + i * .9) * .05 * f * sp - (1 - sp) * .03 * i;
    tmpV.addScaledVector(rightW, Math.sin(t * 9 + i * .7) * .04 * f);
    P[i].lerp(tmpV, 1 - Math.exp(-28 * Math.max(dt, .001)));
    segV.subVectors(P[i], P[i - 1]); const l = segV.length(); if (l > 0) P[i].copy(P[i - 1]).addScaledVector(segV, seg / l);
  }
  const pos = sc.mesh.geometry.attributes.position, wdt = .07;
  for (let i = 0; i < sc.N; i++){
    const w = wdt * (1 - i / sc.N * .4);
    pos.setXYZ(i * 2, P[i].x - rightW.x * w, P[i].y - rightW.y * w, P[i].z - rightW.z * w);
    pos.setXYZ(i * 2 + 1, P[i].x + rightW.x * w, P[i].y + rightW.y * w, P[i].z + rightW.z * w);
  }
  pos.needsUpdate = true; sc.mesh.geometry.computeVertexNormals();
}

/* ---------- camera: chase, take-off side shot, the moon shot, title orbit ---------- */
const lookT = new THREE.Vector3(), moonCam = new THREE.Vector3();
function camFollow(dt){
  const sp = S.v;
  const fq = tq.setFromEuler(te.set(-S.pitch * .55, S.yaw, 0, 'YXZ'));
  fwd.set(0, 0, 1).applyQuaternion(fq); right.set(1, 0, 0).applyQuaternion(fq); up.set(0, 1, 0).applyQuaternion(fq);
  const dist = (S.phase === 'ground' ? 4.8 : 5.0) + sp * .05, hgt = S.phase === 'ground' ? 1.9 : 1.6;
  tmpV.set(S.x, S.y, S.z).addScaledVector(fwd, -dist).addScaledVector(up, hgt);
  lookT.set(S.x, S.y + 1.1, S.z).addScaledVector(fwd, 8);
  let k = 5;
  if (S.sideCam > 0){
    // take-off: crane up behind and above to reveal the whole sea of clouds as the wings open
    const w = smooth(0, .7, S.sideCam) * smooth(2.4, 2.0, S.sideCam);
    tmpV.lerp(tmpV2.set(S.x - 3.2, S.y + 4.2, S.z - 6.5), w); lookT.lerp(tmpV2.set(S.x + .6, S.y - 3, S.z + 26), w); k = 3;
  }
  if (S.phase === 'crash'){ tmpV.copy(camPos); lookT.set(S.x, S.y, S.z); k = 2; }
  if (S.phase === 'goal' || (S.phase === 'end' && S.victory)){
    // the moon shot: sit right behind the bike on the line to the moon, so its silhouette crosses the moon's face
    const g = smooth(0, 1.1, S.goalT);
    tmpV2.set(W.MOON.x || 0, W.MOON.y, W.MOON.z).sub(tmpV.set(S.x, S.y, S.z)).normalize();
    moonCam.set(S.x + .7, S.y + .6, S.z).addScaledVector(tmpV2, -8.5);
    tmpV.lerp(moonCam, g);
    lookT.lerp(tmpV2.set(0, W.MOON.y, W.MOON.z), g); k = 2.6;
  }
  // keep the camera out of the sea / ground
  const B = W.bandAt(tmpV.x, tmpV.z);
  if (B.kind !== 'cloud') tmpV.y = Math.max(tmpV.y, B.floor + 1.2);
  camPos.x = damp(camPos.x, tmpV.x, k, dt); camPos.y = damp(camPos.y, tmpV.y, k * 1.2, dt); camPos.z = damp(camPos.z, tmpV.z, k * 1.6, dt);
  camLook.x = damp(camLook.x, lookT.x, k * 1.6, dt); camLook.y = damp(camLook.y, lookT.y, k * 1.6, dt); camLook.z = damp(camLook.z, lookT.z, k * 2, dt);
  camera.position.copy(camPos);
  if (S.shake > 0 && !settings.motion){ camera.position.x += (Math.random() - .5) * S.shake * .5; camera.position.y += (Math.random() - .5) * S.shake * .5; S.shake = Math.max(0, S.shake - dt * 2); }
  // roll with the bank (gently)
  const roll = S.phase === 'air' ? S.bank * (settings.motion ? .12 : .32) : 0;
  camUp.set(0, 1, 0).applyAxisAngle(tmpV2.subVectors(camLook, camPos).normalize(), -roll);
  camera.up.copy(camUp);
  camera.lookAt(camLook);
  const fovT = baseFov + (settings.motion ? 0 : clamp((sp - 20) * .45, -2, 12) + (S.sprinting ? 2.5 : 0) + (S.tail > 0 ? 3 : 0));
  camera.fov = damp(camera.fov, fovT, 3, dt); camera.updateProjectionMatrix();
}
function snapCam(){
  fwd.set(Math.sin(S.yaw), 0, Math.cos(S.yaw));
  camPos.set(S.x, S.y + 2.3, S.z).addScaledVector(fwd, -7); camLook.set(S.x, S.y + .9, S.z).addScaledVector(fwd, 9);
  camera.position.copy(camPos); camera.lookAt(camLook);
}
// title: a slow orbit around the bike on the hilltop, at dawn; dragging turns it and leans the bike
let titleDrag = null;
function titleUpdate(dt){
  S.titleT += dt;
  S.time += dt;
  const bx = 0, bz = START_Z, by = W.yRoad(bz);
  S.x = bx; S.z = bz; S.y = by; S.v = 0; S.cadence = 0; S.pitch = W.yRoad(bz + 1) - by; S.yaw = 0;
  if (!titleDrag) S.orbit += dt * .07;
  const portrait = innerWidth < innerHeight, r = portrait ? 6.6 : 4.8, a = S.orbit;
  camPos.set(bx + Math.sin(a) * r, by + (portrait ? 2.2 : 1.7), bz + Math.cos(a) * r);
  camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(bx, by + .85, bz);
  // frame the bike above the title card: portrait shifts the image up, landscape shifts it left
  setFraming(portrait ? 0 : .2, portrait ? .22 : -.1);
  camera.fov = damp(camera.fov, baseFov - 6, 2, dt); camera.updateProjectionMatrix();
  S.bank = damp(S.bank, titleDrag ? clamp(titleDrag.dx / 200, -.35, .35) : 0, 4, dt);
  S.wingOpen = damp(S.wingOpen, titleDrag ? .6 : .15, 2, dt);
}

let frameX = 0, frameY = 0;
function setFraming(fx, fy){
  if (fx === frameX && fy === frameY) return; frameX = fx; frameY = fy;
  if (!fx && !fy) camera.clearViewOffset(); else camera.setViewOffset(innerWidth, innerHeight, innerWidth * fx, innerHeight * fy, innerWidth, innerHeight);
}
/* ---------- HUD ---------- */
let hudT = 0;
const hudCache = {};
function setText(id, v, html){ if (hudCache[id] === v) return; hudCache[id] = v; const el = $(id); if (html) el.innerHTML = v; else el.textContent = v; }
function hud(dt){
  hudT -= dt; if (hudT > 0) return; hudT = 1 / 15;
  setText('score', S.score.toLocaleString());
  const c = $('combo'); c.classList.toggle('on', S.combo > 1); $('comboX').textContent = '×' + mult().toFixed(1); $('comboBar').style.width = clamp(S.comboT / 4.5, 0, 1) * 100 + '%';
  setText('hearts', S.free >= 0 ? '' : Array.from({ length: S.assist.hearts }, (_, i) => `<i class="${i < S.hearts ? '' : 'off'}">♥</i>`).join(''), true);
  setText('flock', S.followers.length ? '🕊 ×' + S.followers.length : '');
  setText('starsRun', S.starsRun.length ? '★ ' + S.starsRun.length : '');
  const B = W.bandAt(S.x, S.z);
  setText('spd', Math.round(S.v * 3.6)); setText('alt', Math.round(S.y - W.SEA_Y));
  // stamina ring on the pedal button
  const ring = $('stamRing'); ring.style.strokeDashoffset = 100 - S.stamina; $('sprintBtn').classList.toggle('tired', S.tired); $('sprintBtn').classList.toggle('low', S.stamina < 30);
  updateJourneyBar();
  // floor warning (sea / ground below)
  const danger = S.phase === 'air' && B.kind !== 'cloud' && S.y - B.floor < 9 && S.assist.floorGuard < 1;
  $('lowOv').classList.toggle('on', danger);
}
// next-ring arrow at the screen edge when the ring is off-screen
const projV = new THREE.Vector3();
function ringArrow(){
  const el = $('ringArrow');
  if (S.mode !== 'play' || S.phase !== 'air'){ el.style.opacity = 0; return; }
  const r = nextRing();
  if (!r || r.z - S.z > 160){ el.style.opacity = 0; return; }
  projV.set(r.x, r.y, r.z).project(camera);
  const behind = projV.z > 1;
  const onScreen = !behind && Math.abs(projV.x) < .85 && Math.abs(projV.y) < .8;
  if (onScreen){ el.style.opacity = 0; return; }
  let x = projV.x, y = projV.y; if (behind){ x = -x; y = -y; }
  const a = Math.atan2(y, x), m = .82;
  const k = Math.min(m / Math.abs(Math.cos(a) || 1e-3), m / Math.abs(Math.sin(a) || 1e-3));
  const px = (Math.cos(a) * k * .5 + .5) * innerWidth, py = (-Math.sin(a) * k * .5 + .5) * innerHeight;
  el.style.opacity = .9; el.style.transform = `translate(${px}px,${py}px) rotate(${-a}rad)`;
}

/* ---------- audio state ---------- */
let audioClock = 0;
function audioState(){
  const high = S.zone === 4 ? 1 : 0;
  const I = S.phase === 'ground' ? (S.v > 6 ? 1 : .3) : S.phase === 'air' ? clamp(1 + (S.v - 18) / 14 + (S.sprinting ? .6 : 0) + (S.combo >= 4 ? .8 : 0) + (S.tail > 0 ? .6 : 0) + S.zone * .15, 1, 3.4) : 1;
  return { playing: S.mode === 'play', speed: S.v, pedal: S.cadence > 0 && S.mode === 'play', sprint: S.sprinting, cadence: S.cadence, wheel: S.v / 2.1, ground: S.phase === 'ground', dive: S.coasting, high, intensity: I, title: S.mode === 'title' };
}

/* ---------- frame loop ---------- */
let lastT = performance.now(), acc = 0, perfAcc = 0, perfN = 0, perfWarm = 0, titleSkip = 0;
function frame(now){
  requestAnimationFrame(frame);
  let rdt = Math.min(.1, (now - lastT) / 1000); lastT = now;
  if (SP.game.freeze) return;
  // battery: the title screen renders at ~30fps
  if (S.mode === 'title' || S.mode === 'result'){ titleSkip ^= 1; if (titleSkip) return; rdt = Math.min(.1, rdt * 2); }
  if (S.mode === 'paused') return;
  tick(rdt, now);
}
function tick(rdt, now = performance.now()){
  if (S.slow > 0){ S.slow -= rdt; S.timeScale = S.phase === 'goal' ? .35 : .3; } else S.timeScale = damp(S.timeScale, 1, 3, rdt);
  if (S.sideCam > 0) S.sideCam -= rdt;
  const dt = rdt * S.timeScale;
  pollGamepad(); combineInput();
  if (S.mode === 'play' && !SP.game.manual){
    acc += dt; let n = 0;
    while (acc >= 1 / 120 && n < 16){ step(1 / 120); acc -= 1 / 120; n++; }
  } else if (S.mode === 'title') titleUpdate(rdt);
  placeBike(dt);
  if (S.mode === 'play' || S.mode === 'result'){ setFraming(0, 0); camFollow(rdt); }
  W.update(dt, camera.position, S.z, S.time);
  updateBirds(dt);
  W.envAt(S.mode === 'title' ? 0 : S.z);
  const inside = W.followCam(camera.position, S.time);
  // effects
  fwd.set(Math.sin(S.yaw) * Math.cos(S.pitch), Math.sin(S.pitch), Math.cos(S.yaw) * Math.cos(S.pitch));
  FX.update(dt, camera.position, S.mode === 'play' ? S.v : 0, fwd, S.time);
  if (S.mode === 'play' && S.phase === 'air' && S.v > 22){
    const U = bike.userData;
    U.wings.forEach((w, i) => { tmpV.set((i ? 1 : -1) * 1.15, .1, -.2); w.localToWorld(tmpV); FX.wingTrail(tmpV.x, tmpV.y, tmpV.z, vel.x, vel.y, vel.z, S.tail > 0); });
  }
  const B = W.bandAt(S.x, S.z);
  FX.setShadow(S.x, B.floor, S.z, S.y - B.floor, S.mode !== 'result' && B.kind !== 'cloud' || (B.kind === 'cloud' && S.y - B.floor < 40), B.kind === 'ground' ? Math.atan2(W.hillH(S.x, S.z + 1) - B.floor, 1) : 0);
  // cloud white-out (soft clouds + the cloud floor)
  S.whiteout = damp(S.whiteout, Math.max(S.softIn && S.mode === 'play' ? .65 : 0, inside * .5), 6, rdt);
  $('whiteOv').style.opacity = S.whiteout;
  AU.setMuffle(Math.max(S.whiteout * .8, 0));
  if (toastT > 0){ toastT -= rdt; if (toastT <= 0) $('toast').classList.remove('on'); }
  if (hintT > 0){ hintT -= rdt; if (hintT <= 0) $('hint').classList.remove('on'); }
  if (bannerT > 0){ bannerT -= rdt; if (bannerT <= 0) $('banner').classList.remove('on'); }
  if (S.mode === 'play'){ hud(rdt); ringArrow(); }
  audioClock -= rdt; if (audioClock <= 0){ audioClock = 1 / 30; AU.update(audioState()); }
  // post
  const U = finalPass.uniforms;
  U.time.value = now * .001; U.exposure.value = renderer.toneMappingExposure;
  const spd = S.mode === 'play' && S.phase === 'air' ? S.v : 0;
  U.blur.value = settings.motion ? 0 : damp(U.blur.value, clamp((spd - 30) / 30, 0, .6) + (S.tail > 0 ? .4 : 0), 4, rdt);
  U.aberr.value = damp(U.aberr.value, settings.motion ? 0 : (S.phase === 'crash' ? 1.6 : 0) + (S.tail > 0 ? .5 : 0), 5, rdt);
  U.sat.value = damp(U.sat.value, S.phase === 'crash' ? .5 : S.phase === 'goal' ? 1.25 : 1.1, 3, rdt);
  U.warm.value = W.env.zone === 3 || W.env.zone === 0 ? .6 : 0;
  const night = W.env.zone === 4 ? 1 : 0; bloom.strength = .3 + night * .5; bloom.threshold = 1.15 - night * .4;
  renderer.info.reset(); composer.render(rdt);
  // the souvenir photo: grab the frame we just drew
  if (S.wantPhoto){ S.wantPhoto = false; try { S.photo = renderer.domElement.toDataURL('image/jpeg', .86); AU.sfx('shutter'); } catch(e){ S.photo = null; } }
  // adaptive quality
  if (S.mode === 'play' && settings.quality === 'auto'){
    perfWarm += rdt; if (perfWarm > 3){ perfAcc += rdt; perfN++; if (perfN >= 120){ const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
      if (avg > 1 / 40 && qualityKey !== 'low'){ qualityKey = qualityKey === 'high' ? 'mid' : 'low'; applyQuality(); hint('なめらかさ優先で<b>画質を自動調整</b>しました', 2.2); perfWarm = 0; } } }
  }
}

/* ---------- input ---------- */
const KEY = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', Space: 'P', ShiftLeft: 'P', ShiftRight: 'P' };
const keys = {};
addEventListener('keydown', e => {
  if (KEY[e.code] && S.mode === 'play'){ keys[KEY[e.code]] = true; e.preventDefault(); }
  if (S.mode === 'title' && KEY[e.code] && e.code !== 'Space') { titleDrag = null; }
  if (!e.repeat && (e.code === 'KeyB' || e.code === 'Enter') && S.mode === 'play'){ input.bell = true; e.preventDefault(); }
  if (!e.repeat && (e.code === 'KeyP' || e.code === 'Escape') && (S.mode === 'play' || S.mode === 'paused')) togglePause();
  if ((e.code === 'Enter' || e.code === 'Space') && S.mode === 'title' && (document.activeElement === document.body || !document.activeElement)){ e.preventDefault(); $('startBtn').click(); }
  if (e.code === 'KeyM' && !e.repeat) $('muteBtn').click();
});
addEventListener('keyup', e => { if (KEY[e.code]) keys[KEY[e.code]] = false; });
addEventListener('blur', () => { releaseAll(); if (S.mode === 'play') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'play') togglePause(); });
function releaseAll(){ for (const k in keys) keys[k] = false; input.tx = input.ty = 0; input.tS = false; touches.clear(); $('stick').hidden = true; document.querySelectorAll('.tbtn.down').forEach(b => b.classList.remove('down')); }

let padPrev = {};
function pollGamepad(){
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  input.px = input.py = 0; input.pS = false;
  for (const p of pads){
    if (!p) continue;
    let ax = p.axes[0] || 0, ay = p.axes[1] || 0; if (Math.abs(ax) < .15) ax = 0; if (Math.abs(ay) < .15) ay = 0;
    const b = i => p.buttons[i] && p.buttons[i].pressed;
    if (b(14)) ax = -1; if (b(15)) ax = 1; if (b(12)) ay = -1; if (b(13)) ay = 1;
    input.px = ax; input.py = -ay; input.pS = b(0) || b(7) || b(5);
    const edge = i => b(i) && !padPrev[i];
    if (edge(2) || edge(3)) input.bell = true;
    if (edge(9)){ if (S.mode === 'play' || S.mode === 'paused') togglePause(); else if (S.mode === 'title') $('startBtn').click(); else if (S.mode === 'result') $('nextBtn').click(); }
    if (S.mode === 'title' && edge(0)) $('startBtn').click();
    padPrev = {}; p.buttons.forEach((bb, i) => padPrev[i] = bb.pressed);
    break;
  }
}
const expo = v => Math.sign(v) * Math.pow(Math.abs(v), 1.35);
function combineInput(){
  input.kx = (keys.R ? 1 : 0) - (keys.L ? 1 : 0); input.ky = (keys.U ? 1 : 0) - (keys.D ? 1 : 0);
  const inv = settings.invert ? -1 : 1;
  input.sx = clamp(input.kx + expo(input.tx) + input.px + input.gx, -1, 1);
  input.sy = clamp((input.ky + expo(input.ty) + input.py + input.gy) * inv, -1, 1);
  input.sprint = !!(keys.P || input.tS || input.pS);
  input.active = touches.size > 0 || input.kx !== 0 || input.ky !== 0 || keys.P || Math.abs(input.px) + Math.abs(input.py) > 0;
  if (input.sprint || input.active) S.idleT = 0;
}

/* touch: a floating stick wherever your thumb lands (except on the buttons) */
const touches = new Map();
const touchEl = $('touch'), stick = $('stick'), knob = $('knob');
const STICK_R = 56;
touchEl.addEventListener('pointerdown', e => {
  if (S.mode !== 'play') return;
  e.preventDefault(); AU.init();
  const kind = e.target.closest('#sprintBtn') ? 'sprint' : e.target.closest('#bellBtn') ? 'bell' : 'stick';
  if (kind === 'stick' && [...touches.values()].some(t => t.kind === 'stick')) return;
  touches.set(e.pointerId, { kind, x0: e.clientX, y0: e.clientY });
  try { touchEl.setPointerCapture(e.pointerId); } catch(_){}
  if (kind === 'stick'){ stick.hidden = false; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; knob.style.transform = 'translate(0,0)'; touchEl.classList.add('used'); }
  else if (kind === 'sprint'){ input.tS = true; $('sprintBtn').classList.add('down'); }
  else { input.bell = true; $('bellBtn').classList.add('down'); vibrate(8); }
}, { passive: false });
touchEl.addEventListener('pointermove', e => {
  const t = touches.get(e.pointerId); if (!t || t.kind !== 'stick') return;
  let dx = e.clientX - t.x0, dy = e.clientY - t.y0; const l = Math.hypot(dx, dy);
  if (l > STICK_R){ const k = (l - STICK_R) / l; t.x0 += dx * k; t.y0 += dy * k; stick.style.left = t.x0 + 'px'; stick.style.top = t.y0 + 'px'; dx = e.clientX - t.x0; dy = e.clientY - t.y0; }
  input.tx = clamp(dx / STICK_R, -1, 1); input.ty = clamp(-dy / STICK_R, -1, 1);
  knob.style.transform = `translate(${dx}px,${dy}px)`;
});
function touchEnd(e){
  const t = touches.get(e.pointerId); if (!t) return; touches.delete(e.pointerId);
  if (t.kind === 'stick'){ input.tx = input.ty = 0; stick.hidden = true; }
  else if (t.kind === 'sprint'){ input.tS = [...touches.values()].some(v => v.kind === 'sprint'); if (!input.tS) $('sprintBtn').classList.remove('down'); }
  else $('bellBtn').classList.remove('down');
}
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => touchEl.addEventListener(ev, touchEnd));
touchEl.addEventListener('contextmenu', e => e.preventDefault());
// desktop: mouse drag on the canvas also steers (when the touch layer is hidden)
stage.addEventListener('pointerdown', e => {
  AU.init();
  if (S.mode === 'title'){ titleDrag = { x0: e.clientX, o0: S.orbit, dx: 0 }; try { stage.setPointerCapture(e.pointerId); } catch(_){} AU.setMode('title'); return; }
});
stage.addEventListener('pointermove', e => { if (titleDrag){ titleDrag.dx = e.clientX - titleDrag.x0; S.orbit = titleDrag.o0 - titleDrag.dx * .006; } });
['pointerup', 'pointercancel'].forEach(ev => stage.addEventListener(ev, () => { if (titleDrag && Math.abs(titleDrag.dx) < 4 && S.mode === 'title'){ AU.sfx('bell'); S.cheer = 1; } titleDrag = null; }));

/* tilt steering (optional; iOS asks permission on a tap) */
let tilt0 = null, tiltOn = false;
function onTilt(e){
  if (!settings.tilt || e.beta == null) return;
  const land = Math.abs(window.orientation || (screen.orientation && screen.orientation.angle) || 0) === 90;
  const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  let lr = land ? e.beta * (angle === 90 ? 1 : -1) : e.gamma, fb = land ? e.gamma * (angle === 90 ? -1 : 1) : e.beta;
  if (tilt0 === null) tilt0 = fb;
  input.gx = clamp(lr / 28, -1, 1); input.gy = clamp(-(fb - tilt0) / 22, -1, 1);
  if (Math.abs(input.gx) < .06) input.gx = 0; if (Math.abs(input.gy) < .06) input.gy = 0;
}
function calibrateTilt(){ tilt0 = null; }
async function enableTilt(on){
  settings.tilt = on; save('sp_settings', settings); input.gx = input.gy = 0;
  if (!on) return;
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
      const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted'){ settings.tilt = false; $('tiltChk').checked = false; save('sp_settings', settings); hint('傾きセンサーが許可されませんでした', 2.5); return; }
    }
    if (!tiltOn){ addEventListener('deviceorientation', onTilt); tiltOn = true; }
    calibrateTilt();
  } catch(e){ settings.tilt = false; $('tiltChk').checked = false; }
}

/* ---------- buttons / settings ---------- */
$('startBtn').addEventListener('click', () => { AU.init(); AU.sfx('select'); if (titleMode === 'free') startRun({ free: S.freePick || 1 }); else startRun({ zone: S.startZone }); });
$('nextBtn').addEventListener('click', () => { AU.init(); AU.sfx('select'); if (S.free >= 0) startRun({ free: S.free }); else startRun({ zone: S.startZone }); });
$('retryBtn').addEventListener('click', () => { AU.init(); AU.sfx('select'); const k = +$('retryBtn').dataset.k || 0; S.startZone = k; startRun({ zone: k }); });
$('shareBtn').addEventListener('click', sharePhoto);
$('homeBtn').addEventListener('click', () => { AU.sfx('click'); goTitle(); });
$('quitBtn').addEventListener('click', () => { AU.sfx('click'); if (S.free >= 0 && S.mode === 'paused'){ S.mode = 'play'; showScreen(null); endRun(false); return; } goTitle(); });
$('restartBtn').addEventListener('click', () => { AU.sfx('click'); if (S.free >= 0) startRun({ free: S.free }); else startRun({ zone: S.startZone }); });
$('resumeBtn').addEventListener('click', togglePause);
$('pauseBtn').addEventListener('click', togglePause);
$('muteBtn').addEventListener('click', () => { AU.init(); AU.setMute(!AU.muted); settings.muted = AU.muted; save('sp_settings', settings); syncMute(); });
$('titleMute').addEventListener('click', () => { AU.init(); AU.setMute(!AU.muted); settings.muted = AU.muted; save('sp_settings', settings); syncMute(); if (!AU.muted) AU.setMode('title'); });
function syncMute(){ document.querySelectorAll('.mutebtn').forEach(b => { b.classList.toggle('off', AU.muted); b.setAttribute('aria-pressed', String(AU.muted)); }); $('muteChk').checked = AU.muted; }
$('musicVol').addEventListener('input', e => { settings.music = e.target.value / 100; AU.setMusicVol(settings.music); save('sp_settings', settings); });
$('sfxVol').addEventListener('input', e => { settings.sfx = e.target.value / 100; AU.setSfxVol(settings.sfx); save('sp_settings', settings); });
$('muteChk').addEventListener('change', e => { AU.init(); AU.setMute(e.target.checked); settings.muted = e.target.checked; save('sp_settings', settings); syncMute(); });
$('invertChk').addEventListener('change', e => { settings.invert = e.target.checked; save('sp_settings', settings); });
$('motionChk').addEventListener('change', e => { settings.motion = e.target.checked; save('sp_settings', settings); });
$('tiltChk').addEventListener('change', e => enableTilt(e.target.checked));
segGroup('qualSeg', v => { settings.quality = v; save('sp_settings', settings); qualityKey = v === 'auto' ? (isTouch() ? 'mid' : 'high') : v; applyQuality(); }, settings.quality);
segGroup('assistSeg2', v => { settings.assist = v; save('sp_settings', settings); S.assist = ASSIST[v]; }, settings.assist);
function syncSettingsUI(){
  $('musicVol').value = Math.round(settings.music * 100); $('sfxVol').value = Math.round(settings.sfx * 100);
  $('invertChk').checked = settings.invert; $('motionChk').checked = settings.motion; $('tiltChk').checked = settings.tilt;
  AU.setMusicVol(settings.music); AU.setSfxVol(settings.sfx); AU.setMute(settings.muted); syncMute();
}
function togglePause(){
  if (S.mode === 'play'){ releaseAll(); S.mode = 'paused'; showScreen('pause'); AU.setMode('pause'); $('quitBtn').textContent = S.free >= 0 ? 'さんぽをおわる' : 'タイトルへ戻る'; setTimeout(() => $('resumeBtn').focus({ preventScroll: true }), 50); }
  else if (S.mode === 'paused'){ S.mode = 'play'; showScreen(null); AU.setMode(S.phase === 'goal' ? 'finale' : 'play'); lastT = performance.now(); }
}
$('settingsBtn').addEventListener('click', () => { AU.init(); AU.sfx('click'); S.mode = 'paused-title'; showScreen('pause'); $('resumeBtn').querySelector('span').textContent = 'もどる'; $('restartBtn').hidden = true; $('quitBtn').hidden = true; });
$('resumeBtn').addEventListener('click', () => { if (S.mode === 'paused-title'){ S.mode = 'title'; showScreen('title'); $('resumeBtn').querySelector('span').textContent = 'つづける'; $('restartBtn').hidden = false; $('quitBtn').hidden = false; } });
const unlockAudio = () => { AU.init(); if (S.mode === 'title') AU.setMode('title'); };
addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('keydown', unlockAudio, { once: true });
if (settings.tilt) addEventListener('pointerdown', () => enableTilt(true), { once: true });

/* debug / test hooks */
SP.game = { S, input, startRun, goTitle, step, tick, freeze: false, manual: false, settings, progress, keys, get bike(){ return bike; }, get camera(){ return camera; }, snapCam, renderOnce: () => composer.render(0), quality: () => qualityKey, get bloom(){ return bloom; }, get finalPass(){ return finalPass; } };

resize();
boot();
if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
