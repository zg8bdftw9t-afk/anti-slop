import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 1280, CH = 536;
const TL = await (await fetch('timeline.json')).json();
const SC = TL.scenes, Ti = TL.impact, FPS = TL.fps;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, CH); renderer.setPixelRatio(1);
document.getElementById('view').prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x2b2f66, 0.012);
const camera = new THREE.PerspectiveCamera(50, W / CH, 0.1, 600);
const composer = new EffectComposer(renderer); composer.setSize(W, CH);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, CH), 0.38, 0.5, 0.84));
composer.addPass(new OutputPass());

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(11);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const lerpV = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

// ---------- terrain ----------
function h(x, z) {
  const hill = 11 * Math.exp(-((x - 27) ** 2 + (z + 14) ** 2) / (2 * 8 * 8));
  const roll = 0.6 * Math.sin(x * 0.3) * Math.cos(z * 0.27) + 0.4 * Math.sin(x * 0.11 + z * 0.17);
  return hill + roll * sm((Math.hypot(x, z) - 7) / 7);
}
{
  const g = new THREE.PlaneGeometry(260, 260, 230, 230); g.rotateX(-Math.PI / 2); g.translate(20, 0, -15);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = h(p.getX(i), p.getZ(i)); p.setY(i, y);
    const t = clamp(y / 11), n = 0.92 + 0.16 * Math.sin(p.getX(i) * 1.7) * Math.cos(p.getZ(i) * 1.3);
    col.set([lerp(0.13, 0.36, t) * n, lerp(0.45, 0.70, t) * n, lerp(0.32, 0.38, t) * n], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
}
// ---------- sky ----------
{
  const g = new THREE.SphereGeometry(400, 32, 16), p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = clamp((p.getY(i) / 400 + 0.03) / 0.7), a = [0.50, 0.30, 0.62], b = [0.16, 0.20, 0.52], c = [0.03, 0.04, 0.17];
    const q = Math.sqrt(t), m = q < 0.5 ? lerpV(a, b, q / 0.5) : lerpV(b, c, (q - 0.5) / 0.5);
    col.set(m, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
}
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
const GT = glowTex();
function sprite(color, size, op = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GT, color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: op }));
  s.scale.set(size, size, 1); return s;
}
function points(n, size, fog = false) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const m = new THREE.PointsMaterial({ size, map: GT, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); return p;
}
const starSets = [0, 1].map(k => {
  const n = 450, p = points(n, 2.8 + k * 1.2, false), pos = p.geometry.attributes.position, col = p.geometry.attributes.color;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, y = 0.04 + Math.pow(R(), 0.8) * 0.96, r = Math.sqrt(1 - y * y) * 300;
    pos.setXYZ(i, Math.cos(a) * r, y * 300, Math.sin(a) * r);
    const b = 0.5 + R() * 0.5; col.setXYZ(i, b, b, b * 0.95 + 0.05);
  }
  return p;
});
{
  const m = new THREE.Mesh(new THREE.SphereGeometry(11, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
  m.position.set(-60, 85, -230); scene.add(m);
  const g1 = sprite(0xbcc8ff, 110, 0.55); g1.position.copy(m.position); scene.add(g1);
}

// ---------- storybook forest ----------
const curve = new THREE.CatmullRomCurve3([[1, -0.4], [8, -5], [14, -9.5], [19.5, -11.5], [25.5, -13.5]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
const curveLen = curve.getLength();
const pathSamples = Array.from({ length: 80 }, (_, i) => curve.getPointAt(i / 79));
{
  const spots = []; let tries = 0;
  while (spots.length < 150 && tries++ < 4000) {
    const x = -45 + R() * 100, z = -55 + R() * 80;
    if (Math.hypot(x + 0.5, z - 0.5) < 8 || h(x, z) > 7) continue;
    if (pathSamples.some(p => Math.hypot(p.x - x, p.z - z) < 6.5)) continue;
    spots.push([x, z, 0.9 + R() * 0.9, R() * 6.28, R()]);
  }
  const n = spots.length, d = new THREE.Object3D(), c = new THREE.Color();
  const greens = [0x2f9e5a, 0x38b06a, 0x2a8f80, 0x4cb86a, 0x5bbf5a], blossoms = [0xff9ec7, 0xc79bff];
  const mk = (geo, em) => new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.85, emissive: em }), n);
  const trunk = mk(new THREE.CylinderGeometry(0.28, 0.42, 1, 10), 0x1a0e06);
  const can = [mk(new THREE.SphereGeometry(1, 20, 14), 0x0b1f14), mk(new THREE.SphereGeometry(1, 20, 14), 0x0b1f14), mk(new THREE.SphereGeometry(1, 20, 14), 0x0b1f14)];
  const OFF = [[0, 3.3, 0, 1.9], [-1.1, 2.5, 0.4, 1.35], [1.1, 2.4, -0.3, 1.4]];
  spots.forEach(([x, z, s, ang, r], i) => {
    const y = h(x, z);
    d.position.set(x, y + 0.9 * s, z); d.scale.set(s, 1.8 * s, s); d.rotation.set(0, ang, 0); d.updateMatrix(); trunk.setMatrixAt(i, d.matrix);
    trunk.setColorAt(i, c.set(0x6b4426));
    const col = r < 0.17 ? blossoms[i % 2] : greens[i % 5];
    OFF.forEach(([ox, oy, oz, rr], k) => {
      const wx = (ox * Math.cos(ang) + oz * Math.sin(ang)) * s, wz = (-ox * Math.sin(ang) + oz * Math.cos(ang)) * s;
      d.position.set(x + wx, y + oy * s, z + wz); d.scale.set(rr * s, rr * s * 0.9, rr * s); d.updateMatrix(); can[k].setMatrixAt(i, d.matrix);
      can[k].setColorAt(i, c.set(col).multiplyScalar(k === 0 ? 1 : 1.12));
    });
  });
  scene.add(trunk); can.forEach(m => scene.add(m));
  // flowers, glowing mushrooms
  const fc = [0xff6fa8, 0xffd23f, 0x7fd8ff, 0xffffff, 0xc79bff];
  for (let i = 0; i < 80; i++) {
    const a = R() * Math.PI * 2, r = 2 + R() * 10, x = Math.cos(a) * r - 0.5, z = Math.sin(a) * r + 0.5;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ color: fc[i % 5], emissive: fc[i % 5], emissiveIntensity: 0.6 }));
    m.position.set(x, h(x, z) + 0.22, z); scene.add(m);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 5), new THREE.MeshStandardMaterial({ color: 0x2a8a3a }));
    s.position.set(x, h(x, z) + 0.11, z); scene.add(s);
  }
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, r = 6 + R() * 9, x = Math.cos(a) * r, z = Math.sin(a) * r, cc = i % 2 ? 0x5ff0ff : 0xff7bd5, sc = 0.7 + R() * 0.8;
    if (pathSamples.some(p => Math.hypot(p.x - x, p.z - z) < 2)) continue;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * sc, 0.08 * sc, 0.4 * sc, 8), new THREE.MeshStandardMaterial({ color: 0xf5eee0 }));
    st.position.set(x, h(x, z) + 0.2 * sc, z); scene.add(st);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3 * sc, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: cc, emissive: cc, emissiveIntensity: 1.1 }));
    cap.position.set(x, h(x, z) + 0.4 * sc, z); scene.add(cap);
  }
}

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0x9aa8ff, 0x24342a, 1.0));
const moonL = new THREE.DirectionalLight(0xbccaff, 1.5); moonL.position.set(-20, 40, 30); scene.add(moonL);
const starLight = new THREE.PointLight(0xffc94d, 0, 40, 2); scene.add(starLight);

