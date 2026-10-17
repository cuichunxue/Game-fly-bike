/* ============================================================
 * Sky Pedal — 3D models (all procedural geometry, no files)
 * 自転車＋ライダー（ペダルに追従する脚のIK）・羽・マフラー、
 * 鳥の群れ、浮島、塔、飛行船、灯台、クジラ、月 など。
 * ============================================================ */
window.SP = window.SP || {};
SP.Models = (() => {
  'use strict';
  const T = SP.Tex;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const UPY = V3(0, 1, 0);

  const PAINTS = {
    sky:       { name: 'そら',       frame: 0x5ab8ff, scarf: 0xffd84a, wing: 0xfff2d8, helmet: 0xffffff, shirt: 0xff8a5a },
    cherry:    { name: 'さくらんぼ', frame: 0xe8304a, scarf: 0xfff4ea, wing: 0xffe0e6, helmet: 0xe8304a, shirt: 0x2f5aa8 },
    mint:      { name: 'ミント',     frame: 0x3cd6a8, scarf: 0xff6f9e, wing: 0xe2fff4, helmet: 0xffffff, shirt: 0xffc94a },
    sunflower: { name: 'ひまわり',   frame: 0xffc21a, scarf: 0x2f7cff, wing: 0xfff6c8, helmet: 0x2f7cff, shirt: 0xffffff },
    night:     { name: 'よぞら',     frame: 0x283a78, scarf: 0xff5fa8, wing: 0xe0e4ff, helmet: 0x283a78, shirt: 0x7cffe6 },
  };

  let M = null;
  function mats(){
    if (M) return M;
    const glow = T.glow();
    M = {
      metal: new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: .9, roughness: .25, envMapIntensity: 1.2 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x23252b, metalness: .3, roughness: .6 }),
      tire: new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: .85 }),
      leather: new THREE.MeshStandardMaterial({ color: 0x6a3a22, roughness: .6 }),
      wicker: new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: .8 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xffd2b0, roughness: .7 }),
      pants: new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: .8 }),
      shoe: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: .6 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: .8 }),
      goggle: new THREE.MeshStandardMaterial({ color: 0x9fe8ff, metalness: .6, roughness: .1, emissive: 0x2a6a8a, emissiveIntensity: .4 }),
      grass: new THREE.MeshStandardMaterial({ map: T.grass(), roughness: .95 }),
      rock: new THREE.MeshStandardMaterial({ map: T.rock(), roughness: .95, flatShading: true }),
      rockDark: new THREE.MeshStandardMaterial({ color: 0x5a4a48, roughness: .95, flatShading: true }),
      road: new THREE.MeshStandardMaterial({ map: T.road(), roughness: .95 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x4aa83a, roughness: .9, flatShading: true }),
      leaf2: new THREE.MeshStandardMaterial({ color: 0x7ac84a, roughness: .9, flatShading: true }),
      blossom: new THREE.MeshStandardMaterial({ color: 0xffb6d0, roughness: .9, flatShading: true }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: .9 }),
      wall: [0, 1, 2].map(v => new THREE.MeshStandardMaterial({ map: T.wall(v), roughness: .85 })),
      white: new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: .7 }),
      roof: [0xe8604a, 0x3a8ad8, 0x4ac0a0, 0xf2b23a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .6, flatShading: true })),
      gold: new THREE.MeshStandardMaterial({ color: 0xffd36a, metalness: 1, roughness: .25, emissive: 0xffa020, emissiveIntensity: .6, envMapIntensity: 1.5 }),
      sail: new THREE.MeshStandardMaterial({ color: 0xfff8ee, roughness: .8, side: THREE.DoubleSide }),
      hull: new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: .7 }),
      balloon: new THREE.MeshStandardMaterial({ color: 0xf4e4c8, roughness: .7 }),
      whale: new THREE.MeshStandardMaterial({ color: 0x2c3e58, roughness: .5, metalness: .1 }),
      whaleBelly: new THREE.MeshStandardMaterial({ color: 0xdfe6ee, roughness: .6 }),
      lampGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(3) }),
      ringMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0x22c8ff).multiplyScalar(1.5), fog: false }),
      ringGold: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa818).multiplyScalar(1.9), fog: false }),
      ringGlow: new THREE.MeshBasicMaterial({ color: 0x6ae0ff, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      ringGlowGold: new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      ringDone: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3), transparent: true, opacity: .6 }),
      starMat: new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffb020, emissiveIntensity: 1.6, metalness: .6, roughness: .3 }),
      asteroid: new THREE.MeshStandardMaterial({ color: 0x4a4458, roughness: .9, flatShading: true, emissive: 0x2a1a4a, emissiveIntensity: .4 }),
      glowSprite: new THREE.SpriteMaterial({ map: glow, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    return M;
  }
  function tube(a, b, r, mat, seg = 8){
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
    m.position.copy(a).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(UPY, d.normalize());
    return m;
  }
  // point a unit-height cylinder from a to b (reused every frame for the rider's limbs)
  function aimLimb(mesh, a, b){
    const d = tmpD.subVectors(b, a), len = d.length();
    mesh.position.copy(a).addScaledVector(d, .5); mesh.quaternion.setFromUnitVectors(UPY, d.multiplyScalar(1 / Math.max(1e-4, len))); mesh.scale.set(1, len, 1);
  }
  const tmpD = new THREE.Vector3();
  function limb(r, mat){ const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, 1 - r * 2 > 0 ? 1 - r * 2 : .01, 4, 8), mat); m.castShadow = false; return m; }

  /* ---------- the flying bicycle ---------- */
  function wheel(R){
    const Mt = mats(), g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(R, .035, 8, 40), Mt.tire); tire.rotation.y = Math.PI / 2; g.add(tire);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - .04, .012, 6, 40), Mt.metal); rim.rotation.y = Math.PI / 2; g.add(rim);
    const pts = []; for (let k = 0; k < 16; k++){ const a = k / 16 * Math.PI * 2, s = k % 2 ? .02 : -.02; pts.push(s, 0, 0, 0, Math.cos(a) * (R - .04), Math.sin(a) * (R - .04)); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xcfd6de, transparent: true, opacity: .8 })));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .1, 10).rotateZ(Math.PI / 2), Mt.metal); g.add(hub);
    return g;
  }
  function wingGroup(side, col){
    // a fan of feathers; the group's pivot sits on the frame below the saddle
    const g = new THREE.Group(), fan = new THREE.Group(); g.add(fan);
    const mat = new THREE.MeshStandardMaterial({ map: T.feather(), color: col, transparent: true, alphaTest: .25, side: THREE.DoubleSide, roughness: .6, emissive: col, emissiveIntensity: .12, depthWrite: true });
    const N = 6;
    for (let i = 0; i < N; i++){
      const len = .8 + Math.sin((i + 1) / (N + 1) * Math.PI) * .55, w = .46;
      const geo = new THREE.PlaneGeometry(w, len); geo.translate(0, len / 2, 0); geo.rotateX(-Math.PI / 2); // feather points along -z.. then rotated
      const f = new THREE.Mesh(geo, mat);
      f.rotation.y = -side * (Math.PI / 2 + .3 - i * .24);  // fan outward, front feather first
      f.rotation.z = side * .08 * i;
      f.position.set(0, i * .006, -i * .05);
      fan.add(f);
    }
    g.userData = { fan, mat };
    return g;
  }
  function bicycle(paintKey){
    const Mt = mats(), P = PAINTS[paintKey] || PAINTS.sky;
    const root = new THREE.Group(), inner = new THREE.Group(); root.add(inner);
    const frameMat = new THREE.MeshStandardMaterial({ color: P.frame, metalness: .35, roughness: .3, envMapIntensity: 1.3 }); frameMat.userData.noFold = true;
    const R = .34;
    // key points (side view, x = 0 plane), bike faces +z
    const rearHub = V3(0, R, -.52), frontHub = V3(0, R, .56);
    const bb = V3(0, .3, -.06), seatTop = V3(0, .86, -.22), headTop = V3(0, .9, .38), headBot = V3(0, .7, .44);
    const F = new THREE.Group(); inner.add(F);
    [[bb, seatTop, .026], [seatTop, headTop, .022], [bb, headBot, .028], [bb, V3(.06, R, -.5), .016], [bb, V3(-.06, R, -.5), .016],
     [seatTop, V3(.06, R, -.5), .014], [seatTop, V3(-.06, R, -.5), .014]].forEach(([a, b, r]) => F.add(tube(a, b, r, frameMat)));
    F.add(tube(headBot, headTop, .03, frameMat));
    // fork
    F.add(tube(headBot, V3(.06, R, .56), .016, Mt.metal)); F.add(tube(headBot, V3(-.06, R, .56), .016, Mt.metal));
    // handlebar
    const bar = new THREE.Group(); bar.position.copy(headTop).add(V3(0, .1, -.02)); F.add(bar);
    bar.add(tube(V3(0, -.1, 0), V3(0, 0, 0), .016, Mt.metal));
    bar.add(tube(V3(-.28, .02, -.08), V3(.28, .02, -.08), .014, Mt.metal));
    bar.add(tube(V3(-.28, .02, -.08), V3(0, 0, 0), .014, Mt.metal)); bar.add(tube(V3(.28, .02, -.08), V3(0, 0, 0), .014, Mt.metal));
    [-1, 1].forEach(s => { const gr = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .1, 8).rotateZ(Math.PI / 2), Mt.dark); gr.position.set(s * .3, .02, -.08); bar.add(gr); });
    const bellM = new THREE.Mesh(new THREE.SphereGeometry(.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), Mt.metal); bellM.position.set(.18, .04, -.06); bar.add(bellM);
    // headlamp
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.04, .03, .07, 10).rotateX(Math.PI / 2), Mt.metal); lamp.position.set(0, -.04, .06); bar.add(lamp);
    const lampG = new THREE.Mesh(new THREE.CircleGeometry(.032, 12), Mt.lampGlow); lampG.position.set(0, -.04, .096); bar.add(lampG);
    // basket with flowers
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(.17, .13, .17, 12, 1, true), Mt.wicker); basket.material.side = THREE.DoubleSide;
    basket.position.set(0, -.02, .2); bar.add(basket);
    [0xff6f9e, 0xffd84a, 0xffffff, 0x9fd0ff, 0xff8a5a].forEach((c, i) => { const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(.045, 0), new THREE.MeshStandardMaterial({ color: c, roughness: .7, flatShading: true })); const a = i / 5 * Math.PI * 2; fl.position.set(Math.cos(a) * .08, .1, .2 + Math.sin(a) * .08); bar.add(fl); });
    // saddle
    const seat = new THREE.Mesh(new THREE.BoxGeometry(.14, .05, .26), Mt.leather); seat.position.copy(seatTop).add(V3(0, .06, -.02)); F.add(seat);
    F.add(tube(seatTop, V3(0, .9, -.24), .014, Mt.metal));
    // wheels
    const rearW = wheel(R), frontW = wheel(R); rearW.position.copy(rearHub); frontW.position.copy(frontHub); inner.add(rearW, frontW);
    // fenders (mudguards)
    const fenderMat = frameMat.clone(); fenderMat.side = THREE.DoubleSide; fenderMat.userData.noFold = true;
    [rearHub, frontHub].forEach((h, i) => { const fg = new THREE.Mesh(new THREE.CylinderGeometry(R + .05, R + .05, .07, 20, 1, true, i ? -.4 : .8, 2.2), fenderMat); fg.rotation.z = Math.PI / 2; fg.position.copy(h); inner.add(fg); });
    // crank + pedals
    const crank = new THREE.Group(); crank.position.copy(bb); inner.add(crank);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.1, .012, 6, 24), Mt.metal); ring.rotation.y = Math.PI / 2; ring.position.x = .05; crank.add(ring);
    const pedals = [];
    [1, -1].forEach(s => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.02, .02, .17), Mt.metal); arm.position.set(s * .07, 0, s * .075); crank.add(arm);
      const ped = new THREE.Mesh(new THREE.BoxGeometry(.09, .02, .06), Mt.dark); ped.position.set(s * .11, 0, s * .16); crank.add(ped); pedals.push(ped);
    });
    // chain (a flat loop)
    F.add(tube(V3(.05, .4, -.06), V3(.05, R + .04, -.52), .006, Mt.dark)); F.add(tube(V3(.05, .2, -.06), V3(.05, R - .04, -.52), .006, Mt.dark));

    // wings (pivot below the saddle)
    const wings = [-1, 1].map(s => { const w = wingGroup(s, P.wing); w.position.set(s * .08, .62, -.2); inner.add(w); return w; });

    // rider (built once; limbs re-aimed every frame)
    const rider = new THREE.Group(); inner.add(rider);
    const shirt = new THREE.MeshStandardMaterial({ color: P.shirt, roughness: .75 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.14, .26, 4, 10), shirt); rider.add(torso);
    const head = new THREE.Group(); rider.add(head);
    head.add(new THREE.Mesh(new THREE.SphereGeometry(.13, 16, 12), Mt.skin));
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(.145, 16, 10, 0, Math.PI * 2, 0, Math.PI * .55), new THREE.MeshStandardMaterial({ color: P.helmet, roughness: .35, metalness: .1 }));
    helmet.position.y = .015; head.add(helmet);
    const gog = new THREE.Mesh(new THREE.TorusGeometry(.12, .025, 6, 16, Math.PI), Mt.goggle); gog.rotation.set(0, 0, 0); gog.position.set(0, .03, .03); gog.rotation.x = -.2; head.add(gog);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8, 0, Math.PI * 2, Math.PI * .45, Math.PI * .3), Mt.hair); hairM.position.set(0, -.01, -.03); head.add(hairM);
    const thighs = [limb(.06, Mt.pants), limb(.06, Mt.pants)], shins = [limb(.05, Mt.pants), limb(.05, Mt.pants)];
    const feet = [0, 1].map(() => new THREE.Mesh(new THREE.BoxGeometry(.08, .06, .16), Mt.shoe));
    const uarms = [limb(.045, shirt), limb(.045, shirt)], farms = [limb(.04, Mt.skin), limb(.04, Mt.skin)];
    rider.add(...thighs, ...shins, ...feet, ...uarms, ...farms);

    // merge the static sub-assemblies: ~75 draw calls down to ~30
    [F, bar, rearW, frontW, crank, head, ...wings.map(w => w.userData.fan)].forEach(bake);
    const scarfCol = new THREE.Color(P.scarf);
    root.userData = { inner, rearW, frontW, crank, pedals, wings, bar, rider, torso, head, thighs, shins, feet, uarms, farms, frameMat, fenderMat, scarfCol, R,
      hip: V3(0, 1.0, -.2), shoulder: V3(0, 1.38, -.02), grip: [V3(.3, 1.02, .28), V3(-.3, 1.02, .28)], paint: paintKey };
    return root;
  }
  // pose the rider: legs follow the pedals (2-bone IK in the side plane), arms reach the grips
  const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tK = new THREE.Vector3(), tE = new THREE.Vector3();
  function poseRider(bike, crankAngle, lean, steer, cheer = 0){
    const U = bike.userData;
    U.crank.rotation.x = crankAngle;
    const L1 = .46, L2 = .45;
    for (let i = 0; i < 2; i++){
      const s = i ? -1 : 1;
      const a = crankAngle + (i ? Math.PI : 0);
      // pedal position in bike space
      tB.set(s * .13, .3 - Math.sin(a) * .17, -.06 + Math.cos(a) * .17);
      tA.set(s * .1, U.hip.y, U.hip.z + lean * .05);
      // knee: circle-circle intersection in the (z,y) plane, bending forward
      const dz = tB.z - tA.z, dy = tB.y - tA.y, d = Math.min(L1 + L2 - .001, Math.hypot(dz, dy));
      const aa = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - aa * aa));
      const mz = tA.z + dz * aa / d, my = tA.y + dy * aa / d;
      tK.set(s * .12, my + (dz / d) * h, mz - (dy / d) * h);
      if (tK.z < tA.z) tK.set(s * .12, my - (dz / d) * h, mz + (dy / d) * h);
      aimLimb(U.thighs[i], tA, tK); aimLimb(U.shins[i], tK, tB);
      U.feet[i].position.set(tB.x, tB.y + .03, tB.z + .02);
    }
    // torso leans into the bars; sits up and waves when cheering
    const sh = tE.set(0, U.shoulder.y - cheer * -.05, U.shoulder.z + lean * .1 - cheer * .1);
    tA.set(0, U.hip.y + .05, U.hip.z + .02);
    aimLimb(U.torso, tA, sh); U.torso.scale.set(1, 1, 1); U.torso.position.copy(tA).lerp(sh, .5);
    U.head.position.set(0, sh.y + .2, sh.z + .06); U.head.rotation.set(-.1 + lean * .1, steer * .35, steer * -.15);
    for (let i = 0; i < 2; i++){
      const s = i ? -1 : 1;
      tA.set(s * .17, sh.y - .03, sh.z);
      if (cheer > .01 && i === 0){
        tB.set(s * .32, sh.y + .5 * cheer + .05, sh.z + .05);
      } else {
        tB.copy(U.grip[i]); tB.z += steer * s * -.05;
      }
      tK.copy(tA).lerp(tB, .5); tK.x += s * .08; tK.y -= .04;
      aimLimb(U.uarms[i], tA, tK); aimLimb(U.farms[i], tK, tB);
    }
    U.bar.rotation.y = steer * .3;
  }
  function setPaint(bike, key){
    const P = PAINTS[key] || PAINTS.sky, U = bike.userData;
    U.frameMat.color.setHex(P.frame); U.fenderMat.color.setHex(P.frame); U.scarfCol.setHex(P.scarf);
    U.wings.forEach(w => { w.userData.mat.color.setHex(P.wing); w.userData.mat.emissive.setHex(P.wing); });
    U.torso.material.color.setHex(P.shirt); U.paint = key;
  }

  /* ---------- scarf: a ribbon that trails in the wind (world space) ---------- */
  function scarf(color){
    const N = 12, pos = new Float32Array(N * 2 * 3), idx = [];
    for (let i = 0; i < N - 1; i++){ const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: .7, emissive: color, emissiveIntensity: .15 });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
    const pts = [], prev = [];
    for (let i = 0; i < N; i++){ pts.push(new THREE.Vector3()); prev.push(new THREE.Vector3()); }
    return { mesh, pts, prev, N, mat, init: false };
  }

  /* ---------- birds: instanced bodies + wings (3 draw calls for the whole sky) ---------- */
  function birds(max){
    const body = new THREE.SphereGeometry(.22, 8, 6); body.scale(.8, .7, 1.8);
    const head = new THREE.SphereGeometry(.13, 6, 5); head.translate(0, .06, .38);
    const bodyG = THREE.BufferGeometryUtils.mergeBufferGeometries([body.toNonIndexed(), head.toNonIndexed()]);
    const wingG = new THREE.BufferGeometry();
    wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .18, .95, 0, -.05, 0, 0, -.22, .95, 0, -.05, .6, 0, -.3, 0, 0, -.22], 3)); wingG.computeVertexNormals();
    const bm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7 });
    const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .7, side: THREE.DoubleSide });
    const B = new THREE.InstancedMesh(bodyG, bm, max), WL = new THREE.InstancedMesh(wingG, wm, max), WR = new THREE.InstancedMesh(wingG, wm, max);
    [B, WL, WR].forEach(m => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; });
    const grp = new THREE.Group(); grp.add(B, WL, WR);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qw = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), off = new THREE.Vector3();
    const col = new THREE.Color();
    return {
      group: grp, max,
      set(i, x, y, z, yaw, pitch, roll, flap, scale = 1, color = 0xffffff){
        q.setFromEuler(e.set(-pitch, yaw, roll, 'YXZ'));
        s.set(scale, scale, scale); p.set(x, y, z);
        m4.compose(p, q, s); B.setMatrixAt(i, m4);
        col.setHex(color); B.setColorAt(i, col); WL.setColorAt(i, col); WR.setColorAt(i, col);
        qw.setFromEuler(e.set(0, 0, flap)); qw.premultiply(q); off.set(.12 * scale, .05 * scale, 0).applyQuaternion(q);
        m4.compose(p.set(x, y, z).add(off), qw, s); WL.setMatrixAt(i, m4);
        // right wing: the same wing mirrored in x
        qw.setFromEuler(e.set(0, 0, -flap)); qw.premultiply(q);
        off.set(-.12 * scale, .05 * scale, 0).applyQuaternion(q);
        s.set(-scale, scale, scale); m4.compose(p.set(x, y, z).add(off), qw, s); WR.setMatrixAt(i, m4);
      },
      commit(n){ [B, WL, WR].forEach(m => { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }); },
    };
  }

  /* ---------- collectibles ---------- */
  function ring(gold){
    const Mt = mats(), g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.TorusGeometry(gold ? 3.4 : 3.2, gold ? .3 : .24, 10, 48), gold ? Mt.ringGold : Mt.ringMat); g.add(t);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(gold ? 2.85 : 2.7, .05, 4, 48), gold ? Mt.ringGold : Mt.ringMat); g.add(inner);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(gold ? 3.3 : 3.1, 40), gold ? Mt.ringGlowGold : Mt.ringGlow); disc.renderOrder = 3; g.add(disc);
    g.userData = { torus: t, inner, disc };
    return g;
  }
  function starCoin(){
    const Mt = mats(), sh = new THREE.Shape();
    for (let i = 0; i < 10; i++){ const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? .45 : 1.05; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: .28, bevelEnabled: true, bevelThickness: .12, bevelSize: .1, bevelSegments: 2 }); geo.center();
    const m = new THREE.Mesh(geo, Mt.starMat), g = new THREE.Group(); g.add(m);
    const s = new THREE.Sprite(Mt.glowSprite.clone()); s.material.color.setHex(0xffc84a); s.scale.set(6, 6, 1); g.add(s);
    return g;
  }

  /* ---------- scenery ---------- */
  function displace(geo, amt, seed, freq = .2){
    const N = T.makeNoise(seed), p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++){
      v.fromBufferAttribute(p, i); const n = N.noise(v.x * freq + 50, v.y * freq + v.z * freq * .7 + 50, 256, 256) - .5;
      const l = v.length() || 1; v.multiplyScalar(1 + n * amt / l * 2); p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals(); return geo;
  }
  function tree(kind = 0){
    const Mt = mats(), g = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(.18, .26, 2.2, 6), Mt.trunk); tr.position.y = 1.1; g.add(tr);
    if (kind === 0){ const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), Mt.leaf); c.position.y = 3; c.scale.y = 1.1; g.add(c); }
    else if (kind === 1){ [0, 1, 2].forEach(k => { const c = new THREE.Mesh(new THREE.ConeGeometry(1.5 - k * .35, 1.8, 7), Mt.leaf2); c.position.y = 2.2 + k * 1.1; g.add(c); }); }
    else { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), Mt.blossom); c.position.y = 3; g.add(c); }
    return g;
  }
  function house(v = 0, w = 4, h = 4, d = 4){
    const Mt = mats(), g = new THREE.Group();
    const geo = new THREE.BoxGeometry(w, h, d); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 6, uv.getY(i) * h / 10);
    const b = new THREE.Mesh(geo, Mt.wall[v % 3]); b.position.y = h / 2; g.add(b);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * .78, h * .55, 4), Mt.roof[v % 4]); roof.rotation.y = Math.PI / 4; roof.position.y = h + h * .27; g.add(roof);
    return g;
  }
  function tower(v = 0, r = 3, h = 30){
    const Mt = mats(), g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(r * .9, r, h, 14); const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 1.2, uv.getY(i) * h / 10);
    const b = new THREE.Mesh(geo, Mt.wall[v % 3]); b.position.y = h / 2; g.add(b);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, .8, 14), Mt.white); band.position.y = h - .4; g.add(band);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.25, r * 2.6, 14), Mt.roof[v % 4]); roof.position.y = h + r * 1.3; g.add(roof);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .8), new THREE.MeshStandardMaterial({ color: [0xff5f6a, 0xffd84a, 0x5ab8ff][v % 3], side: THREE.DoubleSide })); flag.position.set(.7, h + r * 2.6 + .6, 0); g.add(flag);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.8), Mt.metal); pole.position.y = h + r * 2.6 + .5; g.add(pole);
    g.userData.flag = flag; flag.userData.keep = true;
    return g;
  }
  // a floating island: grassy top, an inverted rocky cone, optional waterfall and buildings
  function island(R, seed, opts = {}){
    const Mt = mats(), g = new THREE.Group(), rnd = T.mulberry32(seed);
    const top = new THREE.Mesh(displace(new THREE.CylinderGeometry(R, R * .96, 2.2, 18, 1), .5, seed, .3), Mt.grass); top.position.y = -1.1; g.add(top);
    const coneH = R * (1.1 + rnd() * .5);
    const cone = new THREE.Mesh(displace(new THREE.ConeGeometry(R * .97, coneH, 14, 4).rotateX(Math.PI), R * .14, seed + 1, .25), Mt.rock); cone.position.y = -2.2 - coneH / 2; g.add(cone);
    const nTrees = opts.trees ?? Math.round(R / 3);
    for (let i = 0; i < nTrees; i++){ const a = rnd() * Math.PI * 2, r = R * (.35 + rnd() * .55); const t = tree(rnd() < .3 ? 2 : rnd() < .5 ? 1 : 0); t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); t.scale.setScalar(.7 + rnd() * .6); g.add(t); }
    if (opts.houses){ for (let i = 0; i < opts.houses; i++){ const a = rnd() * Math.PI * 2, r = R * rnd() * .45; const hh = house((seed + i) % 4, 3 + rnd() * 2, 3 + rnd() * 3, 3 + rnd() * 2); hh.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); hh.rotation.y = rnd() * 6; g.add(hh); } }
    g.userData = { R, coneH };
    return g;
  }
  // a waterfall pouring off an island's rim (scrolling shader)
  const fallUniforms = { time: { value: 0 } };
  function waterfall(w, h){
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { time: fallUniforms.time },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform float time; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          float x = vUv.x, y = vUv.y;
          float streak = h(vec2(floor(x*40.), 0.));
          float flow = fract(y*3. + time*(1.2 + streak) + streak*5.);
          float a = (.45 + .55*smoothstep(.0, .5, flow)) * smoothstep(0., .15, x) * smoothstep(1., .85, x) * smoothstep(0., .35, y);
          vec3 c = mix(vec3(.75,.9,1.), vec3(1.), flow);
          gl_FragColor = vec4(c*1.2, a*.75);
        }`
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1), mat); m.renderOrder = 3;
    return m;
  }
  function airship(){
    const Mt = mats(), g = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(4, 20, 14), new THREE.MeshStandardMaterial({ color: 0xff8a5a, roughness: .55 })); env.scale.set(1, 1, 2.6); g.add(env);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(4.05, 4.05, 1.2, 20, 1, true), Mt.white); stripe.rotation.x = Math.PI / 2; stripe.scale.set(1, 1, 1); g.add(stripe);
    const gond = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 5), Mt.hull); gond.position.y = -4.6; g.add(gond);
    [-1, 1].forEach(s => { g.add(tube(V3(s * .8, -3.8, 1.5), V3(s * .8, -2.6, 1.5), .06, Mt.dark)); g.add(tube(V3(s * .8, -3.8, -1.5), V3(s * .8, -2.6, -1.5), .06, Mt.dark)); });
    [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]].forEach(([x, y]) => { const fin = new THREE.Mesh(new THREE.BoxGeometry(x ? 3 : .2, y ? 3 : .2, 2.6), Mt.white); fin.position.set(x * 2.4, y * 2.4, -9.2); g.add(fin); });
    const prop = new THREE.Group(); prop.position.set(0, -4.6, -3.2); g.add(prop);
    [0, 1].forEach(k => { const b = new THREE.Mesh(new THREE.BoxGeometry(.25, 2.6, .08), Mt.dark); b.rotation.z = k * Math.PI / 2; prop.add(b); });
    const lights = new THREE.Mesh(new THREE.SphereGeometry(.25, 6, 4), Mt.lampGlow); lights.position.set(0, -5.5, 2.5); g.add(lights);
    g.userData = { prop }; prop.userData.keep = true;
    return g;
  }
  function windmill(){
    const Mt = mats(), g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 9, 10), Mt.wall[0]); b.position.y = 4.5; g.add(b);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.6, 10), Mt.roof[0]); roof.position.y = 10.3; g.add(roof);
    const hub = new THREE.Group(); hub.position.set(0, 8.4, 2); g.add(hub);
    for (let k = 0; k < 4; k++){ const bl = new THREE.Mesh(new THREE.BoxGeometry(.9, 6, .1), Mt.sail); bl.position.y = 3; const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; arm.add(bl); hub.add(arm); }
    g.userData = { hub }; hub.userData.keep = true;
    return g;
  }
  function lighthouse(){
    const Mt = mats(), g = new THREE.Group();
    const rock = new THREE.Mesh(displace(new THREE.IcosahedronGeometry(9, 1), 2, 7, .3), Mt.rock); rock.scale.y = .55; g.add(rock);
    for (let k = 0; k < 5; k++){ const s = new THREE.Mesh(new THREE.CylinderGeometry(2.3 - k * .2, 2.5 - k * .2, 4, 14), k % 2 ? Mt.white : Mt.roof[0]); s.position.y = 4 + k * 4; g.add(s); }
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2, 12), Mt.lampGlow); lamp.position.y = 25; g.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2, 12), Mt.dark); cap.position.y = 27; g.add(cap);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 70, 16, 1, true).rotateZ(Math.PI / 2).translate(35, 0, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const beamG = new THREE.Group(); beamG.position.y = 25; beamG.add(beam); g.add(beamG);
    g.userData = { beam: beamG }; beamG.userData.keep = true;
    return g;
  }
  function seaStack(seed, h){
    const Mt = mats();
    const geo = displace(new THREE.CylinderGeometry(h * .16, h * .26, h, 10, 6), h * .05, seed, .15);
    const m = new THREE.Mesh(geo, Mt.rock); m.position.y = h / 2;
    const g = new THREE.Group(); g.add(m);
    const top = new THREE.Mesh(new THREE.SphereGeometry(h * .17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), Mt.grass); top.position.y = h - .5; top.scale.y = .4; g.add(top);
    return g;
  }
  function seaArch(span, h){
    const Mt = mats(), g = new THREE.Group();
    [-1, 1].forEach((s, i) => { const p = new THREE.Mesh(displace(new THREE.CylinderGeometry(5, 7, h, 9, 5), 1.4, 30 + i, .2), Mt.rock); p.position.set(s * (span / 2 + 5), h / 2, 0); g.add(p); });
    const top = new THREE.Mesh(displace(new THREE.BoxGeometry(span + 22, 8, 10, 8, 2, 2), 1.4, 33, .2), Mt.rock); top.position.y = h + 2; g.add(top);
    const gr = new THREE.Mesh(new THREE.BoxGeometry(span + 18, 1, 8), Mt.grass); gr.position.y = h + 6.3; g.add(gr);
    return g;
  }
  function sailboat(){
    const Mt = mats(), g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.2, .6, 7, 8, 1).rotateX(Math.PI / 2), Mt.hull); hull.scale.x = 1.3; hull.position.y = .3; g.add(hull);
    g.add(tube(V3(0, .5, .5), V3(0, 11, .5), .1, Mt.trunk));
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, 9.5); sh.lineTo(4.2, .4); sh.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sh), Mt.sail); sail.rotation.y = -Math.PI / 2; sail.position.set(0, 1, .6); g.add(sail);
    return g;
  }
  function whale(){
    const Mt = mats(), g = new THREE.Group();
    const pts = []; for (let i = 0; i <= 16; i++){ const t = i / 16; pts.push(new THREE.Vector2(Math.sin(t * Math.PI) ** .7 * 3.2 * (1 - t * .35), (t - .5) * 22)); }
    const geo = new THREE.LatheGeometry(pts, 16); geo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(geo, Mt.whale); body.scale.set(1, .8, 1); g.add(body);
    const belly = new THREE.Mesh(geo, Mt.whaleBelly); belly.scale.set(.92, .7, .96); belly.position.y = -.5; g.add(belly);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(8, .3, 2.4), Mt.whale); tail.position.z = -11; g.add(tail);
    [-1, 1].forEach(s => { const fin = new THREE.Mesh(new THREE.BoxGeometry(4.5, .25, 1.6), Mt.whale); fin.position.set(s * 3.4, -1.4, 4); fin.rotation.z = s * -.5; g.add(fin); });
    return g;
  }
  function asteroid(seed, r){
    const m = new THREE.Mesh(displace(new THREE.IcosahedronGeometry(r, 1), r * .35, seed, .5), mats().asteroid);
    return m;
  }
  function moon(R){
    const mat = new THREE.MeshBasicMaterial({ map: T.moon(), fog: false, color: new THREE.Color(1.6, 1.55, 1.45) });
    const m = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), mat);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow(), color: 0x9ab8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: .55 }));
    halo.scale.set(R * 4.2, R * 4.2, 1); m.add(halo);
    return m;
  }
  function goalGate(){
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c8).multiplyScalar(3), transparent: true, opacity: .9 });
    const t = new THREE.Mesh(new THREE.TorusGeometry(14, .5, 10, 80), mat); g.add(t);
    for (let k = 0; k < 3; k++){ const r = new THREE.Mesh(new THREE.TorusGeometry(16 + k * 3, .12, 4, 80), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd8ff).multiplyScalar(2), transparent: true, opacity: .5 - k * .12 })); g.add(r); }
    return g;
  }

  /* ---------- bake: merge an object's static meshes per material (fewer draw calls on phones) ---------- */
  // plain coloured materials fold into one shared vertex-colour material
  const _m = new THREE.Matrix4(), VC = {};
  function vcMat(flat){ return VC[flat] || (VC[flat] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, flatShading: flat })); }
  const plain = m => m.isMeshStandardMaterial && !m.userData.noFold && !m.map && !m.transparent && !m.vertexColors && m.metalness < .5 && m.emissive.getHex() === 0 && m.side === THREE.FrontSide;
  function bake(root){
    root.updateMatrixWorld(true);
    _m.copy(root.matrixWorld).invert();
    const groups = new Map(), drop = [];
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.keep) return;
      for (let p = o.parent; p && p !== root; p = p.parent) if (p.userData.keep) return;
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(_m, o.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      let mat = o.material;
      if (plain(mat)){
        const n = g.attributes.position.count, c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++){ c[i * 3] = mat.color.r; c[i * 3 + 1] = mat.color.g; c[i * 3 + 2] = mat.color.b; }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3)); mat = vcMat(!!mat.flatShading);
      }
      if (!groups.has(mat)) groups.set(mat, []);
      groups.get(mat).push(g); drop.push(o);
    });
    drop.forEach(o => { o.parent.remove(o); o.geometry.dispose(); });
    for (const [mat, list] of groups){
      const merged = list.length > 1 ? THREE.BufferGeometryUtils.mergeBufferGeometries(list) : list[0];
      if (list.length > 1) list.forEach(g => g.dispose());
      if (merged){ const m = new THREE.Mesh(merged, mat); root.add(m); }
    }
    return root;
  }

  return { bake, PAINTS, mats, bicycle, poseRider, setPaint, scarf, birds, ring, starCoin, island, waterfall, fallUniforms, tree, house, tower, airship, windmill, lighthouse, seaStack, seaArch, sailboat, whale, asteroid, moon, goalGate, displace, tube };
})();
