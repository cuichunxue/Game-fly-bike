/* ============================================================
 * Sky Pedal — audio engine (100% Web Audio synthesis, no files)
 * 風・ペダル・フリーホイールの「チチチ」・翼・ベル・効果音・
 * 世界ごとに変わるアダプティブBGM（メロディ付き）をリアルタイム合成。
 * 合成のコア（リバーブ/ディレイ/リミッター/スケジューラ）は
 * スラスト・ロードスター系エンジンから継承。
 * ============================================================ */
window.SP = window.SP || {};
SP.Audio = (() => {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  const A = {
    ctx: null, muted: false, musicVol: .6, sfxVol: .8,
    mode: 'off', intensity: 0, targetInt: 0, step: 0, nextT: 0, timer: 0, muffle: 0,
    cadence: 0, pedal: false, wheel: 0, tickT: 0, strokeT: 0, flapT: 0, sprint: false,
  };

  function init(){
    if (A.ctx){ if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    let ctx;
    try { ctx = A.ctx = new AC({ latencyHint: 'interactive' }); } catch(e){ return; }
    A.master = ctx.createGain(); A.master.gain.value = A.muted ? 0 : .9;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 10; lim.attack.value = .003; lim.release.value = .2;
    A.master.connect(lim); lim.connect(ctx.destination);

    A.verb = ctx.createConvolver(); A.verb.buffer = impulse(ctx, 3.2, 2.6);
    A.verbIn = ctx.createGain(); A.verbIn.connect(A.verb);
    const verbOut = ctx.createGain(); verbOut.gain.value = .6; A.verb.connect(verbOut); verbOut.connect(A.master);
    A.delayIn = ctx.createGain();
    const dl = ctx.createDelay(1.5), dr = ctx.createDelay(1.5), fb = ctx.createGain(), pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner(), dlp = ctx.createBiquadFilter();
    dl.delayTime.value = .34; dr.delayTime.value = .34; fb.gain.value = .36; pl.pan.value = -.7; pr.pan.value = .7; dlp.type = 'lowpass'; dlp.frequency.value = 3800;
    A.delayIn.connect(dl); dl.connect(pl); dl.connect(dr); dr.connect(pr); dr.connect(dlp); dlp.connect(fb); fb.connect(dl);
    const dOut = ctx.createGain(); dOut.gain.value = .45; pl.connect(dOut); pr.connect(dOut); dOut.connect(A.master); dOut.connect(A.verbIn);
    A.delays = [dl, dr];

    A.sfxBus = ctx.createGain(); A.sfxBus.gain.value = A.sfxVol; A.sfxBus.connect(A.master);
    A.musicBus = ctx.createGain(); A.musicBus.gain.value = 0;
    A.musicLP = ctx.createBiquadFilter(); A.musicLP.type = 'lowpass'; A.musicLP.frequency.value = 18000; A.musicLP.Q.value = .7;
    A.musicBus.connect(A.musicLP); A.musicLP.connect(A.master);
    A.duck = ctx.createGain(); A.duck.connect(A.musicBus);
    A.drums = ctx.createGain(); A.drums.gain.value = .8; A.drums.connect(A.musicBus);

    A.white = noiseBuf(ctx, 'white'); A.brown = noiseBuf(ctx, 'brown');
    buildLoops(ctx);
    A.nextT = ctx.currentTime + .1;
    A.timer = setInterval(schedule, 25);
    // iOS: resume after an interruption (call, Siri, lock screen)
    document.addEventListener('visibilitychange', () => { if (!document.hidden && A.ctx && A.ctx.state !== 'running') A.ctx.resume().catch(() => {}); });
  }

  function impulse(ctx, dur, decay){
    const len = ctx.sampleRate * dur | 0, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++){
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++){ const t = i / len; let v = (Math.random() * 2 - 1) * Math.pow(1 - t, decay); if (i < ctx.sampleRate * .08 && Math.random() < .004) v *= 6; d[i] = v * (c ? .95 : 1); }
    }
    return b;
  }
  function noiseBuf(ctx, kind){
    const len = ctx.sampleRate * 3, b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++){
      const d = b.getChannelData(c); let last = 0;
      for (let i = 0; i < len; i++){ const w = Math.random() * 2 - 1; if (kind === 'brown'){ last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    }
    return b;
  }
  function loopNoise(buf){ const s = A.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; }
  function gain(v, to){ const g = A.ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  function filt(type, f, q, to){ const b = A.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; if (to) b.connect(to); return b; }
  function osc(type, f, to){ const o = A.ctx.createOscillator(); o.type = type; o.frequency.value = f; if (to) o.connect(to); o.start(); return o; }

  /* ---------- continuous layers: wind, chain, high-altitude air, ground rumble ---------- */
  function buildLoops(ctx){
    const L = A.L = {};
    // wind: two bands, slowly panning (gusts), louder with speed^2
    L.wind = gain(0, A.sfxBus); const n1 = loopNoise(A.white); L.windLP = filt('lowpass', 500, .4); n1.connect(L.windLP);
    const wp = ctx.createStereoPanner(); L.windLP.connect(wp); wp.connect(L.wind);
    L.windPan = osc('sine', .11); L.windPan.connect(gain(.55, wp.pan));
    L.gust = osc('sine', .23); L.gust.connect(gain(.25, L.wind.gain));
    L.whist = gain(0, A.sfxBus); const n2 = loopNoise(A.white); L.whistBP = filt('bandpass', 1800, 6); n2.connect(L.whistBP); L.whistBP.connect(L.whist);
    // chain whirr while pedalling (band noise, amplitude-modulated by the crank)
    L.chain = gain(0, A.sfxBus); const n3 = loopNoise(A.white); L.chainBP = filt('bandpass', 2400, 3); n3.connect(L.chainBP);
    L.chainAM = gain(.5, L.chain); L.chainBP.connect(L.chainAM);
    L.crank = osc('sine', 2); L.crank.connect(gain(.5, L.chainAM.gain));
    // tyres on the road (the take-off run)
    L.road = gain(0, A.sfxBus); const n4 = loopNoise(A.brown); L.roadLP = filt('lowpass', 260, .8); n4.connect(L.roadLP); L.roadLP.connect(L.road);
    // the thin, high air: a soft shimmering drone that fades in with altitude
    L.air = gain(0, A.sfxBus); const ah = filt('bandpass', 4200, 2, L.air);
    const n5 = loopNoise(A.white); n5.connect(ah);
    L.airTone = gain(0, A.sfxBus); osc('sine', mtof(88), L.airTone); osc('sine', mtof(95) * 1.003, gain(.6, L.airTone));
  }

  function update(s){
    if (!A.ctx || !A.L) return;
    const L = A.L, t = A.ctx.currentTime, on = s.playing ? 1 : 0;
    const sp = clamp(s.speed / 34, 0, 1.4);
    L.wind.gain.setTargetAtTime(on * (.03 + sp * sp * .2) + (s.title ? .02 : 0), t, .25);
    L.windLP.frequency.setTargetAtTime(300 + sp * 1500 + (s.dive ? 900 : 0), t, .25);
    L.whist.gain.setTargetAtTime(on * Math.max(0, sp - .75) * .05, t, .3);
    L.whistBP.frequency.setTargetAtTime(1400 + sp * 1600, t, .3);
    A.pedal = !!(s.playing && s.pedal); A.sprint = !!(s.playing && s.sprint);
    A.cadence = s.cadence || 0; A.wheel = s.wheel || 0;
    L.chain.gain.setTargetAtTime(A.pedal ? .028 + (A.sprint ? .03 : 0) : 0, t, .08);
    L.chainBP.frequency.setTargetAtTime(1800 + A.cadence * 500, t, .1);
    L.crank.frequency.setTargetAtTime(Math.max(.5, A.cadence * 2), t, .1);
    L.road.gain.setTargetAtTime(on * (s.ground ? .1 + sp * .25 : 0), t, .06);
    L.roadLP.frequency.setTargetAtTime(160 + sp * 400, t, .1);
    const hi = clamp(s.high || 0, 0, 1);
    L.air.gain.setTargetAtTime(on * hi * .018, t, .8); L.airTone.gain.setTargetAtTime(on * hi * .012, t, .8);
    A.targetInt = s.intensity || 0;
    A.musicLP.frequency.setTargetAtTime(A.muffle > 0 ? 700 + (1 - A.muffle) * 9000 : (A.mode === 'pause' ? 900 : 18000), t, .15);
  }
  function setMuffle(m){ A.muffle = clamp(m, 0, 1); }

  /* ---------- one-shot helpers ---------- */
  function tone(f, t, dur, type, vol, f2, opts = {}){
    const ctx = A.ctx; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * (opts.glide || 1));
    if (opts.detune) o.detune.value = opts.detune;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (opts.att || .006)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let node = g;
    if (opts.pan){ const p = ctx.createStereoPanner(); p.pan.value = opts.pan; g.connect(p); node = p; }
    o.connect(g); node.connect(opts.bus || A.sfxBus);
    if (opts.verb) node.connect(gain(opts.verb, A.verbIn));
    if (opts.delay) node.connect(gain(opts.delay, A.delayIn));
    o.start(t); o.stop(t + dur + .05); return o;
  }
  function noiseHit(t, dur, vol, freq, type, q, freq2, opts = {}){
    const ctx = A.ctx; const s = ctx.createBufferSource(); s.buffer = opts.brown ? A.brown : A.white;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq, t); if (q) f.Q.value = q;
    if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (opts.att || .004)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g);
    let node = g; if (opts.pan !== undefined){ const p = ctx.createStereoPanner(); p.pan.setValueAtTime(opts.pan, t); if (opts.pan2 !== undefined) p.pan.linearRampToValueAtTime(opts.pan2, t + dur); g.connect(p); node = p; }
    node.connect(opts.bus || A.sfxBus); if (opts.verb) node.connect(gain(opts.verb, A.verbIn));
    s.start(t, Math.random() * 2); s.stop(t + dur + .05);
  }
  function bell(f, t, vol, opts = {}){
    tone(f, t, 1.6, 'sine', vol, 0, { verb: .5, delay: .25, pan: opts.pan });
    tone(f * 2.0, t, .9, 'sine', vol * .35, 0, { verb: .4, pan: opts.pan });
    tone(f * 3.01, t, .5, 'sine', vol * .18, 0, { verb: .3 });
    tone(f * .5, t, .3, 'triangle', vol * .3, 0, {});
  }
  // the bicycle bell: two inharmonic partials, a bright strike, rung twice
  function bikeBell(t, vol = .22, pan = 0){
    for (let k = 0; k < 2; k++){
      const tt = t + k * .14;
      [[2350, 1], [3410, .55], [5170, .3], [1180, .25]].forEach(([f, a]) => tone(f, tt, 1.1 - k * .3, 'sine', vol * a, f * .996, { verb: .35, pan, att: .002 }));
      noiseHit(tt, .03, vol * .5, 6000, 'highpass', 0, 0, { pan });
    }
  }

  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
  function sfx(name, v = 0, opt = {}){
    if (!A.ctx) return; const t = A.ctx.currentTime + .005;
    switch (name){
      case 'bell': bikeBell(t, .2 + v * .1, opt.pan || 0); break;
      case 'ring': { const n = PENTA[Math.min(PENTA.length - 1, v)]; bell(mtof(81 + n - 12), t, .19, { pan: opt.pan || 0 }); noiseHit(t, .14, .07, 7000, 'highpass', 0, 0, { verb: .4 }); break; }
      case 'gold': [0, 4, 7, 12, 16].forEach((n, i) => bell(mtof(84 + n), t + i * .05, .1, { pan: (i % 2 ? .4 : -.4) })); noiseHit(t, .6, .25, 600, 'bandpass', 1, 6000, { verb: .4 }); tone(70, t, .5, 'sine', .3, 140); break;
      case 'star': [0, 7, 12, 16, 19, 24, 28].forEach((n, i) => tone(mtof(79 + n), t + i * .055, .9, 'triangle', .1, 0, { verb: .6, delay: .25 })); noiseHit(t, .9, .2, 2000, 'highpass', 0, 10000, { verb: .6 }); break;
      case 'thermal': noiseHit(t, 1.4, .18, 400, 'bandpass', 1.5, 3000, { verb: .5 }); [0, 7, 12].forEach((n, i) => tone(mtof(67 + n), t + i * .12, 1.2, 'sine', .05, mtof(79 + n), { verb: .6, att: .2 })); break;
      case 'chirp': { const f = 2600 + Math.random() * 1400, p = opt.pan || (Math.random() - .5); for (let k = 0; k < 2 + (Math.random() * 3 | 0); k++) tone(f * (1 + k * .06), t + k * .07, .06, 'sine', .05 * (v || 1), f * 1.5, { pan: p, verb: .2 }); break; }
      case 'join': [0, 5, 9, 12].forEach((n, i) => tone(mtof(86 + n), t + i * .05, .2, 'sine', .07, mtof(88 + n), { verb: .3, delay: .2, pan: opt.pan || 0 })); sfx('chirp', 1.2, opt); break;
      case 'whale': { tone(150, t, 2.6, 'sine', .14, 95, { verb: .9, att: .5 }); tone(300, t + .4, 2.2, 'triangle', .04, 210, { verb: .9, att: .6 }); noiseHit(t + 1.6, 1.6, .2, 900, 'lowpass', 0, 200, { brown: true, verb: .4 }); break; }
      case 'splash': noiseHit(t, .9, .5, 2400, 'bandpass', .6, 500, { verb: .3 }); noiseHit(t + .05, .5, .3, 6000, 'highpass', 0, 2000); tone(90, t, .3, 'sine', .3, 40); break;
      case 'spray': noiseHit(t, .18, .08, 5000, 'highpass', 0, 2500, { pan: (Math.random() - .5) * .6 }); break;
      case 'cloud': noiseHit(t, 1.6, .35, 300, 'lowpass', 1, 6000, { verb: .5 }); break;
      case 'punch': noiseHit(t, 2.2, .45, 400, 'lowpass', 1, 9000, { verb: .6 }); [0, 7, 14, 19, 24].forEach((n, i) => tone(mtof(65 + n), t + .25 + i * .09, 2.4, 'sine', .07, 0, { verb: .8, delay: .3 })); break;
      case 'bump':  // a soft "boing" — never harsh: this is a game for children too
        tone(220, t, .35, 'sine', .4, 90); tone(330, t + .02, .25, 'triangle', .12, 160); noiseHit(t, .3, .35, 500, 'lowpass', 0, 0, { brown: true }); break;
      case 'crash':
        tone(160, t, .7, 'sine', .55, 50); noiseHit(t, .8, .5, 1500, 'lowpass', 1, 150, { verb: .4, brown: true });
        [880, 660, 440].forEach((f, i) => tone(f, t + .08 + i * .1, .25, 'triangle', .07, f * .95, { verb: .4 })); break;
      case 'respawn': [0, 4, 7, 12].forEach((n, i) => tone(mtof(72 + n), t + i * .07, .5, 'sine', .09, 0, { verb: .5, delay: .2 })); noiseHit(t, .6, .2, 1200, 'bandpass', 1, 7000, { verb: .5 }); break;
      case 'nearmiss': noiseHit(t, .45, .4, 2600, 'bandpass', 1.4, 500, { pan: opt.pan || .6, pan2: -(opt.pan || .6) }); tone(880, t + .05, .22, 'triangle', .06, 1320, { verb: .3 }); break;
      case 'combo': tone(mtof(84 + Math.min(14, v * 2)), t, .18, 'triangle', .05, 0, { delay: .3 }); break;
      case 'unfold':  // wings open: feathered whoosh + rising shimmer
        noiseHit(t, .9, .5, 300, 'bandpass', 1.2, 5000, { pan: -.6, pan2: .6, verb: .4 });
        [0, 4, 7, 11, 14, 19].forEach((n, i) => tone(mtof(72 + n), t + .1 + i * .06, 1.4, 'sine', .07, 0, { verb: .7, delay: .3 })); break;
      case 'takeoff': {
        noiseHit(t, 1.4, .5, 300, 'bandpass', 1, 7000, { pan: -.5, pan2: .5, verb: .4 }); tone(55, t, 1.6, 'sine', .7, 110);
        [0, 4, 7, 11, 14, 19, 24].forEach(n => { tone(mtof(48 + n), t + .05, 3.2, 'sawtooth', .03, 0, { verb: .8, att: .1, detune: -8 }); tone(mtof(48 + n), t + .05, 3.2, 'triangle', .05, 0, { att: .1, detune: 8 }); });
        [0, 4, 7, 12, 16, 19, 24, 28].forEach((n, i) => bell(mtof(79 + n), t + .25 + i * .07, .08, { pan: (i % 2 ? .5 : -.5) }));
        break;
      }
      case 'flap': noiseHit(t, .22, .1 + v * .08, 600, 'bandpass', 1.2, 220, { pan: (Math.random() - .5) * .4 }); break;
      case 'tired': tone(330, t, .2, 'triangle', .07, 250); tone(262, t + .18, .3, 'triangle', .07, 200); break;
      case 'zone': [0, 7, 12, 16, 19, 24].forEach((n, i) => tone(mtof(55 + n), t + i * .05, 2.6, 'triangle', .05, 0, { verb: .8, att: .3 })); tone(55, t, 1.5, 'sine', .5, 41); noiseHit(t, 2.4, .2, 300, 'lowpass', 1, 6000, { verb: .6 }); break;
      case 'lantern': bell(mtof(84 + PENTA[v % 7]), t, .07, { pan: opt.pan || 0 }); break;
      case 'meteor': noiseHit(t, .8, .3, 9000, 'highpass', 0, 1500, { pan: -.7, pan2: .7, verb: .5 }); [0, 7, 12, 19].forEach((n, i) => tone(mtof(88 + n), t + i * .04, .5, 'sine', .06, 0, { verb: .6, delay: .2 })); break;
      case 'moon': {  // the moon gate: ethereal choir swell
        [0, 7, 12, 16, 19, 23, 26].forEach((n, i) => { tone(mtof(52 + n), t + i * .04, 5, 'sawtooth', .022, 0, { verb: .9, att: 1.2, detune: -6 }); tone(mtof(52 + n), t + i * .04, 5, 'sine', .05, 0, { verb: .9, att: 1.2, detune: 6 }); });
        [0, 4, 7, 11, 12, 16, 19, 23, 24, 28].forEach((n, i) => bell(mtof(76 + n), t + .6 + i * .12, .07, { pan: (i % 2 ? .6 : -.6) }));
        tone(41, t, 4, 'sine', .5, 30); noiseHit(t, 5, .2, 9000, 'highpass', 0, 2500, { verb: .9, att: 1 });
        break;
      }
      case 'goal': {
        const mel = [0, 4, 7, 12, 11, 12, 16, 19, 24];
        mel.forEach((n, i) => { tone(mtof(64 + n), t + i * .14, .8, 'triangle', .08, 0, { verb: .5, delay: .25 }); tone(mtof(52 + n), t + i * .14, .8, 'sine', .06, 0, { verb: .4 }); });
        tone(40, t, 3, 'sine', .6, 30); noiseHit(t + 1.2, 3, .25, 7000, 'highpass', 0, 3000, { verb: .8 });
        break;
      }
      case 'firework': { const p = (Math.random() - .5) * 1.4; noiseHit(t, .08, .25, 3000, 'bandpass', 1, 0, { pan: p }); noiseHit(t + .02, 1.6, .2, 5000, 'highpass', 0, 1500, { pan: p, verb: .6 }); tone(70, t, .6, 'sine', .3, 35); break; }
      case 'shutter': noiseHit(t, .05, .3, 3000, 'bandpass', 2); noiseHit(t + .09, .07, .25, 2200, 'bandpass', 2); break;
      case 'click': tone(1800, t, .04, 'square', .04); break;
      case 'select': tone(990, t, .08, 'triangle', .1); tone(1480, t + .05, .1, 'triangle', .08); break;
      case 'heart': tone(62, t, .16, 'sine', .5, 40); tone(58, t + .2, .2, 'sine', .35, 36); break;
      case 'warn': [0, .18].forEach(d => tone(988, t + d, .1, 'triangle', .06)); break;
    }
  }

  /* ---------- bike mechanics on the clock: pedal strokes, freewheel ticks, wing flaps ---------- */
  function mechanics(now){
    if (A.mode !== 'play' && A.mode !== 'title') return;
    const t = A.ctx.currentTime;
    if (A.pedal && A.cadence > .2){
      // two strokes per crank revolution: a soft push + a chain click
      if (now >= A.strokeT){ A.strokeT = now + 1 / (A.cadence * 2); noiseHit(t, .07, A.sprint ? .06 : .035, 900, 'bandpass', 2, 0, { brown: true }); tone(2900 + Math.random() * 300, t + .01, .02, 'square', .012); }
    } else if (A.wheel > .4 && A.mode === 'play'){
      // the freewheel ratchet: the nostalgic "tick-tick-tick" when you stop pedalling
      if (now >= A.tickT){ A.tickT = now + 1 / clamp(A.wheel * 9, 4, 34); tone(4200 + Math.random() * 600, t, .012, 'square', .016, 0, { att: .001 }); }
    }
    if (A.sprint && now >= A.flapT){ A.flapT = now + .42; sfx('flap', 1); }
  }

  /* ---------- adaptive score ---------- */
  // one song per world, written as chord progression + a hummable melody (bar, 16th-step, semitone, length)
  const SONGS = [
    { key: 72, bpm: 88, prog: [[48, [0, 4, 7, 11]], [43, [0, 4, 7, 14]], [45, [0, 3, 7, 10]], [41, [0, 4, 7, 14]]],   // C G Am F — the hill at dawn
      mel: [[0,0,4,4],[0,4,7,4],[0,8,9,2],[0,10,7,6],[1,0,2,4],[1,4,4,2],[1,6,7,10],[2,0,0,4],[2,4,4,4],[2,8,7,2],[2,10,4,6],[3,0,5,4],[3,4,4,4],[3,8,2,4],[3,12,0,4]] },
    { key: 77, bpm: 98, prog: [[41, [0, 4, 7, 14]], [43, [0, 4, 7, 9]], [45, [0, 3, 7, 10]], [48, [0, 4, 7, 11]]],   // F G/F Am C — the sea of clouds (lydian air)
      mel: [[0,0,-5,4],[0,4,-3,2],[0,6,-1,2],[0,8,0,8],[1,0,2,4],[1,4,0,4],[1,8,-1,4],[1,12,-3,4],[2,0,-5,6],[2,6,-8,2],[2,8,-5,8],[3,0,-3,4],[3,4,-5,4],[3,8,-10,4],[3,12,-8,4]] },
    { key: 74, bpm: 112, prog: [[50, [0, 4, 7, 14]], [47, [0, 3, 7, 10]], [43, [0, 4, 7, 11]], [45, [0, 4, 7, 9]]],  // D Bm G A — the sky city
      mel: [[0,0,0,2],[0,2,4,2],[0,4,7,4],[0,8,9,2],[0,10,7,2],[0,12,4,4],[1,0,2,2],[1,2,4,2],[1,4,7,2],[1,6,11,6],[1,12,9,4],[2,0,7,4],[2,4,4,2],[2,6,2,2],[2,8,4,8],[3,0,9,2],[3,2,7,2],[3,4,9,4],[3,8,11,4],[3,12,12,4]] },
    { key: 68, bpm: 100, prog: [[53, [0, 3, 7, 10]], [49, [0, 4, 7, 11]], [44, [0, 4, 7, 14]], [51, [0, 4, 7, 9]]],  // Fm Db Ab Eb — the sunset sea
      mel: [[0,0,-3,4],[0,4,0,4],[0,8,4,2],[0,10,2,2],[0,12,0,4],[1,0,5,6],[1,6,4,2],[1,8,0,8],[2,0,7,4],[2,4,4,4],[2,8,0,2],[2,10,2,2],[2,12,4,4],[3,0,2,4],[3,4,-1,4],[3,8,2,4],[3,12,7,4]] },
    { key: 76, bpm: 118, prog: [[52, [0, 4, 7, 11]], [49, [0, 3, 7, 10]], [45, [0, 4, 7, 14]], [47, [0, 4, 7, 10]]],  // E C#m A B — to the stars
      mel: [[0,0,-5,4],[0,4,-1,4],[0,8,0,4],[0,12,2,4],[1,0,4,6],[1,6,2,2],[1,8,0,4],[1,12,-3,4],[2,0,-3,4],[2,4,0,4],[2,8,4,8],[3,0,2,4],[3,4,-1,4],[3,8,2,4],[3,12,7,4]] },
  ];
  const TITLE = Object.assign({}, SONGS[0], { bpm: 76 });
  const FINALE = Object.assign({}, SONGS[4], { bpm: 84 });
  let songIdx = 0, pendingSong = 0;

  function voice(type, f, t, dur, vol, out, opts = {}){
    const ctx = A.ctx; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; if (opts.detune) o.detune.value = opts.detune;
    let node = o;
    if (opts.vib){ const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * .006, t + dur * .6); l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + .05); }
    if (opts.lp){ const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = opts.q || 1; fl.frequency.setValueAtTime(opts.lp, t); if (opts.lp2) fl.frequency.exponentialRampToValueAtTime(opts.lp2, t + dur * .9); o.connect(fl); node = fl; }
    const att = opts.att || .005;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att);
    if (opts.sus){ g.gain.setValueAtTime(vol, t + Math.max(att, dur - (opts.rel || .1))); g.gain.linearRampToValueAtTime(0, t + dur); }
    else g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    node.connect(g); g.connect(out);
    if (opts.verb) g.connect(gain(opts.verb, A.verbIn)); if (opts.delay) g.connect(gain(opts.delay, A.delayIn));
    o.start(t); o.stop(t + dur + .05);
  }
  // a soft felt-piano-ish pluck
  function piano(f, t, dur, vol, out){
    voice('triangle', f, t, dur, vol, out, { lp: 3200, lp2: 900, verb: .35, delay: .15 });
    voice('sine', f * 2, t, dur * .5, vol * .3, out, {});
  }
  function drum(kind, t, v = 1){
    const ctx = A.ctx;
    if (kind === 'kick'){
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
      g.gain.setValueAtTime(.7 * v, t); g.gain.exponentialRampToValueAtTime(.0001, t + .3); o.connect(g); g.connect(A.drums); o.start(t); o.stop(t + .32);
      A.duck.gain.cancelScheduledValues(t); A.duck.gain.setValueAtTime(.55, t); A.duck.gain.linearRampToValueAtTime(1, t + .25);
    } else if (kind === 'snare'){ noiseHit(t, .18, .22 * v, 1700, 'bandpass', .7, 0, { bus: A.drums, verb: .5 }); }
    else if (kind === 'shaker'){ noiseHit(t, .05, .05 * v, 7500, 'highpass', 0, 0, { bus: A.drums }); }
    else if (kind === 'tick'){ noiseHit(t, .02, .05 * v, 9000, 'highpass', 0, 0, { bus: A.drums }); }
  }
  function schedule(){
    const ctx = A.ctx; if (!ctx) return;
    mechanics(ctx.currentTime);
    if (A.mode === 'off' || A.mode === 'pause' || document.hidden){ A.nextT = ctx.currentTime + .08; return; }
    if (A.nextT < ctx.currentTime - .3) A.nextT = ctx.currentTime + .05;
    // intensity eases toward the game's target, one layer at a time
    A.intensity += clamp(A.targetInt - A.intensity, -.02, .02);
    const song = A.mode === 'title' ? TITLE : A.mode === 'finale' ? FINALE : SONGS[songIdx];
    const sp = 60 / song.bpm / 4;
    A.delays.forEach(d => d.delayTime.setTargetAtTime(sp * 3, ctx.currentTime, .1));
    while (A.nextT < ctx.currentTime + .14){
      const st = A.step % 64, beat = st % 16, bar = (st / 16) | 0, t = A.nextT;
      if (st === 0 && A.mode === 'play' && pendingSong !== songIdx) songIdx = pendingSong;
      const S2 = A.mode === 'title' ? TITLE : A.mode === 'finale' ? FINALE : SONGS[songIdx];
      const [root, chord] = S2.prog[bar];
      const I = A.mode === 'play' ? A.intensity : A.mode === 'finale' ? 1.2 : .3;
      // pad: warm and wide at every intensity
      if (beat === 0){
        chord.forEach(n => {
          const f = mtof(root + 12 + n);
          voice('sawtooth', f, t, sp * 16, .014, A.duck, { detune: -10, lp: 900 + I * 500, att: .5, sus: true, rel: .4, verb: .4 });
          voice('triangle', f, t, sp * 16, .03, A.duck, { detune: 7, att: .5, sus: true, rel: .4 });
        });
        voice('sine', mtof(root - 12), t, sp * 16, .1, A.duck, { att: .3, sus: true, rel: .3 });
      }
      // piano arpeggio: the heartbeat of the journey
      const arp = [0, 1, 2, 3, 2, 1, 2, 3];
      if (beat % 2 === 0){ const n = chord[arp[(beat / 2) % 8]] + (beat >= 8 ? 12 : 0); piano(mtof(root + 24 + n), t, sp * 3, .05, A.musicBus); }
      if (I >= .8){
        // bass + soft groove
        if (beat === 0 || beat === 6 || beat === 10) voice('triangle', mtof(root - 12 + (beat === 10 ? 7 : 0)), t, sp * 3.5, .14, A.duck, { lp: 500, lp2: 200 });
        if (beat === 0 || beat === 8 || (I >= 2.2 && beat % 4 === 0)) drum('kick', t, .9);
        if (beat % 2 === 1) drum('shaker', t, beat % 4 === 3 ? 1.2 : .7);
      }
      if (I >= 2.2){ if (beat === 4 || beat === 12) drum('snare', t); if (beat % 4 === 2) drum('tick', t); }
      // the melody: carried by a flute-like lead, an octave up when you're flying hot
      if (I >= 1.5 || A.mode === 'finale'){
        for (const m of S2.mel){
          if (m[0] === bar && m[1] === beat){
            const f = mtof(S2.key + m[2] + (I >= 3 ? 12 : 0));
            voice('sine', f, t, sp * m[3] * .95, .07, A.musicBus, { att: .03, sus: true, rel: sp, vib: true, verb: .4, delay: .25 });
            voice('triangle', f * 2, t, sp * m[3] * .6, .012, A.musicBus, { att: .03 });
          }
        }
      }
      // sparkle: glockenspiel counter-line at full intensity
      if (I >= 3 && beat % 4 === 3){ const n = chord[(beat + bar) % chord.length]; voice('sine', mtof(root + 36 + n), t, sp * 4, .03, A.musicBus, { delay: .4, verb: .4 }); }
      A.nextT += sp; A.step++;
    }
  }

  function setMode(m){
    if (!A.ctx){ A.mode = m; return; }
    if ((m === 'play' || m === 'title' || m === 'finale') && A.mode !== m && A.mode !== 'pause') A.step = 0;
    A.mode = m;
    const t = A.ctx.currentTime;
    A.musicBus.gain.setTargetAtTime(m === 'off' ? 0 : A.musicVol * (m === 'title' ? .75 : m === 'pause' ? .35 : .62), t, .4);
    if (m !== 'play') update({ speed: 0, playing: false, title: m === 'title' });
  }
  function setSong(z, now){ pendingSong = clamp(z | 0, 0, SONGS.length - 1); if (now) songIdx = pendingSong; }
  function setMusicVol(v){ A.musicVol = v; if (A.ctx) setMode(A.mode); }
  function setSfxVol(v){ A.sfxVol = v; if (A.ctx) A.sfxBus.gain.setTargetAtTime(v, A.ctx.currentTime, .05); }
  function setMute(m){ A.muted = m; if (A.ctx) A.master.gain.setTargetAtTime(m ? 0 : .9, A.ctx.currentTime, .05); }

  return { init, update, sfx, setMode, setSong, setMuffle, setMusicVol, setSfxVol, setMute, get muted(){ return A.muted; }, get ready(){ return !!A.ctx; }, get mode(){ return A.mode; } };
})();
