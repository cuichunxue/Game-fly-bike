/* ============================================================
 * Sky Pedal — visual effects
 * パーティクル（ロードスター系エンジンから継承した GPU プール）、
 * スピードライン、翼端の光跡、上昇気流のきらめき、水しぶき、花火、
 * 世界ごとの浮遊物（綿毛・花びら・星くず）、高度がわかる足元の影。
 * ============================================================ */
window.SP = window.SP || {};
SP.FX = (() => {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  let scene, pointScale = { value: 600 };

  class Particles {
    constructor(max, tex, additive){
      this.max = max; this.cursor = 0;
      this.pos = new Float32Array(max * 3); this.rgba = new Float32Array(max * 4); this.size = new Float32Array(max);
      this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
      this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3); this.a0 = new Float32Array(max);
      this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
      for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -1e5;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('rgba', new THREE.BufferAttribute(this.rgba, 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { map: { value: tex }, scale: pointScale },
        vertexShader: 'attribute vec4 rgba; attribute float size; uniform float scale; varying vec4 vC; void main(){ vC = rgba; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = clamp(size*scale/-mv.z, 0., 256.); gl_Position = projectionMatrix*mv; }',
        fragmentShader: 'uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb*t.rgb, vC.a*t.a); }'
      });
      this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.renderOrder = 6;
      this.geo = g; this.alive = 0;
    }
    emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0 = 1, grav = 0, drag = 1){
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      const i3 = i * 3;
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.grav[i] = grav; this.drag[i] = drag;
      this.c0[i3] = c0[0]; this.c0[i3 + 1] = c0[1]; this.c0[i3 + 2] = c0[2];
      const e = c1 || c0; this.c1[i3] = e[0]; this.c1[i3 + 1] = e[1]; this.c1[i3 + 2] = e[2];
    }
    update(dt){
      const P = this.pos, V = this.vel; let alive = 0;
      for (let i = 0; i < this.max; i++){
        if (this.life[i] <= 0) continue;
        this.life[i] -= dt; const i3 = i * 3, i4 = i * 4;
        if (this.life[i] <= 0){ P[i3 + 1] = -1e5; this.rgba[i4 + 3] = 0; continue; }
        alive++;
        const k = 1 - this.life[i] / this.maxLife[i];
        const d = Math.pow(this.drag[i], dt * 60);
        V[i3] *= d; V[i3 + 1] = V[i3 + 1] * d - this.grav[i] * dt; V[i3 + 2] *= d;
        P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
        this.rgba[i4] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * k;
        this.rgba[i4 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * k;
        this.rgba[i4 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * k;
        this.rgba[i4 + 3] = this.a0[i] * (k < .1 ? k / .1 : 1 - (k - .1) / .9);
        this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      }
      this.alive = alive;
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.rgba.needsUpdate = true; this.geo.attributes.size.needsUpdate = true;
    }
    clear(){ this.life.fill(0); for (let i = 0; i < this.max; i++){ this.pos[i * 3 + 1] = -1e5; this.rgba[i * 4 + 3] = 0; } }
  }

  const C = {
    trail: [[.85, .95, 1], [.6, .8, 1]], gold: [[1, .9, .5], [1, .55, .2]], cyan: [[.6, 1, 1], [.3, .7, 1]], white: [[1, 1, 1], [.8, .9, 1]],
    star: [[1, .95, .6], [1, .6, .3]], spray: [[.95, .98, 1], [.8, .9, 1]],
  };
  let glowP, smokeP, lines, linePos, lineMat, motes, motePos, moteMat, moteKind = -1, shadow, shadowMat;
  const LINES = 60, MOTES = 500;

  function init(sc){
    scene = sc;
    glowP = new Particles(1600, SP.Tex.glow(), true); scene.add(glowP.points);
    smokeP = new Particles(500, SP.Tex.smoke(), false); scene.add(smokeP.points);
    linePos = new Float32Array(LINES * 6); const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
    lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    lines = new THREE.LineSegments(lg, lineMat); lines.frustumCulled = false; scene.add(lines);
    // ambient motes around the camera
    motePos = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++){ motePos[i * 3] = rand(-50, 50); motePos[i * 3 + 1] = rand(-30, 30); motePos[i * 3 + 2] = rand(-30, 90); }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(motePos, 3).setUsage(THREE.DynamicDrawUsage));
    moteMat = new THREE.PointsMaterial({ size: .25, map: SP.Tex.glow(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    motes = new THREE.Points(mg, moteMat); motes.frustumCulled = false; scene.add(motes);
    // a soft round shadow on whatever is below (clouds / sea / ground): reads altitude at a glance
    shadowMat = new THREE.MeshBasicMaterial({ map: SP.Tex.glow(), color: 0x1a1430, transparent: true, opacity: 0, depthWrite: false });
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), shadowMat); shadow.renderOrder = 5; scene.add(shadow);
  }
  function setPointScale(px){ pointScale.value = px; }

  // speed lines stream toward the camera along the direction of travel
  const lineDir = new THREE.Vector3(0, 0, 1), tmp = new THREE.Vector3(), side = new THREE.Vector3(), up2 = new THREE.Vector3();
  function resetLine(i, cam, scatter){
    side.crossVectors(lineDir, Math.abs(lineDir.y) > .9 ? tmp.set(1, 0, 0) : tmp.set(0, 1, 0)).normalize(); up2.crossVectors(side, lineDir);
    const a = Math.random() * Math.PI * 2, r = rand(4, 18), d = scatter ? rand(4, 80) : rand(55, 85);
    const x = cam.x + lineDir.x * d + (side.x * Math.cos(a) + up2.x * Math.sin(a)) * r;
    const y = cam.y + lineDir.y * d + (side.y * Math.cos(a) + up2.y * Math.sin(a)) * r;
    const z = cam.z + lineDir.z * d + (side.z * Math.cos(a) + up2.z * Math.sin(a)) * r;
    linePos.set([x, y, z, x, y, z], i * 6);
  }
  let linesInit = false;
  function updateLines(dt, cam, speed, dir){
    if (dir) lineDir.copy(dir).normalize();
    if (!linesInit){ for (let i = 0; i < LINES; i++) resetLine(i, cam, true); linesInit = true; }
    const k = clamp((speed - 24) / 22, 0, 1);
    lineMat.opacity += (k * .5 - lineMat.opacity) * Math.min(1, dt * 4);
    lines.visible = lineMat.opacity > .01;
    if (!lines.visible) return;
    const len = 2 + speed * .12;
    for (let i = 0; i < LINES; i++){
      const o = i * 6;
      tmp.set(linePos[o] - cam.x, linePos[o + 1] - cam.y, linePos[o + 2] - cam.z);
      if (tmp.dot(lineDir) < 1 || tmp.lengthSq() > 120 * 120){ resetLine(i, cam, false); continue; }
      linePos[o + 3] = linePos[o] + lineDir.x * len; linePos[o + 4] = linePos[o + 1] + lineDir.y * len; linePos[o + 5] = linePos[o + 2] + lineDir.z * len;
    }
    lines.geometry.attributes.position.needsUpdate = true;
  }

  /* ---------- emitters ---------- */
  // kind: 0 feather wings (soft white), 1 tailwind (gold), 2 rotors (cyan)
  function wingTrail(x, y, z, vx, vy, vz, kind){ const c = kind === 1 ? C.gold : kind === 2 ? C.cyan : C.trail; glowP.emit(x, y, z, vx * .1, vy * .1 - (kind === 2 ? 1.5 : 0), vz * .1, rand(.5, .9), kind === 1 ? .5 : .32, .05, c[0], c[1], kind ? .8 : .55, 0, .96); }
  function sparkle(x, y, z, col = C.white, n = 1, spread = 1){ for (let i = 0; i < n; i++) glowP.emit(x + rand(-spread, spread), y + rand(-spread, spread), z + rand(-spread, spread), rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(.4, .9), rand(.2, .45), .02, col[0], col[1], .9, 0, .95); }
  function ringBurst(x, y, z, vx, vy, vz, gold){
    const col = gold ? C.gold : C.cyan;
    for (let i = 0; i < (gold ? 60 : 34); i++){ const a = Math.random() * Math.PI * 2, r = rand(2.6, 3.4); glowP.emit(x + Math.cos(a) * r, y + Math.sin(a) * r, z, Math.cos(a) * rand(3, 8) + vx * .6, Math.sin(a) * rand(3, 8) + vy * .6, vz * .6 + rand(-2, 2), rand(.5, 1), rand(.3, .6), .05, col[0], col[1], 1, 0, .94); }
  }
  function starBurst(x, y, z){
    for (let i = 0; i < 80; i++){ const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, s = rand(4, 14); glowP.emit(x, y, z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s, Math.sin(a) * Math.cos(b) * s, rand(.8, 1.6), rand(.4, .8), .05, C.star[0], C.star[1], 1, 2, .95); }
  }
  function thermal(x, y, z, r, t){
    // rising, spiralling motes that show where the warm air lifts
    for (let k = 0; k < 2; k++){ const a = t * 1.3 + Math.random() * Math.PI * 2, rr = r * Math.sqrt(Math.random()); glowP.emit(x + Math.cos(a) * rr, y + rand(-20, 20), z + Math.sin(a) * rr, -Math.sin(a) * 3, rand(6, 10), Math.cos(a) * 3, rand(1.4, 2.2), rand(.4, .7), .1, [1, .9, .6], [1, .6, .4], .55, -1, .99); }
  }
  function splash(x, y, z, vx, vz, big){
    for (let i = 0; i < (big ? 70 : 6); i++) smokeP.emit(x + rand(-1, 1), y, z + rand(-1, 1), vx * .4 + rand(-4, 4), rand(big ? 6 : 1, big ? 16 : 5), vz * .4 + rand(-4, 4), rand(.6, 1.4), rand(.6, 1.2), rand(2, 4), C.spray[0], C.spray[1], .7, 18, .96);
  }
  function cloudPuff(x, y, z, vx, vz){ for (let i = 0; i < 3; i++) smokeP.emit(x + rand(-3, 3), y + rand(-1.5, 1.5), z + rand(-3, 3), vx * .2 + rand(-2, 2), rand(-1, 1), vz * .2 + rand(-2, 2), rand(.8, 1.6), 3, 9, [1, 1, 1], [.95, .95, 1], .45, 0, .96); }
  function crashPoof(x, y, z){
    for (let i = 0; i < 26; i++) smokeP.emit(x, y, z, rand(-6, 6), rand(-2, 6), rand(-6, 6), rand(.6, 1.2), 1, 4, [1, 1, 1], [.9, .9, .95], .7, 2, .93);
    for (let i = 0; i < 30; i++) glowP.emit(x, y, z, rand(-8, 8), rand(-3, 9), rand(-8, 8), rand(.4, .9), .5, .05, [1, .95, .7], [1, .6, .5], 1, 8, .95);
  }
  function feathers(x, y, z){ for (let i = 0; i < 16; i++) smokeP.emit(x, y, z, rand(-5, 5), rand(0, 5), rand(-5, 5), rand(1.2, 2.2), .5, .4, [1, 1, 1], [1, 1, 1], .9, 2, .97); }
  function firework(x, y, z, hue){
    const c = new THREE.Color().setHSL(hue, 1, .6), cc = [c.r, c.g, c.b];
    for (let i = 0; i < 90; i++){ const a = Math.random() * Math.PI * 2, b = Math.acos(rand(-1, 1)), s = rand(14, 22); glowP.emit(x, y, z, Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s, rand(1.2, 2), .9, .1, cc, [1, .85, .6], 1, 5, .96); }
  }
  function confetti(x, y, z){ const cols = [[1, .4, .5], [1, .85, .3], [.4, .8, 1], [.5, 1, .7], [1, 1, 1]]; for (let i = 0; i < 60; i++){ const c = cols[i % 5]; glowP.emit(x + rand(-2, 2), y + rand(0, 2), z + rand(-2, 2), rand(-7, 7), rand(3, 11), rand(-7, 7), rand(1.4, 2.4), .35, .3, c, c, 1, 6, .96); } }

  /* ---------- ambient motes: dandelion fluff / petals / spray / stardust ---------- */
  const MOTE_KIND = [
    { col: 0xfff2c8, size: .22, op: .7, fall: -.3 },   // the hill: dandelion fluff, drifting up
    { col: 0xffffff, size: .18, op: .45, fall: .2 },   // clouds: ice glitter
    { col: 0xffc8de, size: .3, op: .6, fall: .8 },     // sky city: petals
    { col: 0xffe0b0, size: .16, op: .35, fall: .1 },   // sunset sea: sea spray in the light
    { col: 0xb8d0ff, size: .2, op: .9, fall: 0 },      // stars: stardust
  ];
  function setMotes(k){ if (k === moteKind) return; moteKind = k; const M = MOTE_KIND[k]; moteMat.color.setHex(M.col); moteMat.size = M.size; }
  function updateMotes(dt, cam, t){
    const M = MOTE_KIND[Math.max(0, moteKind)];
    moteMat.opacity += (M.op - moteMat.opacity) * Math.min(1, dt * 2);
    for (let i = 0; i < MOTES; i++){
      const o = i * 3;
      motePos[o] += Math.sin(t * .7 + i) * dt * .6; motePos[o + 1] -= M.fall * dt * (1 + (i % 5) * .2);
      let dx = motePos[o] - cam.x, dy = motePos[o + 1] - cam.y, dz = motePos[o + 2] - cam.z;
      if (dx > 50) motePos[o] -= 100; else if (dx < -50) motePos[o] += 100;
      if (dy > 30) motePos[o + 1] -= 60; else if (dy < -30) motePos[o + 1] += 60;
      if (dz > 90) motePos[o + 2] -= 120; else if (dz < -30) motePos[o + 2] += 120;
    }
    motes.geometry.attributes.position.needsUpdate = true;
  }
  function setShadow(x, y, z, height, visible, slope = 0){
    shadow.visible = visible && height < 70;
    if (!shadow.visible) return;
    shadow.position.set(x, y + .2, z); shadow.rotation.x = -slope;
    const s = 1 + height * .03; shadow.scale.set(s, 1, s);
    shadowMat.opacity = clamp(.55 - height / 120, 0, .55);
  }

  function update(dt, cam, speed, dir, t){ glowP.update(dt); smokeP.update(dt); updateLines(dt, cam, speed, dir); updateMotes(dt, cam, t); }
  function clear(){ glowP.clear(); smokeP.clear(); }
  function stats(){ return { glow: glowP.alive, smoke: smokeP.alive }; }

  return { init, setPointScale, update, clear, stats, wingTrail, sparkle, ringBurst, starBurst, thermal, splash, cloudPuff, crashPoof, feathers, firework, confetti, setMotes, setShadow, C };
})();
