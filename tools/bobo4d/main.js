import * as THREE from 'three';
const W = 1280, H = 720;
const TL = await (await fetch('timeline.json')).json();
const SC = TL.scenes, Ti = TL.impact;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
document.getElementById('wrap').prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a2548, 0.013);
const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 600);

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
  const d = Math.hypot(x, z);
  return hill + roll * sm((d - 7) / 7);
}
{
  const g = new THREE.PlaneGeometry(260, 260, 230, 230); g.rotateX(-Math.PI / 2); g.translate(20, 0, -15);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = h(p.getX(i), p.getZ(i)); p.setY(i, y);
    const t = clamp(y / 11);
    const c = [lerp(0.10, 0.30, t), lerp(0.36, 0.62, t), lerp(0.20, 0.30, t)];
    const n = 0.9 + 0.2 * Math.sin(p.getX(i) * 1.7) * Math.cos(p.getZ(i) * 1.3);
    col.set([c[0] * n, c[1] * n, c[2] * n], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
}

// ---------- sky ----------
{
  const g = new THREE.SphereGeometry(400, 32, 16), p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = clamp((p.getY(i) / 400 + 0.05) / 0.8);
    const a = [0.17, 0.24, 0.5], b = [0.02, 0.03, 0.12];
    col.set([lerp(a[0], b[0], Math.sqrt(t)), lerp(a[1], b[1], Math.sqrt(t)), lerp(a[2], b[2], Math.sqrt(t))], i * 3);
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
// stars
const starSets = [0, 1].map(k => {
  const n = 450, p = points(n, 2.8 + k * 1.2, false), pos = p.geometry.attributes.position, col = p.geometry.attributes.color;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, y = 0.04 + Math.pow(R(), 0.8) * 0.96, r = Math.sqrt(1 - y * y) * 300;
    pos.setXYZ(i, Math.cos(a) * r, y * 300, Math.sin(a) * r);
    const b = 0.5 + R() * 0.5; col.setXYZ(i, b, b, b * 0.95 + 0.05);
  }
  return p;
});
// moon
{
  const m = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
  m.position.set(-60, 85, -230); scene.add(m);
  const g1 = sprite(0xbcc8ff, 90, 0.5); g1.position.copy(m.position); scene.add(g1);
}

// ---------- trees ----------
const curve = new THREE.CatmullRomCurve3([[1, -0.4], [8, -5], [14, -9.5], [19.5, -11.5], [25.5, -13.5]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
const curveLen = curve.getLength();
const pathSamples = Array.from({ length: 80 }, (_, i) => curve.getPointAt(i / 79));
{
  const spots = [];
  let tries = 0;
  while (spots.length < 170 && tries++ < 4000) {
    const x = -45 + R() * 100, z = -55 + R() * 80;
    if (Math.hypot(x + 0.5, z - 0.5) < 8) continue;
    if (h(x, z) > 7) continue;
    if (pathSamples.some(p => Math.hypot(p.x - x, p.z - z) < 3.2)) continue;
    if (Math.hypot(x + 3, z - 6) < 4) continue;
    spots.push([x, z, 0.9 + R() * 1.0]);
  }
  const n = spots.length;
  const parts = [
    [new THREE.CylinderGeometry(0.25, 0.35, 1.4, 8), 0.7, 0x5a3820],
    [new THREE.ConeGeometry(1.7, 2.6, 9), 2.2, 0x1f7a45],
    [new THREE.ConeGeometry(1.35, 2.3, 9), 3.5, 0x259255],
    [new THREE.ConeGeometry(0.95, 2.0, 9), 4.7, 0x2ea35f],
  ];
  const d = new THREE.Object3D(), c = new THREE.Color();
  for (const [geo, off, colr] of parts) {
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9, emissive: 0x06140c }), n);
    spots.forEach(([x, z, s], i) => {
      d.position.set(x, h(x, z) + off * s, z); d.scale.set(s, s, s); d.rotation.y = i; d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      c.set(colr).multiplyScalar(0.85 + 0.3 * ((i * 37) % 10) / 10); im.setColorAt(i, c);
    });
    scene.add(im);
  }
  // flowers & mushrooms in clearing
  const fc = [0xff6fa8, 0xffd23f, 0x7fd8ff, 0xffffff, 0xc79bff];
  for (let i = 0; i < 70; i++) {
    const a = R() * Math.PI * 2, r = 2 + R() * 9, x = Math.cos(a) * r - 0.5, z = Math.sin(a) * r + 0.5;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ color: fc[i % 5], emissive: fc[i % 5], emissiveIntensity: 0.5 }));
    m.position.set(x, h(x, z) + 0.2, z); scene.add(m);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 5), new THREE.MeshStandardMaterial({ color: 0x2a8a3a }));
    s.position.set(x, h(x, z) + 0.1, z); scene.add(s);
  }
}

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0x8fa0e8, 0x1c2b22, 0.9));
const moonL = new THREE.DirectionalLight(0xa8bcff, 1.4); moonL.position.set(-20, 40, 30); scene.add(moonL);
const starLight = new THREE.PointLight(0xffc94d, 0, 40, 2); scene.add(starLight);