// ---------- expressive face ----------
function sph(r, mat, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat); m.scale.set(sx, sy, sz); return m; }
function makeFace(o) {
  const { eyeX, eyeY, eyeR, iris, browY, mouthY, mouthR, eyeZ, mouthZ, cheekX, cheekY, cheekZ, browColor = 0x6b4a3a } = o;
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, emissive: 0x666666 });
  const irisM = new THREE.MeshStandardMaterial({ color: iris, roughness: 0.3, emissive: iris, emissiveIntensity: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.15 });
  const hlM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const browM = new THREE.MeshStandardMaterial({ color: browColor });
  const pink = new THREE.MeshBasicMaterial({ color: 0xff8fa3, transparent: true, opacity: 0.8 });
  const eyes = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(s * eyeX, eyeY, eyeZ); g.add(eg);
    eg.add(sph(eyeR, white, 1, 1.2, 0.55));
    const ir = new THREE.Group(); ir.position.z = eyeR * 0.35; eg.add(ir);
    ir.add(sph(eyeR * 0.74, irisM, 1, 1.2, 0.44));
    const p = sph(eyeR * 0.42, black, 1, 1.2, 0.4); p.position.z = eyeR * 0.3; ir.add(p);
    const h1 = sph(eyeR * 0.26, hlM); h1.position.set(eyeR * 0.28, eyeR * 0.4, eyeR * 0.85); eg.add(h1);
    const h2 = sph(eyeR * 0.12, hlM); h2.position.set(-eyeR * 0.24, -eyeR * 0.26, eyeR * 0.85); eg.add(h2);
    const bp = new THREE.Group(); bp.position.set(s * eyeX, browY, eyeZ + eyeR * 0.15); g.add(bp);
    const bm = new THREE.Mesh(new THREE.CapsuleGeometry(eyeR * 0.14, eyeR * 1.2, 4, 8), browM); bm.rotation.z = Math.PI / 2; bp.add(bm);
    const ch = sph(eyeR * 0.75, pink, 1, 0.65, 0.3); ch.position.set(s * cheekX, cheekY, cheekZ); g.add(ch);
    eyes.push({ eg, ir, bp, s });
  }
  const mg = new THREE.Group(); mg.position.set(0, mouthY, mouthZ); g.add(mg);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a0d0d });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(mouthR, mouthR * 0.16, 8, 24, Math.PI), dark); smile.rotation.z = Math.PI; smile.position.y = mouthR * 0.5; mg.add(smile);
  const frown = new THREE.Mesh(new THREE.TorusGeometry(mouthR * 0.8, mouthR * 0.16, 8, 24, Math.PI), dark); frown.position.y = -mouthR * 0.4; mg.add(frown);
  const open = new THREE.Group(); mg.add(open);
  open.add(sph(mouthR * 0.9, new THREE.MeshStandardMaterial({ color: 0x7a1020 }), 1, 1, 0.45));
  const tongue = sph(mouthR * 0.5, new THREE.MeshBasicMaterial({ color: 0xff7a90 }), 1.1, 0.55, 0.5); tongue.position.set(0, -mouthR * 0.4, mouthR * 0.12); open.add(tongue);
  function set(a) {
    const { brow = 0, tilt = 0, smile: sm_ = 0.6, open: op = 0, wide = 1, blink = 0, lx = 0, ly = 0 } = a;
    eyes.forEach(e => {
      e.eg.scale.set(wide, wide * lerp(1, 0.08, blink), 1);
      e.ir.position.x = lx * eyeR * 0.3; e.ir.position.y = ly * eyeR * 0.3;
      e.bp.position.y = browY + eyeR * (brow * 0.55 + (wide - 1) * 1.4); e.bp.rotation.z = -e.s * tilt * 0.55;
    });
    if (op > 0.08) { open.visible = true; smile.visible = frown.visible = false; open.scale.set(1 + 0.25 * Math.max(sm_, 0), op * 1.2, 1); }
    else { open.visible = false; smile.visible = sm_ >= 0; frown.visible = sm_ < 0; smile.scale.set(1, Math.max(0.2, sm_), 1); frown.scale.set(1, Math.max(0.2, -sm_), 1); }
  }
  return { g, set };
}

