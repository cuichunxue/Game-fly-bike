/* ============================================================
 * Sky Pedal — world
 * 5つの世界：はじまりの丘 → 雲海 → 空の街 → 夕陽の海 → 星の海と月。
 * 空（シェーダー）・雲海・海・離陸の丘・積雲（インスタンス描画）、
 * コース計画（データ）→ 近づいたら生成／通り過ぎたら破棄、当たり判定。
 * 空シェーダーと雲海シェーダーはロードスター系エンジンから継承・拡張。
 * ============================================================ */
window.SP = window.SP || {};
SP.World = (() => {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const Md = SP.Models, T = SP.Tex;

  /* ---------- the journey layout (metres along +z) ---------- */
  const ZONE_Z = [0, 480, 1880, 3380, 4880, 6420];
  const GOAL_Z = 6260;
  const ROAD_END = 420;          // the cliff edge on the hill: the moment you take off
  const CLOUD_Y = 0, SEA_Y = -160;
  const DIVE_Z0 = 3380, DIVE_Z1 = 3580;   // diving through the sea of clouds down to the sunset sea
  const MOON = { x: 0, z: GOAL_Z + 2600, y: 200, R: 470 };
  const GATE_Y = 170;

  const ZONES = [
    { key: 'hill',  name: 'はじまりの丘', en: 'MORNING HILL', sub: '朝の光の中へ、こぎだそう', icon: '🌄',
      top: 0x3a64b0, mid: 0x8ab4e6, hor: 0xffd2a8, sunCol: 0xffd8a8, sunDir: [.35, .07, 1], sunSize: 1.7, stars: 0, aurora: 0, clouds: .55,
      fog: 0xd8c8c8, fogNear: 220, fogFar: 1500, hemiSky: 0xffe8d8, hemiGround: 0x5a6a50, hemiI: .5, dirCol: 0xffd8b0, dirI: 1.55, exposure: .7 },
    { key: 'cloud', name: '雲海', en: 'SEA OF CLOUDS', sub: '光の輪をくぐり、上昇気流に乗れ', icon: '☁️',
      top: 0x1848b0, mid: 0x4a98e8, hor: 0xffe2c0, sunCol: 0xfff0c8, sunDir: [-.45, .2, 1], sunSize: 1.5, stars: 0, aurora: 0, clouds: .35,
      fog: 0xb8d4f0, fogNear: 300, fogFar: 1900, hemiSky: 0xffffff, hemiGround: 0x8a98b0, hemiI: .6, dirCol: 0xfff4e0, dirI: 1.7, exposure: .66 },
    { key: 'city',  name: '空の街', en: 'SKY CITY', sub: '浮島の街を、くぐり抜けろ', icon: '🏰',
      top: 0x1240b8, mid: 0x3e8eee, hor: 0xc8e6ff, sunCol: 0xffffff, sunDir: [.35, .55, 1], sunSize: 1.2, stars: 0, aurora: 0, clouds: .5,
      fog: 0xa8cdf0, fogNear: 280, fogFar: 1700, hemiSky: 0xffffff, hemiGround: 0x7a8a6a, hemiI: .62, dirCol: 0xffffff, dirI: 1.75, exposure: .64 },
    { key: 'sea',   name: '夕陽の海', en: 'SUNSET SEA', sub: '雲の下へ。波の上をかすめて飛べ', icon: '🌅',
      top: 0x2a2a6a, mid: 0xb05a80, hor: 0xffa458, sunCol: 0xffb060, sunDir: [.05, .045, 1], sunSize: 2.2, stars: .1, aurora: 0, clouds: .8,
      fog: 0xd88a78, fogNear: 200, fogFar: 1400, hemiSky: 0xffc8a8, hemiGround: 0x4a3050, hemiI: .55, dirCol: 0xffb070, dirI: 1.7, exposure: .72 },
    { key: 'stars', name: '星の海', en: 'SEA OF STARS', sub: '月まで、のぼれ', icon: '🌙',
      top: 0x02030c, mid: 0x0a1640, hor: 0x40306e, sunCol: 0x000000, sunDir: [0, .1, 1], sunSize: 1, stars: 1.7, aurora: .9, clouds: 0,
      fog: 0x0c1430, fogNear: 300, fogFar: 2200, hemiSky: 0x8aa0ff, hemiGround: 0x1a1a40, hemiI: .6, dirCol: 0xb8c8ff, dirI: 1.2, exposure: .95 },
  ];

  let scene, renderer, sky, skyMat, hemi, sun, cloudMesh, cloudMat, seaMesh, seaMat, hill, moon, gate;
  const env = { zone: 0, blend: 0, a: 0, b: 0 };

  /* ---------- sky ---------- */
  function makeSky(){
    skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, .1, 1).normalize() },
        sunSize: { value: 1 }, stars: { value: 0 }, aurora: { value: 0 }, clouds: { value: 0 }, time: { value: 0 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }',
      fragmentShader: `
        uniform vec3 top, mid, hor, sunCol, sunDir; uniform float sunSize, stars, aurora, clouds, time;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*.3183099+.1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<5;i++){ s += a*n2(p); p *= 2.03; a *= .5; } return s; }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 c = mix(hor, mid, smoothstep(-.03, .22, h));
          c = mix(c, top, smoothstep(.22, .85, h));
          c = mix(c, hor*.55, smoothstep(0., -.3, h));
          float sd = max(dot(d, normalize(sunDir)), 0.);
          c += sunCol * (smoothstep(.9993 - .0004*sunSize, .9997, sd)*7. + pow(sd, 22.)*.6 + pow(sd, 5.)*.22*sunSize);
          vec3 q = d*420.; vec3 id = floor(q); float s = hash(id);
          float star = step(.996, s) * smoothstep(.5, .1, length(fract(q)-.5)) * smoothstep(-.05, .2, h);
          c += vec3(.9,.95,1.) * star * stars * (.55 + .45*sin(time*2.5 + s*80.)) * 1.6;
          // milky way band
          if (stars > .5){ float mw = exp(-pow((d.x*.8 + d.y - .35)*3.2, 2.)) * fbm(d.xz*6. + d.y*3.); c += vec3(.35,.4,.7) * mw * (stars - .5) * .5; }
          if (clouds > 0. && h > -.02){
            vec2 uv = d.xz/(h+.12);
            float cl = fbm(uv*1.4 + vec2(time*.01, 0.));
            float band = smoothstep(.0, .06, h) * smoothstep(.5, .12, h);
            float a = smoothstep(.5, .8, cl) * band * clouds;
            vec3 lit = mix(mid*.8 + vec3(.1), sunCol*1.3 + hor*.5, pow(sd, 3.)*.9 + .15);
            c = mix(c, lit, a*.8);
          }
          if (aurora > 0. && h > 0.){
            vec2 uv = d.xz/(h+.25);
            float w = sin(uv.x*1.6 + time*.12 + sin(uv.y*1.3 + time*.07)*2.2);
            float curtain = exp(-abs(uv.y*.7 - w*.6 - .9)*2.8);
            float rays = .6 + .4*sin(uv.x*28. + time*.6 + fbm(uv*3.)*6.);
            float a = curtain * rays * smoothstep(.04, .3, h) * smoothstep(1., .45, h);
            vec3 ac = mix(vec3(.15,1.,.6), vec3(.55,.3,1.), smoothstep(.2, .7, h));
            c += ac * a * aurora * 1.1;
          }
          gl_FragColor = vec4(c, 1.);
        }`
    });
    sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMat);
    sky.renderOrder = -10; sky.frustumCulled = false;
    return sky;
  }

  /* ---------- the sea of clouds (a soft floor you can skim, and dive through) ---------- */
  function makeCloudSea(){
    cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, top: { value: new THREE.Color(0xfff6f0) }, bot: { value: new THREE.Color(0x8a8aa0) }, sunCol: { value: new THREE.Color(0xffc890) }, cam: { value: new THREE.Vector3() }, opacity: { value: 1 }, zEnd: { value: DIVE_Z0 + 160 }, fogCol: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `
        uniform float time, opacity, zEnd; uniform vec3 top, bot, sunCol, cam, fogCol; varying vec3 vW;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<6;i++){ s += a*n2(p); p *= 2.07; a *= .5; } return s; }
        void main(){
          vec2 p = vW.xz*.006 + vec2(time*.01, time*.004);
          float d = fbm(p) + .35*fbm(p*3.1 - time*.01);
          float a = smoothstep(.24, .66, d);
          float dist = length(vW.xz - cam.xz);
          a *= smoothstep(3200., 1500., dist);
          a *= smoothstep(zEnd, zEnd - 260., vW.z);          // the sea of clouds ends above the sunset sea
          vec3 c = gl_FrontFacing ? top : bot;
          c *= .5 + .62*smoothstep(.35, 1.15, d);
          c += sunCol * .3 * smoothstep(.8, 1.25, d) * (gl_FrontFacing ? 1. : 0.);
          c = mix(c, fogCol, smoothstep(600., 2600., dist) * .7);
          gl_FragColor = vec4(c, clamp(a*1.2, 0., 1.) * opacity);
        }`
    });
    cloudMesh = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000, 1, 1).rotateX(-Math.PI / 2), cloudMat);
    cloudMesh.position.y = CLOUD_Y; cloudMesh.frustumCulled = false; cloudMesh.renderOrder = 4;
    return cloudMesh;
  }

  /* ---------- the ocean (shading-only waves, sun/moon glitter path, fresnel sky) ---------- */
  function makeSea(){
    seaMat = new THREE.ShaderMaterial({
      fog: false,
      uniforms: { time: { value: 0 }, deep: { value: new THREE.Color(0x0a2440) }, shallow: { value: new THREE.Color(0x1a6a8a) }, skyHor: { value: new THREE.Color() }, skyMid: { value: new THREE.Color() },
        glintDir: { value: new THREE.Vector3(0, .1, 1) }, glintCol: { value: new THREE.Color() }, cam: { value: new THREE.Vector3() }, fogCol: { value: new THREE.Color() }, fogNear: { value: 200 }, fogFar: { value: 1500 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `
        uniform float time, fogNear, fogFar; uniform vec3 deep, shallow, skyHor, skyMid, glintDir, glintCol, cam, fogCol; varying vec3 vW;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float waves(vec2 p){
          float s = 0.;
          s += sin(p.x*.06 + time*1.1 + sin(p.y*.04)*1.5)*.5;
          s += sin(p.y*.09 - time*1.4 + p.x*.03)*.35;
          s += (n2(p*.25 + time*.5) - .5)*.6 + (n2(p*.9 - time*.8) - .5)*.25;
          return s;
        }
        void main(){
          vec2 p = vW.xz;
          float e = .6, w0 = waves(p);
          vec3 n = normalize(vec3(-(waves(p + vec2(e,0.)) - w0)/e*.9, 1., -(waves(p + vec2(0.,e)) - w0)/e*.9));
          vec3 v = normalize(cam - vW);
          float fres = pow(1. - max(dot(n, v), 0.), 4.);
          vec3 base = mix(deep, shallow, .35 + .3*w0);
          vec3 refl = mix(skyHor, skyMid, clamp(reflect(-v, n).y*2., 0., 1.));
          vec3 c = mix(base, refl, .25 + fres*.7);
          vec3 r = reflect(-v, n);
          float g = max(dot(r, normalize(glintDir)), 0.);
          c += glintCol * (pow(g, 900.)*14. + pow(g, 60.)*.6);
          float dist = length(vW.xz - cam.xz);
          c = mix(c, fogCol, smoothstep(fogNear, fogFar*1.4, dist));
          gl_FragColor = vec4(c, 1.);
        }`
    });
    seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2), seaMat);
    seaMesh.position.y = SEA_Y; seaMesh.frustumCulled = false;
    return seaMesh;
  }

  /* ---------- the hill: road down to the cliff edge ---------- */
  function yRoad(z){
    if (z <= 240) return 70 + (240 - z) * .04;                         // the village plateau
    if (z < 385) return 70 - 26 * smooth(240, 385, z);                // the run down
    if (z <= ROAD_END){ const k = (z - 385) / (ROAD_END - 385); return 44 + 2.6 * k * k; }  // a little kicker
    return 46.6 - (z - ROAD_END) * 5;
  }
  const hillNoise = T.makeNoise(7);
  function hillH(x, z){
    const ax = Math.abs(x), r = yRoad(Math.min(z, ROAD_END));
    let y = r + smooth(4.5, 60, ax) * (6 + ax * .12) + (hillNoise.fbm(x * .012 + 9, z * .012 + 9, 4, 256, 256) - .5) * 16 * smooth(6, 40, ax);
    if (z > ROAD_END){
      const edge = ROAD_END + smooth(30, 60, ax) * (Math.max(0, ax - 40) * .3 + hillNoise.noise(x * .05, 3, 256, 256) * 6);
      if (z > edge) y -= (z - edge) * 4.5;
    }
    return Math.max(y, -90);
  }
  function makeHill(){
    const g = new THREE.Group(), Mt = Md.mats();
    const W = 700, D = 860, nx = 110, nz = 140;
    const geo = new THREE.PlaneGeometry(W, D, nx, nz); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 200);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++){
      const x = p.getX(i), z = p.getZ(i), y = hillH(x, z); p.setY(i, y);
      const slope = clamp((hillH(x, z + 2) - y) / -8, 0, 1);
      const rock = z > ROAD_END - 10 ? smooth(.1, .5, slope) : 0;
      col[i * 3] = lerp(1, .85, rock); col[i * 3 + 1] = lerp(1, .68, rock); col[i * 3 + 2] = lerp(1, .6, rock);
      uv.setXY(i, x / 16, z / 16);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ map: T.grass(), vertexColors: true, roughness: .95 });
    const ground = new THREE.Mesh(geo, groundMat); ground.receiveShadow = true; g.add(ground);
    // the road strip
    const rp = [], ri = [], ruv = []; let k = 0;
    for (let z = -120; z <= ROAD_END; z += 4){ const y = yRoad(z) + .06; rp.push(-3.2, y, z, 3.2, y, z); ruv.push(0, z / 12, 1, z / 12); if (k) ri.push(2 * k - 2, 2 * k, 2 * k - 1, 2 * k - 1, 2 * k, 2 * k + 1); k++; }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2)); rg.setIndex(ri); rg.computeVertexNormals();
    const road = new THREE.Mesh(rg, Mt.road); road.receiveShadow = true; g.add(road);
    const rnd = T.mulberry32(12);
    // fence posts and flags along the road; a little village; windmills on the ridge
    const postG = new THREE.CylinderGeometry(.08, .08, 1, 5), postM = Mt.trunk;
    const posts = new THREE.InstancedMesh(postG, postM, 120); let pi = 0; const m4 = new THREE.Matrix4();
    for (let z = -60; z < ROAD_END - 4 && pi < 120; z += 8){ [-1, 1].forEach(s => { if (pi < 120){ m4.makeTranslation(s * 4.2, yRoad(z) + .5, z); posts.setMatrixAt(pi++, m4); } }); }
    posts.count = pi; g.add(posts);
    for (let i = 0; i < 14; i++){
      const s = i % 2 ? 1 : -1, x = s * (12 + rnd() * 30), z = -40 + rnd() * 240;
      const h = Md.house(i, 4 + rnd() * 2, 3.5 + rnd() * 2, 4 + rnd() * 2); h.position.set(x, hillH(x, z) - .2, z); h.rotation.y = rnd() * .6 - .3 + (s > 0 ? Math.PI / 2 : -Math.PI / 2); g.add(h);
    }
    const mills = [];
    [[-55, 90], [62, 170], [-70, 280], [48, 330]].forEach(([x, z]) => { const w = Md.windmill(); w.position.set(x, hillH(x, z) - .5, z); w.rotation.y = Math.PI + (x > 0 ? .3 : -.3); g.add(w); mills.push(w); });
    for (let i = 0; i < 90; i++){
      const x = (rnd() < .5 ? -1 : 1) * (8 + rnd() * 200), z = -100 + rnd() * 500; if (z > ROAD_END - 20 && Math.abs(x) < 60) continue;
      const t = Md.tree(rnd() < .25 ? 2 : rnd() < .5 ? 1 : 0); t.position.set(x, hillH(x, z) - .2, z); t.scale.setScalar(.8 + rnd() * .8); g.add(t);
    }
    // the take-off sign
    const sign = makeSignBoard(['そらへ', 'TO THE SKY →']); sign.position.set(5.5, yRoad(340), 340); sign.rotation.y = Math.PI + .3; g.add(sign);
    g.userData = { mills };
    ground.userData.keep = true; road.userData.keep = true;
    Md.bake(g);
    return g;
  }
  function makeSignBoard(lines){
    const [c, x] = T.shareCanvas(256, 128);
    x.fillStyle = '#fff6e4'; x.fillRect(0, 0, 256, 128); x.strokeStyle = '#7a5236'; x.lineWidth = 10; x.strokeRect(5, 5, 246, 118);
    x.fillStyle = '#3a2a20'; x.textAlign = 'center'; x.font = '900 46px "Hiragino Sans","Noto Sans JP",sans-serif'; x.fillText(lines[0], 128, 62);
    x.font = '800 22px "Arial Black",sans-serif'; x.fillText(lines[1], 128, 100);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: tex, roughness: .8, side: THREE.DoubleSide })); b.position.y = 2.2; g.add(b);
    g.add(Md.tube(new THREE.Vector3(0, 0, -.02), new THREE.Vector3(0, 1.7, -.02), .06, Md.mats().trunk));
    return g;
  }

  /* ---------- cumulus clouds: camera-facing instanced puffs, lit from above, fogged ---------- */
  const PUFF_MAX = 2600;
  let puffMesh, puffOffset, puffScale, puffShade, puffDirty = true;
  function makePuffs(){
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); geo.setIndex([0, 1, 2, 0, 2, 3]);
    puffOffset = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    puffScale = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_MAX), 1).setUsage(THREE.DynamicDrawUsage);
    puffShade = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_MAX), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('offset', puffOffset); geo.setAttribute('pscale', puffScale); geo.setAttribute('shade', puffShade);
    geo.instanceCount = 0;
    const uni = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, lit: { value: new THREE.Color(1, 1, 1) }, dark: { value: new THREE.Color(.6, .62, .75) }, sunCol: { value: new THREE.Color() } }]);
    uni.map.value = T.puff();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, uniforms: uni,
      vertexShader: `attribute vec3 offset; attribute float pscale; attribute float shade; varying vec2 vUv; varying float vShade;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vShade = shade; vec4 mvPosition = modelViewMatrix*vec4(offset,1.); mvPosition.xy += position.xy*pscale;
          // fade puffs that are right on top of the camera (no sudden white wall)
          gl_Position = projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 lit, dark, sunCol; varying vec2 vUv; varying float vShade;
        #include <fog_pars_fragment>
        void main(){ vec4 t = texture2D(map, vUv); float up = vUv.y;
          vec3 c = mix(dark, lit, clamp(vShade*.7 + up*.5, 0., 1.)) + sunCol*.18*up*vShade;
          gl_FragColor = vec4(c, t.a*.92);
          #include <fog_fragment>
        }`
    });
    puffMesh = new THREE.Mesh(geo, mat); puffMesh.frustumCulled = false; puffMesh.renderOrder = 2;
    return puffMesh;
  }
  function cloudPuffs(cx, cy, cz, w, h, rnd, n){
    const P = [];
    for (let i = 0; i < n; i++){
      const t = rnd(), y = cy + Math.pow(t, .8) * h, rr = w * (1 - t * .55) * (.4 + rnd() * .6), a = rnd() * Math.PI * 2;
      P.push([cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr * .8, w * (.55 + rnd() * .5) * (1 - t * .3), .2 + t * .8]);
    }
    return P;
  }
  function rebuildPuffs(){
    let n = 0; const O = puffOffset.array, S = puffScale.array, H = puffShade.array;
    for (const e of active){ if (!e.puffs) continue; for (const p of e.puffs){ if (n >= PUFF_MAX) break; O[n * 3] = p[0]; O[n * 3 + 1] = p[1]; O[n * 3 + 2] = p[2]; S[n] = p[3]; H[n] = p[4]; n++; } }
    puffMesh.geometry.instanceCount = n; puffOffset.needsUpdate = true; puffScale.needsUpdate = true; puffShade.needsUpdate = true; puffDirty = false;
  }

  /* ---------- course plan: entities as data, meshes made only when near ---------- */
  let cursor = 0, ents = [], active = new Set(), free = -1, genZ = 0, runSeed = 1, rng = Math.random, starIdx = 0;
  const birdsMax = 120; let birdSys;
  const SPAWN_AHEAD = 1000, DESPAWN_BEHIND = 140;

  function add(e){ e.id = ents.length; ents.push(e); return e; }
  // ring line helpers
  function ringLine(pts, gold = true){
    const list = pts.map((p, i) => add({ kind: 'ring', x: p[0], y: p[1], z: p[2], gold: gold && i === pts.length - 1, line: pts, idx: i, n: pts.length }));
    return list;
  }
  function pattern(kind, x, y, z, s = 1, n = 6){
    const P = [], sp = 26;
    for (let i = 0; i < n; i++){
      const t = i / (n - 1);
      if (kind === 'line') P.push([x, y, z + i * sp]);
      else if (kind === 'arc') P.push([x + Math.sin(t * Math.PI) * 18 * s, y + Math.sin(t * Math.PI) * 6, z + i * sp]);
      else if (kind === 'slalom') P.push([x + (i % 2 ? 9 : -9) * s, y, z + i * sp]);
      else if (kind === 'climb') P.push([x, y + i * 7, z + i * sp]);
      else if (kind === 'dive') P.push([x, y - i * 7, z + i * sp]);
      else if (kind === 'wave') P.push([x + Math.sin(t * Math.PI * 2) * 14 * s, y + Math.cos(t * Math.PI * 2) * 8 - 8, z + i * sp]);
      else if (kind === 'spiral') { const a = t * Math.PI * 3; P.push([x + Math.sin(a) * 16 * s, y + i * 6, z + i * sp * .8]); }
    }
    return ringLine(P);
  }
  const R = (a, b) => a + rng() * (b - a);
  const pick = arr => arr[(rng() * arr.length) | 0];

  function genCloud(z0, z1){
    for (let z = z0 + 60; z < z1 - 40; z += R(110, 150)){
      const kind = pick(['line', 'arc', 'slalom', 'climb', 'dive', 'wave']);
      const y = kind === 'dive' ? R(70, 100) : kind === 'climb' ? R(20, 45) : R(30, 80);
      pattern(kind, R(-30, 30), y, z, rng() < .5 ? 1 : -1, 5 + (rng() * 3 | 0));
    }
    // cumulus towers: soft — flying through is a white-out, never a crash
    for (let z = z0; z < z1; z += R(40, 80)){
      const side = rng() < .5 ? -1 : 1, center = rng() < .18;
      const x = center ? R(-25, 25) : side * R(45, 160), w = R(14, 30), h = R(30, 120);
      add({ kind: 'cumulus', x, y: CLOUD_Y - 8, z, w, h, soft: true });
    }
    // thermals (warm rising air): spiral up for free height + stamina
    for (let z = z0 + 250; z < z1 - 100; z += R(380, 480)) add({ kind: 'thermal', x: R(-35, 35), y0: CLOUD_Y, y1: 170, z, r: 14 });
    // hot-air balloons: the first gentle obstacles
    for (let z = z0 + 350; z < z1; z += R(160, 260)) add({ kind: 'balloon', x: R(-60, 60), y: R(40, 110), z, color: pick([0xff6f6a, 0xffd84a, 0x5ab8ff, 0x7ad87a, 0xff8ad8]), bob: rng() * 6 });
    for (let z = z0 + 200; z < z1 - 150; z += R(500, 600)) add({ kind: 'flock', x: R(-40, 40), y: R(40, 80), z, n: 6 + (rng() * 4 | 0), color: 0xffffff });
  }
  function genCity(z0, z1){
    let lastIsland = null;
    for (let z = z0 + 40; z < z1 - 40; z += R(90, 130)){
      const side = rng() < .5 ? -1 : 1, Rr = R(14, 30), x = side * R(18, 70), y = R(25, 110);
      const isl = add({ kind: 'island', x, y, z, R: Rr, seed: (rng() * 1e6) | 0, houses: 1 + (rng() * 3 | 0), fall: rng() < .5, tower: rng() < .6 ? { h: R(18, 40), r: R(2.4, 4) } : null });
      // a bridge to the previous island across the course: fly under it (or over it)
      if (lastIsland && Math.sign(lastIsland.x) !== Math.sign(x) && rng() < .7 && Math.abs(lastIsland.z - z) < 140){
        const yb = Math.min(lastIsland.y, y) - 1;
        add({ kind: 'bridge', x0: lastIsland.x, x1: x, y: yb, z: (lastIsland.z + z) / 2, w: 5 });
        pattern('line', 0, yb - 12, (lastIsland.z + z) / 2 - 52, 1, 5);
      }
      lastIsland = isl;
    }
    for (let z = z0 + 90; z < z1 - 60; z += R(150, 200)){
      const kind = pick(['slalom', 'arc', 'wave', 'climb', 'dive']);
      pattern(kind, R(-10, 10), R(40, 90), z, rng() < .5 ? 1 : -1, 6);
    }
    for (let z = z0 + 300; z < z1; z += R(280, 380)) add({ kind: 'airship', x: R(-80, 80), y: R(60, 130), z, vx: (rng() < .5 ? -1 : 1) * R(3, 6), range: 90 });
    for (let z = z0 + 150; z < z1; z += R(70, 120)){ const side = rng() < .5 ? -1 : 1; add({ kind: 'cumulus', x: side * R(90, 220), y: CLOUD_Y - 10, z, w: R(16, 30), h: R(40, 100), soft: true }); }
    for (let z = z0 + 500; z < z1 - 100; z += R(600, 700)) add({ kind: 'thermal', x: R(-30, 30), y0: CLOUD_Y, y1: 190, z, r: 14 });
    for (let z = z0 + 400; z < z1 - 150; z += R(450, 550)) add({ kind: 'flock', x: R(-40, 40), y: R(50, 100), z, n: 6 + (rng() * 4 | 0), color: 0xf4f0ff });
  }
  function genSea(z0, z1, withDive){
    const top = -40, low = SEA_Y + 6;
    let start = z0;
    if (withDive){
      // the dive: a ring chain that plunges through the sea of clouds
      const P = []; for (let i = 0; i < 9; i++){ const t = i / 8; P.push([Math.sin(t * Math.PI) * 6, lerp(55, -100, smooth(0, 1, t)), DIVE_Z0 - 30 + i * 30]); }
      ringLine(P);
      add({ kind: 'sign', x: 0, y: 72, z: DIVE_Z0 - 90, text: ['雲の下へ', 'DIVE ↓'] });
      start = DIVE_Z1 + 40;
    }
    for (let z = start; z < z1 - 40; z += R(120, 160)){
      const kind = pick(['line', 'slalom', 'arc', 'wave']);
      const skim = rng() < .35;
      pattern(kind, R(-20, 20), skim ? low + 4 : R(SEA_Y + 20, top - 20), z, rng() < .5 ? 1 : -1, 6);
    }
    for (let z = start; z < z1; z += R(50, 90)){ const side = rng() < .5 ? -1 : 1; const h = R(25, 90); add({ kind: 'stack', x: side * R(25, 140), y: SEA_Y - 4, z, h: h, r: h * .21, seed: (rng() * 1e6) | 0 }); }
    for (let z = start + 200; z < z1; z += R(360, 460)){ const span = R(30, 44), h = R(28, 46); add({ kind: 'arch', x: R(-15, 15), y: SEA_Y - 2, z, span, h }); ringLine([[0, SEA_Y + h * .45, z]], true); }
    add({ kind: 'lighthouse', x: -38, y: SEA_Y + 2, z: start + 600 });
    for (let z = start + 120; z < z1; z += R(220, 300)) add({ kind: 'whale', x: R(-30, 30), y: SEA_Y, z, phase: rng() * 10, period: R(7, 10) });
    for (let z = start + 80; z < z1; z += R(140, 220)){ const side = rng() < .5 ? -1 : 1; add({ kind: 'boat', x: side * R(30, 120), y: SEA_Y, z, yaw: rng() * 6 }); }
    for (let z = start + 300; z < z1 - 150; z += R(420, 520)) add({ kind: 'flock', x: R(-30, 30), y: R(SEA_Y + 25, SEA_Y + 70), z, n: 7 + (rng() * 4 | 0), color: 0xffffff });
  }
  function genStars(z0, z1, free){
    const yAt = z => free ? 60 + Math.sin(z * .004) * 50 : lerp(-90, GATE_Y, smooth(z0 + 100, GOAL_Z - 250, z));
    for (let z = z0 + 80; z < (free ? z1 : GOAL_Z - 300); z += R(110, 150)){
      const kind = pick(['climb', 'spiral', 'arc', 'wave', 'line']);
      pattern(kind, R(-15, 15), yAt(z) + (kind === 'climb' || kind === 'spiral' ? -10 : 0), z, rng() < .5 ? 1 : -1, 6);
    }
    if (!free) pattern('line', 0, GATE_Y, GOAL_Z - 136, 1, 5);   // the final approach: straight into the moon gate
    for (let z = z0 + 40; z < z1; z += R(16, 30)) add({ kind: 'lantern', x: R(-60, 60), y: yAt(z) + R(-30, 40), z, ph: rng() * 6 });
    for (let z = z0 + 200; z < z1; z += R(180, 260)) add({ kind: 'meteor', x: R(-40, 40), y: yAt(z) + R(10, 40), z, t: 0 });
    for (let z = z0 + 250; z < (free ? z1 : GOAL_Z - 200); z += R(80, 140)){ const side = rng() < .5 ? -1 : 1; add({ kind: 'asteroid', x: side * R(12, 90), y: yAt(z) + R(-25, 25), z, r: R(3, 9), seed: (rng() * 1e6) | 0, spin: R(-.4, .4) }); }
  }
  // three star medals per world, tucked into places that reward curiosity and nerve
  function genStars3(k, z0, z1){
    const L = z1 - z0, out = [];
    if (k === 1){ out.push([0, 3.5, z0 + L * .28], [R(-20, 20), 150, z0 + L * .55 + 40]); const cu = add({ kind: 'cumulus', x: 10, y: CLOUD_Y - 8, z: z0 + L * .82, w: 26, h: 90, soft: true }); out.push([cu.x, 45, cu.z]); }
    else if (k === 2){
      const br = ents.filter(e => e.kind === 'bridge' && e.z > z0 && e.z < z1);
      if (br[0]) out.push([0, br[0].y - 3.5, br[0].z]); else out.push([0, 40, z0 + L * .3]);
      const isl = ents.filter(e => e.kind === 'island' && e.fall && e.z > z0 + L * .4 && e.z < z1);
      if (isl[0]) out.push([isl[0].x - Math.sign(isl[0].x) * isl[0].R * .98, isl[0].y - 20, isl[0].z]); else out.push([-30, 60, z0 + L * .6]);
      out.push([0, 175, z0 + L * .85]);
    }
    else if (k === 3){
      const ar = ents.filter(e => e.kind === 'arch' && e.z > z0 && e.z < z1);
      out.push(ar[0] ? [ar[0].x, SEA_Y + 3.5, ar[0].z] : [0, SEA_Y + 4, z0 + L * .4]);
      const lh = ents.find(e => e.kind === 'lighthouse'); out.push(lh ? [lh.x + 10, SEA_Y + 34, lh.z] : [0, -60, z0 + L * .5]);
      out.push([R(-10, 10), SEA_Y + 3, z0 + L * .8]);
    }
    else if (k === 4){ out.push([40, lerp(-90, GATE_Y, .35) + 30, z0 + L * .3], [-35, lerp(-90, GATE_Y, .6) - 20, z0 + L * .55], [0, GATE_Y + 26, GOAL_Z - 70]); }
    out.forEach(p => add({ kind: 'star', x: p[0], y: p[1], z: p[2], zone: k, sidx: starIdx++ % 3 }));
  }
  function genHill(){
    pattern('line', 0, 52, ROAD_END + 40, 1, 4);
    for (let z = ZONE_Z[0] + 200; z < ZONE_Z[1] + 40; z += R(30, 50)){ const side = rng() < .5 ? -1 : 1; add({ kind: 'cumulus', x: side * R(60, 200), y: CLOUD_Y - 10, z: z + 200, w: R(16, 32), h: R(20, 70), soft: true }); }
    add({ kind: 'flock', x: 6, y: 56, z: 300, n: 5, color: 0xffffff, perch: true });
  }

  function buildRun(opts){
    clearRun();
    runSeed = opts.seed || 1; rng = T.mulberry32(runSeed); starIdx = 0;
    free = opts.free ? opts.zone : -1;
    if (free < 0){
      genHill();
      genCloud(ZONE_Z[1], ZONE_Z[2]); genStars3(1, ZONE_Z[1], ZONE_Z[2]);
      genCity(ZONE_Z[2], ZONE_Z[3]); genStars3(2, ZONE_Z[2], ZONE_Z[3]);
      genSea(ZONE_Z[3], ZONE_Z[4], true); genStars3(3, ZONE_Z[3], ZONE_Z[4]);
      genStars(ZONE_Z[4], ZONE_Z[5], false); genStars3(4, ZONE_Z[4], ZONE_Z[5]);
      add({ kind: 'gate', x: 0, y: GATE_Y, z: GOAL_Z });
      genZ = Infinity;
    } else genZ = opts.startZ || 0;
    ents.sort((a, b) => a.z - b.z); ents.forEach((e, i) => e.id = i);
    hill.visible = free < 0 || free === 0;
  }
  // free flight: keep generating the chosen world forever
  function extendFree(z){
    while (genZ < z + SPAWN_AHEAD + 400){
      const z0 = genZ, z1 = genZ + 600;
      const n0 = ents.length;
      if (free === 1) genCloud(z0, z1); else if (free === 2) genCity(z0, z1); else if (free === 3) genSea(z0, z1, false); else genStars(z0, z1, true);
      // keep the plan sorted by z so the spawn cursor can walk it
      const tail = ents.splice(n0).sort((a, b) => a.z - b.z); ents.push(...tail); ents.forEach((e, i) => e.id = i);
      genZ = z1;
    }
  }
  function clearRun(){
    for (const e of active) despawn(e);
    active.clear(); ents = []; puffDirty = true; cursor = 0;
  }

  /* ---------- spawning ---------- */
  function balloonMesh(color){
    const g = new THREE.Group(), Mt = Md.mats();
    const env2 = new THREE.Mesh(new THREE.SphereGeometry(5, 18, 14), new THREE.MeshStandardMaterial({ color, roughness: .6 })); env2.scale.y = 1.15; g.add(env2);
    const band = new THREE.Mesh(new THREE.SphereGeometry(5.05, 18, 4, 0, Math.PI * 2, Math.PI * .42, Math.PI * .16), Mt.white); band.scale.y = 1.15; g.add(band);
    const bask = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), Mt.wicker); bask.position.y = -7.6; g.add(bask);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => g.add(Md.tube(new THREE.Vector3(a * .7, -7, b * .7), new THREE.Vector3(a * 2.2, -4.6, b * 2.2), .03, Mt.dark)));
    return g;
  }
  const LANTERN_G = new THREE.CylinderGeometry(.55, .4, 1.1, 8); LANTERN_G.userData.shared = true;
  const LANTERN_M = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(3.2) });
  const SMALL = { ring: 1, lantern: 1, star: 1, meteor: 1, boat: 1 };
  const BAKE = { ring: 1, star: 0, balloon: 1, island: 1, bridge: 1, airship: 1, stack: 1, arch: 1, lighthouse: 1, boat: 1, lantern: 0, sign: 1 };
  function spawn(e){
    let o = null; e.col = null;
    switch (e.kind){
      case 'ring': o = Md.ring(e.gold); o.position.set(e.x, e.y, e.z); break;
      case 'star': o = Md.starCoin(); o.position.set(e.x, e.y, e.z); break;
      case 'cumulus': if (!e.puffs) e.puffs = cloudPuffs(e.x, e.y, e.z, e.w, e.h, T.mulberry32(e.id * 31 + runSeed), Math.round(10 + e.h / 4)); puffDirty = true; break;
      case 'thermal': break;
      case 'balloon': o = balloonMesh(e.color); o.position.set(e.x, e.y, e.z); e.col = [{ t: 'sph', x: e.x, y: e.y, z: e.z, r: 5.6 }, { t: 'sph', x: e.x, y: e.y - 7.4, z: e.z, r: 1.4 }]; break;
      case 'island': {
        o = Md.island(e.R, e.seed, { houses: e.houses }); o.position.set(e.x, e.y, e.z);
        const coneH = o.userData.coneH;
        e.col = [{ t: 'cyl', x: e.x, z: e.z, r: e.R * .98, y0: e.y - 2.3, y1: e.y + 4.5 }, { t: 'cone', x: e.x, z: e.z, yTop: e.y - 2.2, rTop: e.R * .95, h: coneH }];
        if (e.fall){ const fw = Md.waterfall(6, 70); fw.position.set(-Math.sign(e.x) * e.R * .99, -35, 0); fw.rotation.y = Math.PI / 2; o.add(fw); }
        if (e.tower){ const tw = Md.tower(e.seed % 4, e.tower.r, e.tower.h); tw.position.set(0, 0, 0); o.add(tw); e.col.push({ t: 'cyl', x: e.x, z: e.z, r: e.tower.r + .2, y0: e.y, y1: e.y + e.tower.h + e.tower.r * 2.6 }); }
        break;
      }
      case 'bridge': {
        const Mt = Md.mats(), len = Math.abs(e.x1 - e.x0), xm = (e.x0 + e.x1) / 2;
        o = new THREE.Group(); o.position.set(xm, e.y, e.z);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, e.w), Mt.wall[1]); o.add(deck);
        const arch = new THREE.Mesh(new THREE.TorusGeometry(len / 2, .5, 6, 32, Math.PI), Mt.white); arch.scale.y = .18; arch.position.y = -.6; arch.rotation.x = Math.PI; o.add(arch);
        for (let i = -3; i <= 3; i++){ const lp = new THREE.Mesh(new THREE.SphereGeometry(.35, 6, 4), Mt.lampGlow); lp.position.set(i * len / 7, 1.4, e.w / 2); o.add(lp); }
        e.col = [{ t: 'box', x0: xm - len / 2, x1: xm + len / 2, y0: e.y - 1.6, y1: e.y + 1.2, z0: e.z - e.w / 2, z1: e.z + e.w / 2 }];
        break;
      }
      case 'airship': o = Md.airship(); o.position.set(e.x, e.y, e.z); o.rotation.y = e.vx > 0 ? Math.PI / 2 : -Math.PI / 2; e.x0 = e.x0 ?? e.x; e.col = [{ t: 'sph', x: 0, y: 0, z: 0, r: 5 }, { t: 'sph', x: 0, y: 0, z: 0, r: 5 }, { t: 'sph', x: 0, y: 0, z: 0, r: 5 }]; break;
      case 'stack': o = Md.seaStack(e.seed, e.h); o.position.set(e.x, e.y, e.z); e.col = [{ t: 'cyl', x: e.x, z: e.z, r: e.r * 1.05, y0: e.y - 10, y1: e.y + e.h + 2 }]; break;
      case 'arch': o = Md.seaArch(e.span, e.h); o.position.set(e.x, e.y, e.z);
        e.col = [{ t: 'cyl', x: e.x - e.span / 2 - 5, z: e.z, r: 6.5, y0: e.y - 5, y1: e.y + e.h + 6 }, { t: 'cyl', x: e.x + e.span / 2 + 5, z: e.z, r: 6.5, y0: e.y - 5, y1: e.y + e.h + 6 }, { t: 'box', x0: e.x - e.span / 2 - 11, x1: e.x + e.span / 2 + 11, y0: e.y + e.h - 2, y1: e.y + e.h + 7, z0: e.z - 5, z1: e.z + 5 }]; break;
      case 'lighthouse': o = Md.lighthouse(); o.position.set(e.x, e.y, e.z); e.col = [{ t: 'cyl', x: e.x, z: e.z, r: 8, y0: e.y - 8, y1: e.y + 4 }, { t: 'cyl', x: e.x, z: e.z, r: 2.6, y0: e.y, y1: e.y + 28 }]; break;
      case 'whale': o = Md.whale(); o.position.set(e.x, e.y - 30, e.z); e.col = [{ t: 'sph', x: 0, y: -999, z: 0, r: 4.5 }, { t: 'sph', x: 0, y: -999, z: 0, r: 4.5 }]; break;
      case 'boat': o = Md.sailboat(); o.position.set(e.x, e.y, e.z); o.rotation.y = e.yaw; e.col = [{ t: 'cyl', x: e.x, z: e.z, r: 1.6, y0: e.y - 2, y1: e.y + 11 }]; break;
      case 'lantern': {
        o = new THREE.Group(); o.position.set(e.x, e.y, e.z);
        o.add(new THREE.Mesh(LANTERN_G, LANTERN_M));
        break;
      }
      case 'meteor': {
        o = new THREE.Group(); o.position.set(e.x, e.y, e.z);
        const s = new THREE.Sprite(Md.mats().glowSprite.clone()); s.material.color.setHex(0xbfe0ff); s.scale.set(5, 5, 1); o.add(s);
        const tail = new THREE.Mesh(new THREE.ConeGeometry(.9, 16, 8, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 8), new THREE.MeshBasicMaterial({ color: 0x8ac8ff, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false }));
        o.add(tail); break;
      }
      case 'asteroid': o = Md.asteroid(e.seed, e.r); o.position.set(e.x, e.y, e.z); e.col = [{ t: 'sph', x: e.x, y: e.y, z: e.z, r: e.r * 1.05 }]; break;
      case 'gate': o = Md.goalGate(); o.position.set(e.x, e.y, e.z); break;
      case 'sign': { o = makeSignBoard(e.text); o.scale.setScalar(4); o.position.set(e.x + 12, e.y - 9, e.z); o.rotation.y = Math.PI; break; }
      case 'flock': e.birds = e.birds || Array.from({ length: e.n }, (_, i) => ({ ox: (Math.random() - .5) * 10, oy: (Math.random() - .5) * 4, oz: (Math.random() - .5) * 10, ph: Math.random() * 6, joined: false, x: e.x, y: e.y, z: e.z, yaw: 0, gone: false })); break;
    }
    if (o){ if (BAKE[e.kind]) Md.bake(o); scene.add(o); e.obj = o; }
    active.add(e);
  }
  function despawn(e){
    if (e.obj){ scene.remove(e.obj); e.obj.traverse(m => { if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); if (m.isSprite) m.material.dispose(); }); e.obj = null; }
    if (e.puffs) puffDirty = true;
    active.delete(e);
  }

  /* ---------- per-frame world update ---------- */
  function update(dt, cam, focusZ, t){
    if (free >= 0) extendFree(focusZ);
    // spawn ahead (budgeted), despawn behind
    let budget = 4;
    if (cursor > ents.length) cursor = 0;
    while (cursor > 0 && ents[cursor - 1].z > focusZ - DESPAWN_BEHIND) cursor--;
    while (cursor < ents.length && ents[cursor].z < focusZ - DESPAWN_BEHIND) cursor++;
    for (let i = cursor; i < ents.length && budget > 0; i++){
      const e = ents[i];
      if (e.z > focusZ + SPAWN_AHEAD) break;
      if (SMALL[e.kind] && e.z > focusZ + 620) continue;
      if (!active.has(e) && !e.done && e.z > focusZ - DESPAWN_BEHIND){ spawn(e); budget--; }
    }
    for (const e of active){ if (e.z < focusZ - DESPAWN_BEHIND || e.done) despawn(e); }
    if (free >= 0 && ents.length > 900){ ents = ents.filter(e => e.z > focusZ - DESPAWN_BEHIND - 50); ents.forEach((e, i) => e.id = i); cursor = 0; }
    if (puffDirty) rebuildPuffs();
    // animated things
    Md.fallUniforms.time.value = t;
    for (const e of active){
      const o = e.obj;
      switch (e.kind){
        case 'ring': if (o){ o.rotation.z = t * .6 + e.idx; const s = 1 + Math.sin(t * 3 + e.idx) * .04; o.scale.setScalar(e.taken ? o.scale.x + dt * 3 : s); if (e.taken){ o.children.forEach(c => { c.material = Md.mats().ringDone; }); } } break;
        case 'star': if (o){ o.rotation.y = t * 2; o.position.y = e.y + Math.sin(t * 2 + e.x) * .4; } break;
        case 'balloon': if (o){ const y = e.y + Math.sin(t * .4 + e.bob) * 2.5; o.position.y = y; e.col[0].y = y; e.col[1].y = y - 7.4; } break;
        case 'airship': if (o){ e.x += e.vx * dt; if (Math.abs(e.x - e.x0) > e.range) e.vx *= -1, o.rotation.y = e.vx > 0 ? Math.PI / 2 : -Math.PI / 2; o.position.x = e.x; o.userData.prop.rotation.z += dt * 12;
          const dir = Math.sign(e.vx); e.col[0].x = e.x + dir * 6; e.col[1].x = e.x; e.col[2].x = e.x - dir * 6; e.col.forEach(c => { c.y = e.y; c.z = e.z; }); e.col[2].r = 4.2; } break;
        case 'whale': if (o){
          const ph = ((t + e.phase) % e.period) / e.period;     // breach for the first 30% of the cycle
          if (ph < .3){ const k = ph / .3; const y = e.y - 6 + Math.sin(k * Math.PI) * 26; const zz = e.z + (k - .5) * 34;
            o.position.set(e.x, y, zz); o.rotation.x = -Math.cos(k * Math.PI) * .9; o.visible = true;
            e.col[0].x = e.x; e.col[0].y = y; e.col[0].z = zz + 5; e.col[1].x = e.x; e.col[1].y = y; e.col[1].z = zz - 5;
            if (!e.sung && k > .05){ e.sung = true; e.breach = 1; }
            if (k > .92 && !e.splashed){ e.splashed = true; e.splash = 1; }
          } else { o.visible = false; e.col[0].y = e.col[1].y = -999; e.sung = false; e.splashed = false; }
        } break;
        case 'lantern': if (o){ e.y += dt * .8; o.position.y = e.y + Math.sin(t + e.ph) * .4; o.position.x = e.x + Math.sin(t * .3 + e.ph) * .8; } break;
        case 'meteor': if (o){ e.t += dt; o.position.set(e.x - e.t * 6, e.y - e.t * 3, e.z - e.t * 2); } break;
        case 'asteroid': if (o){ o.rotation.x += e.spin * dt; o.rotation.y += e.spin * .7 * dt; } break;
        case 'gate': if (o){ o.rotation.z = t * .2; o.children.forEach((c, i) => { if (i) c.rotation.z = -t * (.3 + i * .1); }); } break;
        case 'lighthouse': if (o) o.userData.beam.rotation.y = t * .8; break;
        case 'island': if (o && o.children.length){ o.traverse(c => { if (c.userData.flag) c.userData.flag.rotation.y = Math.sin(t * 3 + e.id) * .4; }); } break;
      }
    }
    if (hill.visible) hill.userData.mills.forEach((m, i) => m.userData.hub.rotation.z = t * (.6 + i * .1));
    // the moon stays put in the world; shown from the sea zone on (rises into view)
    moon.visible = (free < 0 && focusZ > ZONE_Z[3] + 500) || free === 4;
    if (free === 4){ moon.position.set(0, MOON.y, focusZ + 2600); }
  }

  /* ---------- atmosphere follows the journey ---------- */
  const cB = new THREE.Color();
  const lerpHex = (out, a, b, t) => out.setHex(a).lerp(cB.setHex(b), t);
  function zoneAt(z){ if (free >= 0) return free; let k = 0; for (let i = 1; i < 5; i++) if (z >= ZONE_Z[i]) k = i; return k; }
  function progressIn(z){ const k = zoneAt(z); return free >= 0 ? 0 : clamp((z - ZONE_Z[k]) / (ZONE_Z[k + 1] - ZONE_Z[k]), 0, 1); }
  function setEnv(ai, bi, t){
    const A = ZONES[ai], B = ZONES[bi], u = skyMat.uniforms;
    lerpHex(u.top.value, A.top, B.top, t); lerpHex(u.mid.value, A.mid, B.mid, t); lerpHex(u.hor.value, A.hor, B.hor, t); lerpHex(u.sunCol.value, A.sunCol, B.sunCol, t);
    u.sunDir.value.set(lerp(A.sunDir[0], B.sunDir[0], t), lerp(A.sunDir[1], B.sunDir[1], t), 1).normalize();
    u.sunSize.value = lerp(A.sunSize, B.sunSize, t); u.stars.value = lerp(A.stars, B.stars, t); u.aurora.value = lerp(A.aurora, B.aurora, t); u.clouds.value = lerp(A.clouds, B.clouds, t);
    lerpHex(scene.fog.color, A.fog, B.fog, t); scene.fog.near = lerp(A.fogNear, B.fogNear, t); scene.fog.far = lerp(A.fogFar, B.fogFar, t);
    lerpHex(hemi.color, A.hemiSky, B.hemiSky, t); lerpHex(hemi.groundColor, A.hemiGround, B.hemiGround, t); hemi.intensity = lerp(A.hemiI, B.hemiI, t);
    lerpHex(sun.color, A.dirCol, B.dirCol, t); sun.intensity = lerp(A.dirI, B.dirI, t);
    sun.position.copy(u.sunDir.value).multiplyScalar(100); if (sun.position.y < 30) sun.position.y = 30;
    renderer.toneMappingExposure = lerp(A.exposure, B.exposure, t);
    env.a = ai; env.b = bi; env.blend = t; env.zone = t < .5 ? ai : bi;
  }
  // blend skies across a 260m band around each boundary; in free flight the sky holds still
  function envAt(z){
    if (free >= 0) return setEnv(free, free, 0);
    let a = zoneAt(z), b = a, t = 0;
    const next = ZONE_Z[a + 1];
    if (a < 4 && z > next - 260){ b = a + 1; t = smooth(next - 260, next, z); }
    if (a === 3 && z < ZONE_Z[3] + 220){ a = 2; b = 3; t = smooth(ZONE_Z[3] - 40, ZONE_Z[3] + 220, z); }
    if (a === 4){ t = smooth(ZONE_Z[4] - 100, ZONE_Z[4] + 500, z); a = 3; b = 4; }
    setEnv(a, b, t);
  }
  const tmpC = new THREE.Color();
  function followCam(cam, t){
    sky.position.copy(cam);
    skyMat.uniforms.time.value = t;
    cloudMesh.position.x = cam.x; cloudMesh.position.z = cam.z;
    const cu = cloudMat.uniforms; cu.time.value = t; cu.cam.value.copy(cam); cu.fogCol.value.copy(scene.fog.color);
    cu.sunCol.value.copy(skyMat.uniforms.sunCol.value);
    cu.top.value.copy(skyMat.uniforms.hor.value).lerp(tmpC.setHex(0xffffff), .45);
    cu.bot.value.copy(skyMat.uniforms.mid.value).lerp(tmpC.setHex(0x8a8aa8), .5);
    cu.zEnd.value = free >= 0 ? (free <= 2 ? 1e9 : -1e9) : DIVE_Z0 + 160;
    cloudMesh.visible = free < 0 || free <= 2;
    seaMesh.position.x = cam.x; seaMesh.position.z = cam.z;
    const su = seaMat.uniforms; su.time.value = t; su.cam.value.copy(cam); su.fogCol.value.copy(scene.fog.color); su.fogNear.value = scene.fog.near; su.fogFar.value = scene.fog.far;
    su.skyHor.value.copy(skyMat.uniforms.hor.value); su.skyMid.value.copy(skyMat.uniforms.mid.value);
    if (env.zone === 4){ su.glintDir.value.set(0, MOON.y - cam.y, MOON.z - cam.z).normalize(); su.glintCol.value.setRGB(.8, .85, 1); }
    else { su.glintDir.value.copy(skyMat.uniforms.sunDir.value); su.glintCol.value.copy(skyMat.uniforms.sunCol.value); }
    const pu = puffMesh.material.uniforms; pu.sunCol.value.copy(skyMat.uniforms.sunCol.value);
    pu.lit.value.copy(skyMat.uniforms.hor.value).lerp(tmpC.setHex(0xffffff), .75);
    pu.dark.value.copy(skyMat.uniforms.mid.value).lerp(tmpC.setHex(0x8a8aa8), .55);
    sun.target.position.copy(cam); sun.position.add(cam);
    // white-out inside the cloud floor
    const inside = (free < 0 && cam.z > DIVE_Z0 + 160) || free > 2 ? 0 : 1 - smooth(4, 26, Math.abs(cam.y - CLOUD_Y));
    if (inside > 0){ scene.fog.color.lerp(tmpC.setHex(0xf0eef6), inside * .9); scene.fog.near = lerp(scene.fog.near, 2, inside); scene.fog.far = lerp(scene.fog.far, 70, inside); }
    return inside;
  }

  /* ---------- the flight band: what is below (and above) you here ---------- */
  const band = { floor: 0, kind: 'cloud', ceil: 200 };
  function bandAt(x, z){
    const k = zoneAt(z);
    if (free < 0 && z < ZONE_Z[1] + 40 && hillH(x, z) > CLOUD_Y - 2){ band.floor = hillH(x, z); band.kind = 'ground'; band.ceil = 180; return band; }
    if (k <= 2 && (free >= 0 || z < DIVE_Z0 + 140)){ band.floor = CLOUD_Y; band.kind = 'cloud'; band.ceil = k === 2 ? 210 : 180; return band; }
    band.floor = SEA_Y; band.kind = 'sea';
    if (free === 3) band.ceil = -25;
    else if (free === 4) band.ceil = 200;
    else if (z < ZONE_Z[4]) band.ceil = z < DIVE_Z1 ? lerp(100, -25, smooth(DIVE_Z0, DIVE_Z1, z)) : -25;
    else band.ceil = lerp(-25, GATE_Y + 90, smooth(ZONE_Z[4], ZONE_Z[4] + 500, z));
    return band;
  }

  /* ---------- queries ---------- */
  function hitCol(c, x, y, z, r){
    switch (c.t){
      case 'sph': { const dx = x - c.x, dy = y - c.y, dz = z - c.z, rr = c.r + r; const d2 = dx * dx + dy * dy + dz * dz; return d2 < rr * rr ? Math.sqrt(d2) - c.r : 99; }
      case 'cyl': { if (y < c.y0 - r || y > c.y1 + r) return 99; const d = Math.hypot(x - c.x, z - c.z) - c.r; return d < r ? d : 99; }
      case 'box': { const dx = Math.max(c.x0 - x, 0, x - c.x1), dy = Math.max(c.y0 - y, 0, y - c.y1), dz = Math.max(c.z0 - z, 0, z - c.z1); const d = Math.hypot(dx, dy, dz); return d < r ? d : 99; }
      case 'cone': { if (y > c.yTop + r || y < c.yTop - c.h - r) return 99; const rr = c.rTop * clamp(1 - (c.yTop - y) / c.h, 0, 1); const d = Math.hypot(x - c.x, z - c.z) - rr; return d < r ? d : 99; }
    }
    return 99;
  }
  // nearest solid thing within reach (for crashes and near misses)
  function probe(x, y, z, r){
    let best = null, bd = 99;
    for (const e of active){
      if (!e.col || Math.abs(e.z - z) > 80) continue;
      for (const c of e.col){ const d = hitCol(c, x, y, z, r); if (d < bd){ bd = d; best = e; } }
    }
    return { e: best, d: bd };
  }
  function softAt(x, y, z){
    for (const e of active){
      if (e.kind !== 'cumulus' || Math.abs(e.z - z) > e.w + 10) continue;
      const k = (y - e.y) / e.h; if (k < -.05 || k > 1.05) continue;
      const rr = e.w * (1 - clamp(k, 0, 1) * .55) * .9;
      const dx = x - e.x, dz = (z - e.z) / .8; if (dx * dx + dz * dz < rr * rr) return e;
    }
    return null;
  }

  function init(sc, r){
    scene = sc; renderer = r;
    scene.add(makeSky()); scene.add(makeCloudSea()); scene.add(makeSea()); scene.add(makePuffs());
    scene.fog = new THREE.Fog(0x000000, 60, 600);
    hemi = new THREE.HemisphereLight(0xffffff, 0x000000, .8); scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 2); sun.castShadow = false;
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14; sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -14;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 220; sun.shadow.bias = -.0008; sun.shadow.normalBias = .04;
    scene.add(sun); scene.add(sun.target);
    hill = makeHill(); scene.add(hill);
    moon = Md.moon(MOON.R); moon.position.set(0, MOON.y, MOON.z); scene.add(moon);
    birdSys = Md.birds(birdsMax); scene.add(birdSys.group);
    buildEnvMap();
    setEnv(0, 0, 0);
  }
  function buildEnvMap(){
    // one soft studio-sky environment for reflections on the bike
    const pm = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene();
    const s = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(.55,.5,.5), vec3(1.1,1.05,1.), smoothstep(-.2,.3,h)); c = mix(c, vec3(.5,.7,1.1), smoothstep(.3,.9,h)); gl_FragColor = vec4(c,1.); }' }));
    envScene.add(s);
    const sunP = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.6, 3), side: THREE.DoubleSide })); sunP.position.set(30, 40, 60); sunP.lookAt(0, 0, 0); envScene.add(sunP);
    scene.environment = pm.fromScene(envScene, .02).texture; pm.dispose();
  }
  function setShadowSize(n){ sun.castShadow = n > 0; if (n > 0){ sun.shadow.mapSize.set(n, n); if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; } } }

  return {
    ZONES, ZONE_Z, GOAL_Z, ROAD_END, CLOUD_Y, SEA_Y, DIVE_Z0, DIVE_Z1, MOON, GATE_Y,
    init, buildRun, update, envAt, followCam, bandAt, probe, softAt, zoneAt, progressIn, yRoad, hillH, setShadowSize,
    get ents(){ return ents; }, get active(){ return active; }, get birds(){ return birdSys; }, get free(){ return free; }, get env(){ return env; }, get hill(){ return hill; }, get moon(){ return moon; },
  };
})();