// ---------- characters ----------
function sph(r, mat, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat); m.scale.set(sx, sy, sz); return m; }
function makeRabbit() {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const white = new THREE.MeshStandardMaterial({ color: 0xfff2e6, roughness: 0.9, emissive: 0x4a3f38 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xffa8c0, roughness: 0.8, emissive: 0x402030 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
  const body = sph(0.62, white, 1, 0.95, 1.25); body.position.set(0, 0.65, 0); inner.add(body);
  const head = new THREE.Group(); head.position.set(0, 1.25, 0.5); inner.add(head);
  head.add(sph(0.46, white));
  for (const s of [-1, 1]) {
    const e = sph(0.075, black); e.position.set(s * 0.19, 0.08, 0.39); head.add(e);
    const hl = sph(0.025, new THREE.MeshBasicMaterial({ color: 0xffffff })); hl.position.set(s * 0.19 + 0.02, 0.11, 0.45); head.add(hl);
    const ch = sph(0.1, pink, 1, 0.7, 0.4); ch.position.set(s * 0.28, -0.1, 0.34); head.add(ch);
  }
  const nose = sph(0.06, pink); nose.position.set(0, -0.02, 0.45); head.add(nose);
  const ears = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * 0.17, 0.36, -0.05); head.add(piv);
    const e = sph(0.14, white, 0.7, 2.8, 0.5); e.position.y = 0.5; piv.add(e);
    const ei = sph(0.1, pink, 0.6, 2.3, 0.3); ei.position.set(0, 0.5, 0.05); piv.add(ei);
    ears.push([piv, s]);
  }
  const tail = sph(0.2, white); tail.position.set(0, 0.72, -0.8); inner.add(tail);
  for (const s of [-1, 1]) {
    const f = sph(0.2, white, 0.8, 0.5, 1.6); f.position.set(s * 0.38, 0.12, -0.05); inner.add(f);
    const p = sph(0.13, white); p.position.set(s * 0.22, 0.14, 0.55); inner.add(p);
  }
  g.scale.setScalar(1.3); scene.add(g);
  return { g, inner, head, ears };
}
const rabbit = makeRabbit();
function makeStar() {
  const g = new THREE.Group();
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.5 : 1.0;
    const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y);
  }
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.1, bevelSegments: 4 }); geo.translate(0, 0, -0.15);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd93a, emissive: 0xffb300, emissiveIntensity: 0.9, roughness: 0.5 });
  const body = new THREE.Mesh(geo, mat); g.add(body);
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1208 });
  const face = new THREE.Group(); face.position.z = 0.27; g.add(face);
  for (const s of [-1, 1]) {
    const e = sph(0.075, black, 1, 1.3, 0.6); e.position.set(s * 0.2, 0.1, 0); face.add(e);
    const hl = sph(0.025, new THREE.MeshBasicMaterial({ color: 0xffffff })); hl.position.set(s * 0.2 + 0.02, 0.14, 0.04); face.add(hl);
    const ch = sph(0.08, new THREE.MeshBasicMaterial({ color: 0xff8fa3 }), 1, 0.7, 0.3); ch.position.set(s * 0.33, -0.08, 0); face.add(ch);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 20, Math.PI), black); smile.rotation.z = Math.PI; smile.position.set(0, -0.0, 0); face.add(smile);
  const frown = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 20, Math.PI), black); frown.position.set(0, -0.2, 0); face.add(frown);
  const glow = sprite(0xffcf4a, 5, 0.9); g.add(glow);
  scene.add(g); return { g, smile, frown, glow, mat };
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