// ---------- Bobo ----------
function makeRabbit() {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const white = new THREE.MeshStandardMaterial({ color: 0xfff0e0, roughness: 0.9, emissive: 0x6a5648 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xffa8c0, roughness: 0.8, emissive: 0x402030 });
  const red = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.8, emissive: 0x330a0e });
  const body = sph(0.5, white, 1, 1.0, 1.15); body.position.set(0, 0.55, 0); inner.add(body);
  const head = new THREE.Group(); head.position.set(0, 1.15, 0.32); inner.add(head);
  head.add(sph(0.62, white, 1.08, 0.95, 1));
  const face = makeFace({ eyeX: 0.26, eyeY: 0.04, eyeR: 0.17, iris: 0x6b3b1f, browY: 0.3, mouthY: -0.26, mouthR: 0.1, eyeZ: 0.5, mouthZ: 0.54, cheekX: 0.42, cheekY: -0.16, cheekZ: 0.38 });
  head.add(face.g);
  const nose = sph(0.06, pink, 1.3, 0.9, 0.9); nose.position.set(0, -0.1, 0.61); head.add(nose);
  const ears = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * 0.22, 0.5, -0.05); head.add(piv);
    const e = sph(0.14, white, 0.75, 3.0, 0.5); e.position.y = 0.42; piv.add(e);
    const ei = sph(0.1, pink, 0.6, 2.4, 0.3); ei.position.set(0, 0.42, 0.05); piv.add(ei);
    ears.push([piv, s]);
    for (let k = 0; k < 2; k++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0xd8d0e8 }));
      w.rotation.z = Math.PI / 2 + s * (k - 0.5) * 0.35; w.position.set(s * 0.6, -0.14 - k * 0.05, 0.42); head.add(w);
    }
  }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.1, 10, 24), red); scarf.rotation.x = Math.PI / 2 + 0.25; scarf.position.set(0, 0.86, 0.28); inner.add(scarf);
  const tailS = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.06), red); tailS.position.set(0.22, 0.62, 0.45); tailS.rotation.z = -0.25; inner.add(tailS);
  const tail = sph(0.2, white); tail.position.set(0, 0.62, -0.7); inner.add(tail);
  for (const s of [-1, 1]) {
    const f = sph(0.2, white, 0.8, 0.5, 1.6); f.position.set(s * 0.34, 0.12, -0.02); inner.add(f);
    const p = sph(0.13, white); p.position.set(s * 0.2, 0.2, 0.5); inner.add(p);
  }
  g.scale.setScalar(1.4); scene.add(g);
  return { g, inner, head, ears, face };
}
const rabbit = makeRabbit();

// ---------- Bintang ----------
function makeStar() {
  const g = new THREE.Group();
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.52 : 1.0; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelSize: 0.14, bevelThickness: 0.14, bevelSegments: 6 }); geo.translate(0, 0, -0.15);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd93a, emissive: 0xffb300, emissiveIntensity: 0.9, roughness: 0.45 });
  g.add(new THREE.Mesh(geo, mat));
  const face = makeFace({ eyeX: 0.21, eyeY: 0.09, eyeR: 0.13, iris: 0x3a2412, browY: 0.3, mouthY: -0.14, mouthR: 0.09, eyeZ: 0.0, mouthZ: 0.0, cheekX: 0.34, cheekY: -0.06, cheekZ: 0.0, browColor: 0x7a4a10 });
  face.g.position.z = 0.3; g.add(face.g);
  const glow = sprite(0xffcf4a, 5, 0.9); g.add(glow);
  scene.add(g); return { g, face, glow, mat };
}
const star = makeStar();
function blob() { const m = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })); m.rotation.x = -Math.PI / 2; scene.add(m); return m; }
const rShadow = blob(), sShadow = blob();

