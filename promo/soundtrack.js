/* Sky Pedal — render the promo soundtrack offline with the game's own synth engine (js/audio.js).
 * usage: node promo/soundtrack.js <events.json> <out.wav>
 * The real-time engine is driven by an OfflineAudioContext, suspended every 50ms to run its scheduler. */
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const [evFile, outWav] = process.argv.slice(2);
(async () => {
  const events = JSON.parse(fs.readFileSync(evFile, 'utf8'));
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  page.on('console', m => console.log('page:', m.text()));
  await page.goto('http://localhost:8123/promo/blank.html');
  await page.evaluate(() => {
    const SR = 48000, DUR = 30.6;
    window.__off = new OfflineAudioContext(2, Math.ceil(SR * DUR), SR);
    window.AudioContext = function(){ return window.__off; };
    window.__tick = null; window.setInterval = fn => { window.__tick = fn; return 1; };
  });
  await page.addScriptTag({ path: path.join(__dirname, '..', 'js', 'audio.js') });
  const b64 = await page.evaluate(async events => {
    const AU = SP.Audio, off = window.__off, at = n => (events.find(e => e.name === n) || {}).t;
    AU.setMusicVol(.85); AU.setSfxVol(.9); AU.init(); AU.setSong(2, true);
    const T = { takeoff: at('takeoff') ?? 1.4, gate: at('gate') ?? 25, punch: at('punch') ?? 19.4 };
    const cuts = Object.fromEntries(events.filter(e => e.name === 'cut').map(e => [e.shot, e.t]));
    // a timeline of one-shot calls
    const tl = [];
    const at2 = (t, fn) => tl.push({ t, fn });
    at2(0, () => AU.setMode('play'));
    at2(T.takeoff, () => { AU.sfx('unfold'); AU.sfx('takeoff'); });
    events.forEach(e => {
      if (e.name === 'logo') at2(e.t, () => AU.sfx('bell'));
      if (e.name === 'ring') at2(e.t, () => AU.sfx(e.gold ? 'gold' : 'ring', Math.min(13, (e.combo || 1) - 1)));
      if (e.name === 'unfold') at2(e.t, () => AU.sfx('unfold'));
      if (e.name === 'transform') at2(e.t, () => AU.sfx('transform'));
      if (e.name === 'bark') at2(e.t + (e.dt || 0), () => AU.sfx('bark'));
      if (e.name === 'nearmiss') at2(e.t, () => AU.sfx('nearmiss'));
      if (e.name === 'firework') at2(e.t, () => AU.sfx('firework'));
      if (e.name === 'endcard') { at2(e.t, () => AU.sfx('goal')); at2(e.t + .35, () => AU.sfx('bell')); }
    });
    at2(T.punch - .15, () => { AU.sfx('punch'); AU.setMuffle(.8); });
    at2(T.punch + .45, () => AU.setMuffle(0));
    at2(T.gate, () => { AU.sfx('moon'); AU.setMode('finale'); });
    for (let t = (cuts.sea ?? 20.5) + .1; t < (cuts.moon ?? 22.5); t += .22) at2(t, () => AU.sfx('spray'));
    at2((cuts.clouds ?? 6.5) + .5, () => AU.sfx('chirp', 1.2)); at2((cuts.clouds ?? 6.5) + 2.2, () => AU.sfx('chirp', 1));
    tl.sort((a, b) => a.t - b.t);
    // continuous state: wind, pedals, music intensity
    const state = t => {
      const ground = t < T.takeoff, air = !ground;
      let I = ground ? .4 : t < 6.5 ? 2.6 : t < 10.5 ? 3.1 : t < 14.5 ? 3.4 : t < 18.5 ? 3.2 : t < 22.5 ? 3.3 : 2.4;
      const speed = ground ? 16 : t >= T.punch - 1.3 && t < 20.5 ? 32 : 26;
      return { playing: true, speed, pedal: true, sprint: ground || (t > 10.5 && t < 14.5), cadence: ground ? 2 : 1.4, wheel: speed / 2.1, ground, dive: t >= T.punch - 1.3 && t < T.punch + .3, high: t > 22.5 ? 1 : 0, intensity: I, motor: t > 10.5 && t < 22.5 && !(t > 10.5 && t < 11.5) ? 1 : 0 };
    };
    let k = 0;
    for (let t = .05; t < off.length / off.sampleRate - .05; t += .05){
      const tt = +t.toFixed(3);
      off.suspend(tt).then(() => {
        while (k < tl.length && tl[k].t <= tt){ try { tl[k].fn(); } catch(e){ console.log('sfx err', e.message); } k++; }
        AU.update(state(tt)); window.__tick && window.__tick();
        off.resume();
      });
    }
    const buf = await off.startRendering();
    // 16-bit PCM WAV
    const n = buf.length, ch = 2, data = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
    data.setUint32(24, buf.sampleRate, true); data.setUint32(28, buf.sampleRate * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * ch * 2, true);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (let i = 0; i < n; i++){ data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    const u8 = new Uint8Array(data.buffer); let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }, events);
  fs.writeFileSync(outWav, Buffer.from(b64, 'base64'));
  console.log('wrote', outWav);
  await browser.close();
})();