// ---------- timeline helpers ----------
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

function starState(T) {
  const [i, u] = sceneAt(T);
  let pos, scale = 1, vis = true, light = 25, glow = 5, happy = i >= 4 && (i > 4 || u > 0.35);
  if (i <= 1 || (i === 2 && T < S2f)) { pos = SKY0; vis = false; light = 0; }
  else if (i === 2) {
    if (T < Ti) { const p = clamp((T - S2f) / (Ti - S2f)); pos = lerpV(SKY0, Lp, Math.pow(p, 1.7)); scale = 1.1; light = 40; glow = 9; }
    else { const a = T - Ti; pos = [Lp[0], Lp[1] + 0.6 * Math.exp(-a * 1.6) * Math.abs(Math.sin(a * 6)), Lp[2]]; light = 25 + 700 * Math.exp(-a * 4); glow = 5 + 8 * Math.exp(-a * 3); }
  } else if (i === 3) { pos = [Lp[0], Lp[1] + 0.12 * Math.sin(T * 2), Lp[2]]; }
  else if (i === 4) { pos = [Lp[0], Lp[1] + 0.6 * sm(u / 0.5) + 0.1 * Math.sin(T * 2), Lp[2]]; light = 30; }
  else if (i === 5) { const e4 = [Lp[0], Lp[1] + 0.6, Lp[2]]; pos = lerpV(e4, followPos(sOf(u), T), sm(u / 0.12)); light = 32; }
  else if (i === 6) {
    const top = followPos(sOf(1), T), pe = Math.pow(sm((u - 0.28) / 0.72), 1.25);
    const sp = Math.sin(pe * Math.PI) * 3.5, an = pe * 9;
    pos = lerpV(top, SKY1, pe); pos = [pos[0] + Math.cos(an) * sp, pos[1], pos[2] + Math.sin(an) * sp];
    scale = 1 + 1.6 * pe; light = 30 + 40 * Math.sin(Math.min(1, u / 0.3) * Math.PI / 2) * (1 - pe); glow = 5 + 4 * pe;
  } else { pos = [SKY1[0], SKY1[1] + 0.4 * Math.sin(T * 1.5), SKY1[2]]; scale = 2.6; light = 0; glow = 8 + 1 * Math.sin(T * 3); }
  return { pos, scale, vis, light, glow, happy };
}