// ---------- particles ----------
const NF = 230, ff = points(NF, 0.7, true);
const ffHome = Array.from({ length: NF }, () => { const a = R() * 6.283, r = 2 + R() * 14; return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.6 + R() * 3, ph: [R() * 6.3, R() * 6.3, R() * 6.3], lat: (R() - 0.5) * 2.6, hy: R() * 1.6, k: R() }; });
const NT = 110, trail = points(NT, 0.9), trailRnd = Array.from({ length: NT }, () => [R() - 0.5, R() - 0.5, R() - 0.5]);
const NB = 320, burst = points(NB, 0.5), burstV = Array.from({ length: NB }, () => { const a = R() * 6.283, e = R() * 1.2 - 0.1, s = 3 + R() * 7; return [Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 3, Math.sin(a) * Math.cos(e) * s]; });
const NL = 80;
const leaves = Array.from({ length: NL }, (_, i) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), new THREE.MeshBasicMaterial({ color: [0x9a6a2a, 0xb88a30, 0x7a8a2a, 0xa05a2a][i % 4], side: THREE.DoubleSide, fog: true }));
  scene.add(m); return { m, b: [R(), R(), R()], sp: 0.5 + R(), ph: R() * 6.3 };
});
const streak = Array.from({ length: 16 }, (_, i) => { const s = sprite(0xffffff, 6 - i * 0.3, 1 - i / 18); scene.add(s); s.visible = false; return s; });

// ---------- timeline ----------
function sceneAt(T) { T = clamp(T, 0, TL.total - 0.001); for (let i = SC.length - 1; i >= 0; i--) if (T >= SC[i].start) return [i, (T - SC[i].start) / SC[i].dur]; return [0, 0]; }
const gnd = (x, z) => h(x, z);
const A = [1, -0.4], Lp = [3, gnd(3, -2) + 1.0, -2];
const SKY0 = [-18, 28, -34], SKY1 = [17, 23, -26];
const S2f = SC[2].start + 0.5;
const sOf = u => 0.985 * (0.15 * sm(u) + 0.85 * u);
function followPos(s, T) {
  const q = curve.getPointAt(clamp(s + 0.045)), tn = curve.getTangentAt(clamp(s));
  const x = q.x - tn.z * 1.0, z = q.z + tn.x * 1.0;
  return [x, gnd(x, z) + 2.0 + 0.15 * Math.sin(T * 2.2), z];
}
const endPt = curve.getPointAt(0.985), Ep = [endPt.x, gnd(endPt.x, endPt.z), endPt.z];
function hopWave(ph, H) { const n = Math.floor(ph), f = ph - n; if (f < 0.28) return { y: 0, sq: 1 - 0.16 * Math.sin(f / 0.28 * Math.PI) }; const a = (f - 0.28) / 0.72; return { y: H * Math.sin(Math.PI * a), sq: 1 + 0.14 * Math.sin(Math.PI * a) }; }
const hopProg = ph => { const n = Math.floor(ph), f = ph - n; return n + clamp((f - 0.28) / 0.72); };

