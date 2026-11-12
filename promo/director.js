/* ============================================================
 * Sky Pedal — 30s promo "director" (runs inside the game page)
 * 実際のゲームを決定論的に1フレームずつ進め、ショット・カメラ・テロップを演出する。
 * capture.js が各フレームで PROMO.frame(i) を呼び、スクリーンショットを撮る。
 * ============================================================ */
(() => {
'use strict';
const G = SP.game, S = G.S, W = SP.World, Md = SP.Models, FX = SP.FX, I = G.input;
const FPS = 30, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ease = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const events = [];                       // what happened when: drives the soundtrack
const ev = (name, extra = {}) => events.push(Object.assign({ name, t: +(cur / FPS).toFixed(3) }, extra));
let cur = 0;

/* ---------- overlay: captions, logo, end card ---------- */
// copies of the title logo need their own gradient/filter ids (the originals live in a hidden screen)
const logoSrc = document.querySelector('.logo').outerHTML;
const logoSVG = p => logoSrc.replace(/id="(\w+)"/g, `id="${p}$1"`).replace(/url\(#(\w+)\)/g, `url(#${p}$1)`);
const css = `
  body.p-clean #hud, body.p-clean #touch { display: none !important; }
  #toast, #hint, #banner, #ringArrow, #lowOv, .tlabel { display: none !important; }
  #promo { position: fixed; inset: 0; z-index: 60; pointer-events: none; font-family: "Zen Maru Gothic", sans-serif; color: #fff; }
  #promo .cap { position: absolute; left: 0; right: 0; top: 11.5%; text-align: center; font-weight: 900; letter-spacing: .06em; line-height: 1.25;
    text-shadow: 0 3px 18px rgba(10,20,70,.65), 0 1px 3px rgba(10,20,70,.6); }
  #promo .cap .l1 { display: block; font-size: 40px; }
  #promo .cap .l2 { display: block; font-size: 58px; margin-top: 6px; }
  #promo .name { position: absolute; left: 0; right: 0; bottom: 17%; text-align: center; font-weight: 900; text-shadow: 0 3px 16px rgba(10,20,70,.7); }
  #promo .name .ic { display: block; font-size: 64px; line-height: 1.1; text-shadow: none; }
  #promo .name b { display: block; font-size: 40px; letter-spacing: .06em; }
  #promo .name small { display: block; font-size: 21px; font-weight: 700; margin-top: 4px; opacity: .95; }
  #promo .logo2 { position: absolute; left: 50%; top: 40%; width: 92%; transform: translate(-50%, -50%); filter: drop-shadow(0 6px 24px rgba(10,20,70,.5)); }
  #promo .logo2 svg { width: 100%; height: auto; }
  #promo .end { position: absolute; inset: 0; display: grid; align-content: end; justify-items: center; padding-bottom: 14%;
    background: linear-gradient(180deg, rgba(8,12,40,0) 30%, rgba(8,12,40,.55) 62%, rgba(8,12,40,.88)); text-align: center; }
  #promo .end .lg { width: 90%; margin-bottom: 18px; }
  #promo .end .lg svg { width: 100%; height: auto; }
  #promo .end .k { font-size: 44px; letter-spacing: .25em; margin-bottom: 14px; }
  #promo .end .t1 { font-size: 31px; font-weight: 900; letter-spacing: .04em; }
  #promo .end .t2 { font-size: 22px; font-weight: 700; margin-top: 8px; opacity: .9; }
  #promo .end .url { margin-top: 22px; font: 600 21px/1 Fredoka, sans-serif; letter-spacing: .03em; background: rgba(255,255,255,.95); color: #1d2a52; padding: 12px 22px; border-radius: 999px; }
  #promo .note { position: absolute; left: 14px; bottom: 10px; font-size: 13px; font-weight: 700; opacity: .7; text-shadow: 0 1px 4px rgba(0,0,0,.6); }
  #promo .fade { position: absolute; inset: 0; background: #000; }
  #promo .flash { position: absolute; inset: 0; background: #fff; }
  #promo .finger { position: absolute; font-size: 54px; transform: translate(-30%, -10%); text-shadow: 0 4px 12px rgba(0,0,0,.35); }
`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
const root = document.createElement('div'); root.id = 'promo';
root.innerHTML = `
  <div class="cap" id="pCap"><span class="l1"></span><span class="l2"></span></div>
  <div class="name" id="pName"><span class="ic"></span><b></b><small></small></div>
  <div class="logo2" id="pLogo">${logoSVG('pa')}</div>
  <div class="end" id="pEnd"><div class="lg">${logoSVG('pb')}</div><div class="k">🪽 🚁 🛞 🐕</div><div class="t1">スマホのブラウザで、すぐ遊べる</div><div class="t2">無料 ・ インストール不要</div><div class="url">cuichunxue.github.io/Game-fly-bike</div></div>
  <div class="finger" id="pFinger">👆</div>
  <div class="note" id="pNote">※ 実際のゲーム画面</div>
  <div class="flash" id="pFlash"></div>
  <div class="fade" id="pFade"></div>`;
document.body.appendChild(root);
const $ = id => document.getElementById(id);
// a caption that rises in, holds, and fades out
function cap(t, t0, t1, l1, l2){
  const el = $('pCap');
  if (t < t0 || t > t1) return false;
  const a = ease((t - t0) / .3) * ease((t1 - t) / .3);
  el.querySelector('.l1').textContent = l1; el.querySelector('.l2').textContent = l2;
  el.style.opacity = a; el.style.transform = `translateY(${(1 - ease((t - t0) / .35)) * 26}px) scale(${.96 + .04 * ease((t - t0) / .35)})`;
  return true;
}
function show(el, a, dy = 0, s = 1){ el.style.opacity = a; el.style.transform = (el.id === 'pLogo' ? 'translate(-50%,-50%) ' : '') + `translateY(${dy}px) scale(${s})`; }

/* ---------- helpers ---------- */
const ORIG = { probe: W.probe, bandAt: W.bandAt };
W.probe = () => ({ e: null, d: 99 });          // a clean take: no crashes on camera
function warm(){ for (let i = 0; i < 90; i++) W.update(0, G.camera.position, S.z, S.time); }
function place(x, y, z, v, kit){
  if (kit) Md.setKit(G.bike, kit);
  Object.assign(S, { x, y, z, v, yaw: 0, pitch: 0, bank: 0, phase: 'air', wingOpen: 1, airT: 9, invuln: 0, slow: 0, sideCam: 0, tail: 0, coasting: false });
  S.zone = W.zoneAt(z); S.punch = z > W.DIVE_Z0 + 100;
  G.manual = false; warm(); G.snapCam();
}
// fly toward the next ring (or a given point), like a good player
function bot(target){
  let tgt = target;
  if (!tgt) for (const e of W.active){ if (e.kind === 'ring' && !e.taken && e.z > S.z + 3 && e.z < S.z + 200 && (!tgt || e.z < tgt.z)) tgt = e; }
  const B = W.bandAt(S.x, S.z);
  const tx = tgt ? tgt.x : 0, ty = tgt ? tgt.y : Math.min(B.ceil - 30, Math.max(B.floor + 25, S.y)), tz = tgt ? tgt.z : S.z + 60;
  const dz = Math.max(10, tz - S.z);
  I.tx = clamp(-(Math.atan2(tx - S.x, dz) - S.yaw) * 3, -1, 1);
  I.ty = clamp((Math.atan2(ty - S.y, dz) - S.pitch) * 3, -1, 1);
}
function setStick(on, x, y){
  const s = $('stick'), k = $('knob'), f = $('pFinger');
  s.hidden = !on; f.style.opacity = on ? 1 : 0;
  if (!on) return;
  const dx = I.tx * 40, dy = -I.ty * 40;
  s.style.left = x + 'px'; s.style.top = y + 'px'; k.style.transform = `translate(${dx}px,${dy}px)`;
  f.style.left = (x + dx) + 'px'; f.style.top = (y + dy) + 'px';
}

/* ---------- the shot list (seconds) ---------- */
const SHOTS = [
  { name: 'takeoff', t0: 0,    t1: 6.5 },
  { name: 'clouds',  t0: 6.5,  t1: 10.5 },
  { name: 'garage',  t0: 10.5, t1: 14.5 },
  { name: 'city',    t0: 14.5, t1: 18.5 },
  { name: 'dive',    t0: 18.5, t1: 20.5 },
  { name: 'sea',     t0: 20.5, t1: 22.5 },
  { name: 'moon',    t0: 22.5, t1: 30 },
];
const KITS = ['wing', 'fly', 'hover', 'cargo'];
let shot = null, lastRings = 0, lastNear = 0, wasAir = false, gateT = -1, punched = false;
const camT = new THREE.Vector3();

function setup(name){
  G.camHook = null; document.body.classList.add('p-clean'); setStick(false); W.bandAt = ORIG.bandAt;
  I.tx = I.ty = 0; I.tS = false;
  if (name === 'takeoff'){
    Md.setKit(G.bike, 'wing');
    G.startRun({ zone: 0 });
    G.manual = true; I.tS = true;
    for (let i = 0; i < 6000 && S.z < 404; i++) G.step(1 / 120);
    G.manual = false; warm(); G.snapCam();
  }
  if (name === 'clouds'){
    const r = W.ents.find(e => e.kind === 'ring' && e.idx === 0 && e.n >= 5 && e.z > W.ZONE_Z[1] + 280);
    place(r.x, r.y, r.z - 50, 26, 'wing');
    S.followers = Array.from({ length: 10 }, (_, i) => ({ x: S.x, y: S.y, z: S.z - 4 - i, joined: true }));
    S.score = 4280; S.combo = 6; S.comboT = 4.5; S.maxCombo = 6;
    document.body.classList.remove('p-clean'); $('touch').classList.remove('desk'); $('touch').hidden = false; $('hud').hidden = false;
  }
  if (name === 'city'){
    const b = W.ents.find(e => e.kind === 'bridge' && e.z > W.ZONE_Z[2] + 150);
    place(0, b.y - 12, b.z - 80, 27, 'fly');
  }
  if (name === 'dive'){
    place(0, 34, W.DIVE_Z0 - 210, 40, 'hover');
    S.pitch = -.5; S.punch = false; punched = false;
    // let the bike fall straight through the cloud floor for this shot
    W.bandAt = (x, z) => ({ floor: W.SEA_Y, kind: 'sea', ceil: 200 });
  }
  if (name === 'sea'){
    const a = W.ents.find(e => e.kind === 'arch' && e.z > W.DIVE_Z1 + 150);
    place(a.x, W.SEA_Y + 3.4, a.z - 60, 26, 'hover');
  }
  if (name === 'moon'){
    place(0, W.GATE_Y - 2, W.GOAL_Z - 72, 27, 'wing');
    S.zone = 4; gateT = -1;
  }
  lastRings = S.rings; lastNear = S.nearMiss; wasAir = S.phase === 'air';
}

function frame(i){
  cur = i;
  const t = i / FPS, sh = SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1], lt = t - sh.t0;
  if (shot !== sh){ shot = sh; setup(sh.name); ev('cut', { shot: sh.name }); }
  $('pCap').style.opacity = 0; $('pName').style.opacity = 0; $('pLogo').style.opacity = 0; $('pEnd').style.opacity = 0;
  $('pFade').style.opacity = t < .25 ? 1 - t / .25 : t > 29.75 ? (t - 29.75) / .25 : 0;
  $('pFlash').style.opacity = 0;
  $('pNote').style.opacity = t > 27 ? 0 : .7;

  switch (sh.name){
    case 'takeoff': {
      I.tS = S.phase === 'ground'; I.tx = 0; I.ty = S.phase === 'air' ? .12 : 0;
      if (S.phase === 'air' && !wasAir){ ev('takeoff'); wasAir = true; }
      cap(t, .3, 1.7, '', '丘の先は──');
      const tk = (events.find(e => e.name === 'takeoff') || { t: 99 }).t;
      cap(t, tk + .35, 3.9, '', '空だった。');
      if (t > 4.05) show($('pLogo'), ease((t - 4.05) / .4) * ease((6.45 - t) / .25), (1 - ease((t - 4.05) / .5)) * 20, .94 + .06 * ease((t - 4.05) / .5));
      if (t >= 4.05 && t - 1 / FPS < 4.05) ev('logo');
      break;
    }
    case 'clouds': {
      bot();
      setStick(true, innerWidth * .34, innerHeight * .74);
      cap(t, sh.t0 + .2, sh.t1 - .05, '指1本で', '自由に飛べる。');
      break;
    }
    case 'garage': {
      const k = Math.min(3, Math.floor(lt)), kt = lt - k;
      if (kt < 1 / FPS / 2 || G.bike.userData.kitKey !== KITS[k]){
        Md.setKit(G.bike, KITS[k]); S.wingOpen = 0;
        const z = W.ZONE_Z[1] + 820; Object.assign(S, { x: 0, y: 46, z, v: 24, yaw: 0, pitch: 0, bank: .08, phase: 'air', coasting: false, cadence: 2.2, sprinting: true });
        if (k === 0) warm();
        ev(k === 0 ? 'unfold' : 'transform', { kit: KITS[k] }); if (k === 3) ev('bark', { dt: .45 });
      }
      G.manual = true; S.time += 1 / FPS; S.sprinting = true; S.cadence = 2.2;
      S.wingOpen = ease(kt / .5);
      const a0 = [-.9, .85, -2.5, .6][k], ang = a0 + kt * .4, r = 5.4;
      G.camHook = cam => {
        camT.set(S.x + Math.sin(ang) * r, S.y + 1.1 + (k === 2 ? 1.4 : 0), S.z + Math.cos(ang) * r);
        cam.clearViewOffset(); cam.position.copy(camT); cam.up.set(0, 1, 0); cam.lookAt(S.x, S.y + .35, S.z); cam.fov = 50; cam.updateProjectionMatrix();
      };
      cap(t, sh.t0 + .1, sh.t1 - .05, '4台の', '空とぶ自転車');
      const K = Md.KITS[KITS[k]], n = $('pName');
      n.querySelector('.ic').textContent = K.icon; n.querySelector('b').textContent = K.name; n.querySelector('small').textContent = K.sub;
      n.style.opacity = ease(kt / .15) * ease((1 - kt) / .1); n.style.transform = `translateY(${(1 - ease(kt / .2)) * 18}px)`;
      if (lt > 3.95) G.manual = false;
      break;
    }
    case 'city': {
      bot();
      cap(t, sh.t0 + .2, sh.t1 - .05, '浮島の街を', 'くぐり抜けて。');
      break;
    }
    case 'dive': {
      I.ty = lt < 1.2 ? -1 : .35; I.tx = 0; S.v = Math.max(S.v, 34);
      if (lt < 1.0) S.pitch = Math.min(S.pitch, -.9);       // a steep plunge
      // keep the full white-out only while the camera is really inside the cloud layer
      G.camHook = cam => { const f = cam.parent && cam.parent.fog, d = Math.abs(cam.position.y - W.CLOUD_Y); if (f && d > 7){ const k = Math.min(1, (d - 7) / 10); f.near = f.near + (180 - f.near) * k; f.far = f.far + (1400 - f.far) * k; } };
      if (!punched && S.y < W.CLOUD_Y - 1){ punched = true; ev('punch'); }
      cap(t, sh.t0 + .15, sh.t1 - .1, '雲を', '突き抜けて──');
      break;
    }
    case 'sea': {
      bot(); if (S.y < W.SEA_Y + 2.6){ S.y = W.SEA_Y + 2.6; S.pitch = Math.max(S.pitch, 0); }
      cap(t, sh.t0 + .15, sh.t1 - .05, '雲の下は', '夕陽の海。');
      break;
    }
    case 'moon': {
      if (S.phase === 'air') bot({ x: 0, y: W.GATE_Y, z: W.GOAL_Z + 50 });
      if (S.phase === 'goal' && gateT < 0){ gateT = t; ev('gate'); }
      cap(t, sh.t0 + .2, gateT > 0 ? gateT + .1 : 99, 'そして──', '');
      if (gateT > 0) cap(t, gateT + .45, 26.85, '', '月まで、とどけ。');
      // fireworks on the beat of the finale
      [25.9, 26.5, 27.15, 27.8, 28.5, 29.1].forEach((ft, j) => { if (t >= ft && t - 1 / FPS < ft){ FX.firework(S.x + (j % 2 ? 60 : -60) + Math.sin(j) * 30, S.y + 40 + j * 9, S.z + 90 + j * 12, (j * .17) % 1); ev('firework'); } });
      if (t >= 27){ const a = ease((t - 27) / .5); $('pEnd').style.opacity = a; $('pEnd').style.transform = `translateY(${(1 - a) * 24}px)`; }
      if (t >= 27 && t - 1 / FPS < 27) ev('endcard');
      break;
    }
  }
  // gameplay events for the soundtrack
  if (S.rings > lastRings){ const e = [...W.active].filter(x => x.kind === 'ring' && x.taken).sort((a, b) => b.z - a.z)[0]; ev('ring', { combo: S.combo, gold: !!(e && e.gold) }); lastRings = S.rings; }
  if (S.nearMiss > lastNear){ ev('nearmiss'); lastNear = S.nearMiss; }
  G.tick(1 / FPS);
  if (sh.name === 'dive' && Math.abs(G.camera.position.y - W.CLOUD_Y) > 7) $('whiteOv').style.opacity = 0;
  return { t, shot: sh.name, z: Math.round(S.z), y: Math.round(S.y), phase: S.phase };
}

// jump straight to the shot containing frame `from` (shots set themselves up, so a render can be split)
function seek(from){
  const t = from / FPS, sh = SHOTS.find(s => t >= s.t0 && t < s.t1) || SHOTS[SHOTS.length - 1];
  if (sh.name !== 'takeoff') setup('takeoff');       // build the same course a full run would
  return Math.round(sh.t0 * FPS);
}
window.PROMO = { frame, seek, events, SHOTS, FPS, total: 30 * FPS };
})();