function rabbitState(T, i, u, sp) {
  let x = -2.5, z = 2.2, yaw = 0.5, hop = 0, tilt = 0, earUp = 0;
  const a = T - Ti;
  if (i === 0) { yaw = 0.5 + 0.1 * Math.sin(T * 1.5); }
  else if (i === 1) { yaw = lerp(0.5, Math.PI, sm(u / 0.2)); tilt = -0.65 * sm(u / 0.3); }
  else if (i === 2) {
    yaw = Math.PI; tilt = -0.65;
    if (a > 0) { hop = 0.9 * Math.sin(Math.PI * clamp(a / 0.5)); z = 2.2 + 0.7 * sm(a / 0.5); tilt = lerp(-0.65, 0.05, sm(a / 0.6)); earUp = 1; yaw = lerp(Math.PI, 2.22, sm((a - 0.8) / 1.0)); }
  } else if (i === 3) {
    const q = clamp((u - 0.12) / 0.63); x = lerp(-2.5, A[0], q); z = lerp(2.9, A[1], q);
    yaw = 2.3; hop = q > 0 && q < 1 ? 0.45 * Math.abs(Math.sin(q * 3 * Math.PI)) : 0; if (q >= 1) yaw = 2.24;
    if (q === 0) { x = -2.5; z = 2.9; yaw = 2.22; }
  } else if (i === 4) {
    x = A[0]; z = A[1]; const t0 = curve.getTangentAt(0.001), py = Math.atan2(t0.x, t0.z);
    yaw = lerp(2.24, py, sm((u - 0.2) / 0.3)); if (u > 0.45) hop = 0.3 * Math.abs(Math.sin((u - 0.45) * 7 * Math.PI)); earUp = 1;
  } else if (i === 5) {
    const s = sOf(u), p = curve.getPointAt(s), tn = curve.getTangentAt(s); x = p.x; z = p.z; yaw = Math.atan2(tn.x, tn.z);
    hop = 0.4 * Math.abs(Math.sin(s * curveLen / 1.2 * Math.PI));
  } else {
    x = Ep[0]; z = Ep[2]; const q = sp; yaw = Math.atan2(q[0] - x, q[2] - z); tilt = -0.55;
    if (i === 6) hop = 0.5 * Math.abs(Math.sin(T * 5)) * sm(u / 0.2) * (1 - sm((u - 0.85) / 0.15)); earUp = 1;
  }
  return { x, z, yaw, hop, tilt, earUp };
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
  const cx = p.x - tn.x * 8 - tn.z * 2.8, cz = p.z - tn.z * 8 + tn.x * 2.8;
  return [[cx, Math.max(gnd(cx, cz) + 2.0, gy + 3.4), cz], [p.x + tn.x * 3, gnd(p.x + tn.x * 3, p.z + tn.z * 3) + 1.5, p.z + tn.z * 3]];
}
const S0end = [[0.5 + Math.sin(0.5) * 10, 4.2, 0.5 + Math.cos(0.5) * 10], [-1, 1.5, 1.5]];
const S1k = [[0, ...S0end], [0.35, [-3.5, 1.0, 8.5], [-1.5, 10, -10]], [1, [-3, 1.2, 8], [-1, 16, -14]]];
const S1end = [S1k[2][1], S1k[2][2]];
const S2k = [[0, ...S1end], [0.45, [-5, 2.2, 8], [0, 6, -6]], [1, [-2.5, 2.0, 6.5], [1.5, 2.4, -3]]];
const S3k = [[0, S2k[2][1], S2k[2][2]], [1, [0.2, 1.8, 6.5], [1.8, 1.2, -1.4]]];
const S4k = [[0, S3k[1][1], S3k[1][2]], [1, ...camFollow(0)]];
const S6a = camFollow(1);
const S6mid = [[Ep[0] - 7, Ep[1] + 3.5, Ep[2] + 11], [Ep[0] + 0.5, Ep[1] + 2.2, Ep[2] - 1]];
const S6end = [[Ep[0] - 8, Ep[1] + 4.5, Ep[2] + 13], SKY1];
const S6k = [[0, ...S6a], [0.4, ...S6mid], [1, ...S6end]];
const S7k = [[0, ...S6end], [1, [Ep[0] - 9, Ep[1] + 4.5, Ep[2] + 19], [Ep[0] + 1, Ep[1] + 2.5, Ep[2] - 10]]];
function camAt(T, i, u) {
  let p, t;
  if (i === 0) { const a = lerp(-0.7, 0.5, sm(u)); p = [0.5 + Math.sin(a) * 10, lerp(3, 4.2, u), 0.5 + Math.cos(a) * 10]; t = [-1, 1.5, 1.5]; }
  else if (i === 1) [p, t] = kf(S1k, u);
  else if (i === 2) [p, t] = kf(S2k, u);
  else if (i === 3) [p, t] = kf(S3k, u);
  else if (i === 4) [p, t] = kf(S4k, u);
  else if (i === 5) [p, t] = camFollow(sOf(u));
  else if (i === 6) { [p, t] = kf(S6k, u); t = lerpV(t, starState(T).pos, sm((u - 0.3) / 0.6)); }
  else [p, t] = kf(S7k, u);
  if (i === 2 && T > Ti) { const a = T - Ti, k = 0.35 * Math.exp(-a * 2.5); p = [p[0] + k * Math.sin(a * 60), p[1] + k * Math.sin(a * 47 + 1), p[2]]; }
  return [p, t];
}