function starState(T) {
  const [i, u] = sceneAt(T);
  let pos, scale = 1, vis = true, light = 10, glow = 5;
  if (i <= 1 || (i === 2 && T < S2f)) { pos = SKY0; vis = false; light = 0; }
  else if (i === 2) {
    if (T < Ti) { const p = clamp((T - S2f) / (Ti - S2f)); pos = lerpV(SKY0, Lp, Math.pow(p, 1.7)); scale = 1.1; light = 40; glow = 9; }
    else { const a = T - Ti; pos = [Lp[0], Lp[1] + 0.6 * Math.exp(-a * 1.6) * Math.abs(Math.sin(a * 6)), Lp[2]]; light = 10 + 700 * Math.exp(-a * 4); glow = 5 + 8 * Math.exp(-a * 3); }
  } else if (i === 3) { pos = [Lp[0], Lp[1] + 0.12 * Math.sin(T * 2), Lp[2]]; }
  else if (i === 4) { pos = [Lp[0], Lp[1] + 0.6 * sm(u / 0.7) + 0.1 * Math.sin(T * 2), Lp[2]]; light = 12; }
  else if (i === 5) { const e4 = [Lp[0], Lp[1] + 0.6, Lp[2]]; pos = lerpV(e4, followPos(sOf(u), T), sm(u / 0.1)); light = 12; }
  else if (i === 6) {
    const top = followPos(sOf(1), T), pe = Math.pow(sm((u - 0.52) / 0.48), 1.25);
    const sp = Math.sin(pe * Math.PI) * 3.5, an = pe * 9;
    pos = lerpV(top, SKY1, pe); pos = [pos[0] + Math.cos(an) * sp, pos[1], pos[2] + Math.sin(an) * sp];
    scale = 1 + 1.6 * pe; light = 12 + 25 * Math.sin(Math.min(1, u / 0.5) * Math.PI / 2) * (1 - pe); glow = 5 + 4 * pe;
  } else { pos = [SKY1[0], SKY1[1] + 0.4 * Math.sin(T * 1.5), SKY1[2]]; scale = 2.6; light = 0; glow = 8 + 1 * Math.sin(T * 3); }
  return { pos, scale, vis, light, glow };
}
function rabbitState(T, i, u, sp) {
  let x = -2.5, z = 2.2, yaw = 0.5, y = 0, sq = 1, tilt = 0, earUp = 0;
  const a = T - Ti, hw = (ph, H) => { const w = hopWave(ph, H); y = w.y; sq = w.sq; };
  if (i === 0) { yaw = 0.5 + 0.1 * Math.sin(T * 1.5); }
  else if (i === 1) { yaw = lerp(0.5, Math.PI, sm(u / 0.2)); tilt = -0.65 * sm(u / 0.3); }
  else if (i === 2) {
    yaw = Math.PI; tilt = -0.65;
    if (a > 0) { const ph = a / 0.65; hw(Math.min(ph, 1), 0.9); z = 2.2 + 0.7 * hopProg(Math.min(ph, 1)); tilt = lerp(-0.65, 0.05, sm(a / 0.6)); earUp = 1; yaw = lerp(Math.PI, 2.22, sm((a - 0.8) / 1.0)); }
  } else if (i === 3) {
    const q = clamp((u - 0.2) / 0.55), ph = q * 3; hw(ph, 0.45); const pr = hopProg(ph) / 3;
    x = lerp(-2.5, A[0], pr); z = lerp(2.9, A[1], pr); yaw = q >= 1 ? 2.24 : (q === 0 ? 2.22 : 2.3);
  } else if (i === 4) {
    x = A[0]; z = A[1]; const t0 = curve.getTangentAt(0.001), py = Math.atan2(t0.x, t0.z);
    yaw = lerp(2.24, py, sm((u - 0.5) / 0.3)); if (u > 0.6) hw((u - 0.6) * 6, 0.3); earUp = 1;
  } else if (i === 5) {
    const N5 = Math.round(0.985 * curveLen / 1.5), ph = (sOf(u) / 0.985) * N5; hw(ph, 0.4);
    const s = 0.985 * hopProg(ph) / N5, p = curve.getPointAt(s), tn = curve.getTangentAt(s); x = p.x; z = p.z; yaw = Math.atan2(tn.x, tn.z);
  } else {
    x = Ep[0]; z = Ep[2]; yaw = Math.atan2(sp[0] - x, sp[2] - z); tilt = -0.55;
    if (i === 6) hw(T * 2.2, 0.5 * sm(u / 0.1) * (1 - sm((u - 0.8) / 0.15))); earUp = 1;
  }
  return { x, z, yaw, y, sq, tilt, earUp };
}