// ---------- frame ----------
const el = id => document.getElementById(id);
function update(T) {
  const [i, u] = sceneAt(T);
  const st = starState(T);
  const [cp, ct] = camAt(T, i, u);
  camera.position.set(...cp); camera.lookAt(...ct); camera.updateMatrixWorld();

  // stars twinkle
  starSets.forEach((s, k) => { s.material.opacity = 0.65 + 0.35 * Math.sin(T * (2 + k * 1.3) + k * 2); });

  // rabbit
  const rs = rabbitState(T, i, u, st.pos);
  const ry = gnd(rs.x, rs.z);
  rabbit.g.position.set(rs.x, ry + rs.hop, rs.z); rabbit.g.rotation.y = rs.yaw;
  const air = rs.hop > 0.02, sq = 1 + (air ? 0.07 : -0.03) + 0.015 * Math.sin(T * 2.2);
  rabbit.inner.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  rabbit.head.rotation.x = rs.tilt;
  rabbit.ears.forEach(([p, s], k) => { p.rotation.z = s * (rs.earUp ? 0.1 : 0.28) + 0.04 * Math.sin(T * 2 + k); p.rotation.x = (air ? -0.35 : 0.1) + 0.05 * Math.sin(T * 3 + k); });
  rShadow.position.set(rs.x, ry + 0.04, rs.z); rShadow.scale.setScalar(1.3 * (1 - clamp(rs.hop, 0, 1) * 0.4));

  // star
  star.g.visible = st.vis; sShadow.visible = st.vis && st.pos[1] < gnd(st.pos[0], st.pos[2]) + 6;
  star.g.position.set(...st.pos); star.g.scale.setScalar(0.8 * st.scale);
  star.g.rotation.y = Math.atan2(camera.position.x - st.pos[0], camera.position.z - st.pos[2]);
  star.g.rotation.z = 0.12 * Math.sin(T * 2.3);
  star.smile.visible = st.happy; star.frown.visible = !st.happy;
  star.glow.scale.set(st.glow, st.glow, 1);
  star.mat.emissiveIntensity = 0.8 + 0.3 * Math.sin(T * 4);
  starLight.position.set(...st.pos); starLight.intensity = st.vis ? st.light : 0;
  sShadow.position.set(st.pos[0], gnd(st.pos[0], st.pos[2]) + 0.05, st.pos[2]);
  sShadow.scale.setScalar(Math.max(0.2, 1.1 - (st.pos[1] - gnd(st.pos[0], st.pos[2])) * 0.12));

  // shooting star in scene 1
  streak.forEach((s, k) => {
    const q = sm((u - 0.78) / 0.2), on = i === 1 && u > 0.78 && u < 0.99;
    s.visible = on; if (on) { const hd = [lerp(-70, 20, q), lerp(70, 42, q), -110]; s.position.set(hd[0] - k * 2.2, hd[1] + k * 0.9, hd[2]); s.scale.setScalar((9 - k * 0.5)); }
  });

  // fireflies
  {
    const pos = ff.geometry.attributes.position, col = ff.geometry.attributes.color;
    const w = i < 4 ? 0 : i === 4 ? sm((u - 0.15) / 0.65) : 1;
    const frac = i < 4 ? 0.3 : i === 4 ? lerp(0.3, 1, w) : 1;
    const fade = i === 7 ? 1 - 0.7 * sm(u / 0.5) : 1;
    ffHome.forEach((f, n) => {
      const rx = f.x + Math.sin(T * 0.5 + f.ph[0]) * 1.4, ry2 = f.y + Math.sin(T * 0.7 + f.ph[1]) * 0.6, rz = f.z + Math.cos(T * 0.4 + f.ph[2]) * 1.4;
      const pp = curve.getPointAt(f.k * 0.99), tn = curve.getTangentAt(f.k * 0.99);
      const px = pp.x - tn.z * f.lat + Math.sin(T + f.ph[0]) * 0.25, pz = pp.z + tn.x * f.lat + Math.cos(T + f.ph[1]) * 0.25, py = gnd(pp.x, pp.z) + 0.6 + f.hy + Math.sin(T * 1.3 + f.ph[2]) * 0.2;
      const lx = lerp(rx, px, w), lz = lerp(rz, pz, w), ly = lerp(ry2, py, w);
      pos.setXYZ(n, lx, Math.max(ly, gnd(lx, lz) + 0.3), lz);
      const vis = (f.k < frac ? 1 : 0) * fade, pulse = 0.55 + 0.45 * Math.sin(T * 3 - f.k * 20 + f.ph[0] * (1 - w));
      col.setXYZ(n, 1.0 * pulse * vis, 0.95 * pulse * vis, 0.35 * pulse * vis);
    });
    pos.needsUpdate = true; col.needsUpdate = true;
  }
  // trail
  {
    const pos = trail.geometry.attributes.position, col = trail.geometry.attributes.color;
    const [, ] = [0, 0];
    let amp = 0.12;
    if (i === 2 && T >= S2f && T < Ti) amp = 1; else if (i === 6) amp = lerp(0.12, 1, sm((u - 0.2) / 0.1)); else if (i === 7) amp = lerp(1, 0.12, sm(u / 0.5)); else if (i < 2 || (i === 2 && T < S2f)) amp = 0;
    for (let n = 0; n < NT; n++) {
      const age = ((T * 0.9 + n / NT) % 1) * 1.0, sp = starState(Math.max(0, T - age)).pos, r = trailRnd[n];
      pos.setXYZ(n, sp[0] + r[0] * age * 2.4, sp[1] + r[1] * age * 2.4 - age * 0.5, sp[2] + r[2] * age * 2.4);
      const b = (1 - age) * amp; col.setXYZ(n, 1 * b, 0.85 * b, 0.35 * b);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
  // burst
  {
    const pos = burst.geometry.attributes.position, col = burst.geometry.attributes.color, a = T - Ti;
    for (let n = 0; n < NB; n++) {
      const v = burstV[n], on = a > 0 && a < 3;
      const x = Lp[0] + v[0] * a, y = Lp[1] + v[1] * a - 4.5 * a * a, z = Lp[2] + v[2] * a;
      pos.setXYZ(n, x, Math.max(y, gnd(x, z) + 0.1), z);
      const b = on ? Math.pow(1 - a / 3, 1.5) * (0.6 + 0.4 * Math.sin(T * 20 + n)) : 0; col.setXYZ(n, b, 0.9 * b, 0.4 * b);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
  // leaves (wind)
  {
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    const c = [cp[0] + fwd.x * 10, cp[1] + fwd.y * 4, cp[2] + fwd.z * 10], L = 22;
    const wind = 0.8 * T + 14 * sm((T - Ti) / 2.5);
    const wrap = v => ((v % L) + L) % L - L / 2;
    leaves.forEach((l, n) => {
      const bx = l.b[0] * L * 3, by = l.b[1] * L, bz = l.b[2] * L * 3;
      const x = c[0] + wrap(bx + wind * l.sp - c[0]), z = c[2] + wrap(bz + 0.3 * Math.sin(T + l.ph) - c[2]);
      const y = Math.max(gnd(x, z) + 0.15, c[1] + wrap(by - T * (0.3 + 0.2 * l.sp) - c[1] + 3) * 0.45 + 0.5 * Math.sin(T * 2 + l.ph));
      l.m.position.set(x, y, z); l.m.visible = Math.hypot(x - cp[0], y - cp[1], z - cp[2]) > 3.5; l.m.rotation.set(T * 2 * l.sp + l.ph, T * 1.5 + l.ph, T * 1.2);
    });
  }

  // overlays
  const sub = el('sub'), tx = SC[i].text, lu = (T - SC[i].start);
  sub.textContent = i === 0 ? '' : tx; sub.style.opacity = i === 0 ? 0 : clamp(lu / 0.4) * clamp((SC[i].dur - lu) / 0.4);
  el('title').style.opacity = i === 0 ? clamp(T / 0.8) * (1 - sm((u - 0.8) / 0.2)) : 0;
  el('tamat').style.opacity = i === 7 ? sm((u - 0.62) / 0.15) : 0;
  const a = T - Ti; el('flash').style.opacity = (i === 2 && a > 0) ? 0.95 * Math.exp(-a * 5) : 0;
  el('black').style.opacity = Math.max(1 - T / 0.8, (T - (TL.total - 1.0)) / 1.0, 0);
  renderer.render(scene, camera);
}
window.renderT = T => update(T);
window.TOTAL = TL.total; window.FPS = TL.fps;
window.READY = true;