// ---------- camera ----------
function kf(keys, u) {
  for (let k = 0; k < keys.length - 1; k++) if (u <= keys[k + 1][0] || k === keys.length - 2) {
    const t = sm((u - keys[k][0]) / (keys[k + 1][0] - keys[k][0]));
    return [lerpV(keys[k][1], keys[k + 1][1], t), lerpV(keys[k][2], keys[k + 1][2], t)];
  }
}
function camFollow(s) {
  s = clamp(s); const p = curve.getPointAt(s), tn = curve.getTangentAt(s), gy = gnd(p.x, p.z);
  const cx = p.x + tn.x * 4.2 + tn.z * 4.6, cz = p.z + tn.z * 4.2 - tn.x * 4.6;
  const tx = p.x + tn.x * 0.8, tz = p.z + tn.z * 0.8;
  return [[cx, Math.max(gnd(cx, cz) + 1.6, gy + 2.2), cz], [tx, gnd(tx, tz) + 1.5, tz]];
}
const S0end = [[0.5 + Math.sin(0.5) * 10, 4.2, 0.5 + Math.cos(0.5) * 10], [-1, 1.5, 1.5]];
const S1k = [[0, ...S0end], [0.3, [-3.5, 1.0, 8.5], [-1.5, 10, -10]], [0.55, [-3, 1.2, 8], [-1, 16, -14]], [0.85, [-1.2, 1.6, -3.9], [-2.5, 1.6, 2.2]], [1, [-1.4, 1.6, -3.6], [-2.5, 1.6, 2.2]]];
const S2k = [[0, [-5, 2.2, 8], [0, 6, -6]], [0.45, [-5, 2.2, 8], [0, 6, -6]], [1, [-2.5, 2.0, 6.5], [1.5, 2.4, -3]]];
const S3k = [[0, S2k[2][1], S2k[2][2]], [0.35, [8.3, 1.7, -3.8], [1.6, 1.4, -0.8]], [1, [7.8, 1.6, -3.4], [1.8, 1.4, -0.9]]];
const S4k = [[0, S3k[2][1], S3k[2][2]], [0.55, [7.4, 1.8, -3.0], [2.1, 1.7, -1.0]], [1, ...camFollow(0)]];
const S6a = camFollow(1);
const S6k = [[0, ...S6a], [0.35, [Ep[0] + 5, Ep[1] + 2.4, Ep[2] + 3], [Ep[0], Ep[1] + 1.8, Ep[2]]], [1, [Ep[0] + 4, Ep[1] + 3, Ep[2] + 9], SKY1]];
const S7k = [[0, S6k[2][1], SKY1], [1, [Ep[0] + 7, Ep[1] + 3.5, Ep[2] + 14], [Ep[0] - 3, Ep[1] + 4, Ep[2] - 10]]];
function camAt(T, i, u) {
  let p, t;
  if (i === 0) { const a = lerp(-0.7, 0.5, sm(u)); p = [0.5 + Math.sin(a) * 10, lerp(3, 4.2, u), 0.5 + Math.cos(a) * 10]; t = [-1, 1.5, 1.5]; }
  else if (i === 1) [p, t] = kf(S1k, u);
  else if (i === 2) [p, t] = kf(S2k, u);
  else if (i === 3) [p, t] = kf(S3k, u);
  else if (i === 4) [p, t] = kf(S4k, u);
  else if (i === 5) [p, t] = camFollow(sOf(u));
  else if (i === 6) { [p, t] = kf(S6k, u); t = lerpV(t, starState(T).pos, sm((u - 0.5) / 0.4)); }
  else [p, t] = kf(S7k, u);
  if (i === 2 && T > Ti) { const a = T - Ti, k = 0.35 * Math.exp(-a * 2.5); p = [p[0] + k * Math.sin(a * 60), p[1] + k * Math.sin(a * 47 + 1), p[2]]; }
  return [p, t];
}

// ---------- subtitles ----------
const el = id => document.getElementById(id);
const NAMES = { B: ['Bobo', '#ffb3c8'], S: ['Bintang', '#ffe066'] };
let lastSub = '';
function subtitleHTML(T, i) {
  if (i === 5) {
    const ln = TL.song.find(l => T >= l.words[0].t0 - 0.5 && T <= l.words[l.words.length - 1].t1 + 0.4);
    if (ln) return `<span>♪ ${ln.words.map(w => `<span class="${T >= w.t0 ? 'on' : ''}">${w.w}</span>`).join(' ')} ♪</span>`;
  }
  const sg = SC[i].segs.find(s => T >= s.t0 - 0.1 && T <= s.t1 + 0.5);
  if (!sg || (i === 7 && sg.text === 'Tamat.')) return '';
  return sg.sp === 'N' ? `<i>${sg.text}</i>` : `<span><b style="color:${NAMES[sg.sp][1]}">${NAMES[sg.sp][0]}:</b>${sg.text}</span>`;
}

// ---------- frame ----------
const mouthAt = (sp, T) => { const a = TL.mouth[sp]; return a[clamp(Math.round(T * FPS), 0, a.length - 1)] || 0; };
const blinkAt = (T, off) => { const m = (T + off) % 3.4; return m < 0.16 ? Math.sin(Math.PI * m / 0.16) : 0; };
function look(from, yaw, target) {
  const vx = target[0] - from[0], vy = target[1] - from[1], vz = target[2] - from[2], d = Math.hypot(vx, vy, vz) + 1e-3;
  const lx = vx * Math.cos(yaw) - vz * Math.sin(yaw), lz = vx * Math.sin(yaw) + vz * Math.cos(yaw);
  return [clamp(lx / Math.max(Math.abs(lz), 1.5), -1, 1), clamp(vy / d * 2.2, -1, 1)];
}
function update(T) {
  const [i, u] = sceneAt(T);
  const st = starState(T);
  const [cp, ct] = camAt(T, i, u);
  camera.position.set(...cp); camera.lookAt(...ct); camera.updateMatrixWorld();
  starSets.forEach((s, k) => { s.material.opacity = 0.65 + 0.35 * Math.sin(T * (2 + k * 1.3) + k * 2); });

  // Bobo
  const rs = rabbitState(T, i, u, st.pos), ry = gnd(rs.x, rs.z), a = T - Ti;
  rabbit.g.position.set(rs.x, ry + rs.y, rs.z); rabbit.g.rotation.y = rs.yaw;
  const sq = rs.sq + 0.015 * Math.sin(T * 2.2); rabbit.inner.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  const spk = mouthAt('B', T);
  rabbit.head.rotation.x = rs.tilt + 0.05 * spk; rabbit.head.rotation.z = 0.06 * Math.sin(T * 7) * spk;
  const air = rs.y > 0.03;
  rabbit.ears.forEach(([p, s], k) => { p.rotation.z = s * (rs.earUp ? 0.1 : 0.3) + 0.04 * Math.sin(T * 2 + k); p.rotation.x = (air ? -0.4 : 0.1) + 0.05 * Math.sin(T * 3 + k); });
  rShadow.position.set(rs.x, ry + 0.04, rs.z); rShadow.scale.setScalar(1.4 * (1 - clamp(rs.y, 0, 1) * 0.4));
  // Bobo expression
  {
    const e = { brow: 0.2, tilt: 0, smile: 0.7, wide: 1, lx: 0, ly: 0 };
    if (i === 0) { e.smile = 0.9; e.brow = 0.4; }
    else if (i === 1) { e.brow = 0.6; e.smile = 0.9; e.wide = 1.1; }
    else if (i === 2) { if (a < 0) { e.brow = 0.9; e.wide = 1.18; e.smile = 0.1; } else { e.brow = 1; e.wide = 1.3 - 0.15 * sm(a / 1.5); e.tilt = 0.4; e.smile = -0.2; } }
    else if (i === 3) { if (u < 0.55) { e.brow = 0.3; e.tilt = 0.7; e.smile = 0.0; } else { e.brow = 0.5; e.tilt = 0.2; e.smile = 0.7; } }
    else if (i === 4) { e.brow = 0.5; e.smile = 0.9; }
    else if (i === 5) { e.brow = 0.5; e.smile = 1; }
    else if (i === 6) { e.brow = 0.4; e.smile = 0.8; e.tilt = 0.45; e.wide = 1.08; }
    else { e.brow = 0.35; e.smile = 0.9; }
    const hp = [rs.x, ry + 2.0, rs.z];
    let tgt = null;
    if (i <= 1) tgt = i === 1 && u > 0.8 ? cp : [rs.x - 4, ry + 14, rs.z - 6]; else if (st.vis) tgt = st.pos; else tgt = cp;
    if (i === 7) tgt = st.pos;
    const [lx, ly] = look(hp, rs.yaw, tgt);
    rabbit.face.set({ ...e, open: spk * 0.85, blink: blinkAt(T, 0.7), lx, ly });
  }

  // Bintang
  star.g.visible = st.vis; sShadow.visible = st.vis && st.pos[1] < gnd(st.pos[0], st.pos[2]) + 6;
  star.g.position.set(...st.pos); star.g.scale.setScalar(0.8 * st.scale);
  const syaw = Math.atan2(camera.position.x - st.pos[0], camera.position.z - st.pos[2]);
  star.g.rotation.y = syaw; star.g.rotation.z = 0.12 * Math.sin(T * 2.3);
  star.glow.scale.set(st.glow, st.glow, 1); star.mat.emissiveIntensity = 0.55 + 0.2 * Math.sin(T * 4); star.glow.material.opacity = (i >= 3 && i <= 6 && st.pos[1] < 16) ? 0.4 : 0.9;
  starLight.position.set(...st.pos); starLight.intensity = st.vis ? st.light : 0;
  sShadow.position.set(st.pos[0], gnd(st.pos[0], st.pos[2]) + 0.05, st.pos[2]);
  sShadow.scale.setScalar(Math.max(0.2, 1.1 - (st.pos[1] - gnd(st.pos[0], st.pos[2])) * 0.12));
  {
    const e = { brow: 0.3, tilt: 0, smile: 0.9, wide: 1, lx: 0, ly: 0 };
    if (i === 2) { if (T < Ti) { e.tilt = 0.9; e.smile = -0.8; e.wide = 1.25; e.brow = 0.8; } else { e.tilt = 0.6; e.smile = -0.5; e.wide = 1.0; } }
    else if (i === 3) { e.tilt = 0.9; e.smile = -0.8; e.brow = 0.1; if (u > 0.78) { e.tilt = 0.3; e.smile = 0.2; } }
    else if (i === 4) { if (u < 0.45) { e.tilt = 0.5; e.smile = 0.1; } else { e.smile = 1; e.brow = 0.7; e.wide = 1.1; } }
    else if (i === 6) { e.smile = 1; e.brow = 0.7; e.wide = 1.12; }
    const tg = [rs.x, ry + 2.0, rs.z];
    const [lx, ly] = look(st.pos, syaw, i === 6 || i === 7 ? tg : tg);
    star.face.set({ ...e, open: mouthAt('S', T) * 0.85, blink: blinkAt(T, 1.9), lx, ly });
  }
  // shooting star (scene 1)
  streak.forEach((s, k) => {
    const q = sm((u - 0.62) / 0.14), on = i === 1 && u > 0.62 && u < 0.78;
    s.visible = on; if (on) { const hd = [lerp(-70, 20, q), lerp(70, 42, q), -110]; s.position.set(hd[0] - k * 2.2, hd[1] + k * 0.9, hd[2]); s.scale.setScalar(9 - k * 0.5); }
  });
  // fireflies
  {
    const pos = ff.geometry.attributes.position, col = ff.geometry.attributes.color;
    const w = i < 4 ? 0 : i === 4 ? sm((u - 0.15) / 0.65) : 1, frac = i < 4 ? 0.3 : i === 4 ? lerp(0.3, 1, w) : 1, fade = i === 7 ? 1 - 0.7 * sm(u / 0.5) : 1;
    ffHome.forEach((f, n) => {
      const rx = f.x + Math.sin(T * 0.5 + f.ph[0]) * 1.4, ry2 = f.y + Math.sin(T * 0.7 + f.ph[1]) * 0.6, rz = f.z + Math.cos(T * 0.4 + f.ph[2]) * 1.4;
      const pp = curve.getPointAt(f.k * 0.99), tn = curve.getTangentAt(f.k * 0.99);
      const px = pp.x - tn.z * f.lat + Math.sin(T + f.ph[0]) * 0.25, pz = pp.z + tn.x * f.lat + Math.cos(T + f.ph[1]) * 0.25, py = gnd(pp.x, pp.z) + 0.6 + f.hy + Math.sin(T * 1.3 + f.ph[2]) * 0.2;
      const lx = lerp(rx, px, w), lz = lerp(rz, pz, w), ly = lerp(ry2, py, w);
      pos.setXYZ(n, lx, Math.max(ly, gnd(lx, lz) + 0.3), lz);
      const vis = (f.k < frac ? 1 : 0) * fade, pulse = 0.55 + 0.45 * Math.sin(T * 3 - f.k * 20 + f.ph[0] * (1 - w));
      col.setXYZ(n, pulse * vis, 0.95 * pulse * vis, 0.35 * pulse * vis);
    });
    pos.needsUpdate = true; col.needsUpdate = true;
  }
  // star trail
  {
    const pos = trail.geometry.attributes.position, col = trail.geometry.attributes.color;
    let amp = 0.12;
    if (i === 2 && T >= S2f && T < Ti) amp = 1; else if (i === 6) amp = lerp(0.12, 1, sm((u - 0.5) / 0.08)); else if (i === 7) amp = lerp(1, 0.12, sm(u / 0.5)); else if (i < 2 || (i === 2 && T < S2f)) amp = 0;
    for (let n = 0; n < NT; n++) {
      const age = ((T * 0.9 + n / NT) % 1), sp = starState(Math.max(0, T - age)).pos, r = trailRnd[n];
      pos.setXYZ(n, sp[0] + r[0] * age * 2.4, sp[1] + r[1] * age * 2.4 - age * 0.5, sp[2] + r[2] * age * 2.4);
      const b = (1 - age) * amp; col.setXYZ(n, b, 0.85 * b, 0.35 * b);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
  // impact burst
  {
    const pos = burst.geometry.attributes.position, col = burst.geometry.attributes.color;
    for (let n = 0; n < NB; n++) {
      const v = burstV[n], on = a > 0 && a < 3;
      const x = Lp[0] + v[0] * a, y = Lp[1] + v[1] * a - 4.5 * a * a, z = Lp[2] + v[2] * a;
      pos.setXYZ(n, x, Math.max(y, gnd(x, z) + 0.1), z);
      const b = on ? Math.pow(1 - a / 3, 1.5) * (0.6 + 0.4 * Math.sin(T * 20 + n)) : 0; col.setXYZ(n, b, 0.9 * b, 0.4 * b);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
  // wind-blown leaves
  {
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    const c = [cp[0] + fwd.x * 10, cp[1] + fwd.y * 4, cp[2] + fwd.z * 10], L = 22;
    const wind = 0.8 * T + 14 * sm((T - Ti) / 2.5), wrap = v => ((v % L) + L) % L - L / 2;
    leaves.forEach(l => {
      const bx = l.b[0] * L * 3, by = l.b[1] * L, bz = l.b[2] * L * 3;
      const x = c[0] + wrap(bx + wind * l.sp - c[0]), z = c[2] + wrap(bz + 0.3 * Math.sin(T + l.ph) - c[2]);
      const y = Math.max(gnd(x, z) + 0.15, c[1] + wrap(by - T * (0.3 + 0.2 * l.sp) - c[1] + 3) * 0.45 + 0.5 * Math.sin(T * 2 + l.ph));
      l.m.position.set(x, y, z); l.m.visible = Math.hypot(x - cp[0], y - cp[1], z - cp[2]) > 3.5;
      l.m.rotation.set(T * 2 * l.sp + l.ph, T * 1.5 + l.ph, T * 1.2);
    });
  }
  // overlays
  const sub = el('sub'), html = subtitleHTML(T, i);
  if (html !== lastSub) { sub.innerHTML = html; lastSub = html; }
  sub.style.opacity = html ? 1 : 0;
  el('title').style.opacity = i === 0 ? clamp((T - 0.3) / 1.0) * (1 - sm((T - 8) / 1.5)) : 0;
  el('tamat').style.opacity = i === 7 ? sm((T - SC[7].segs[1].t0) / 0.6) : 0;
  el('flash').style.opacity = (i === 2 && a > 0) ? 0.95 * Math.exp(-a * 5) : 0;
  el('black').style.opacity = Math.max(1 - T / 1.0, (T - (TL.total - 1.2)) / 1.2, 0);
  composer.render();
}
window.renderT = T => update(T);
window.TOTAL = TL.total; window.FPS = FPS;
window.READY = true;
