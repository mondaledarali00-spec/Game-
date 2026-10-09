/* ============================================================
   FIRE ZONE — Free Fire style battle royale (single file)
   20 players drop on an island, loot weapons, survive the
   shrinking zone. Last one standing wins the BOOYAH.
   ============================================================ */
(function () {
'use strict';

/* ---------------- utils ---------------- */
function $(id) { return document.getElementById(id); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dist2d(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); }
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); var m = Math.floor(s / 60); var r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }

/* ---------------- config ---------------- */
var CFG = {
  mapR: 320,
  botCount: 29,
  walkSpeed: 7.0,
  sprintSpeed: 9.8,
  botSpeed: 4.2,
  botRush: 6.6,
  playerR: 0.45,
  gravity: 13.0,
  camDist: 4.8,
  camHeight: 1.55,
  shoulder: 0.85
};

var WEAPONS = {
  pistol:  { name: 'M500 PISTOL',   dmg: 16, rate: 0.32, mag: 10, reload: 1.1, range: 62,  spread: 0.018, pellets: 1, bloom: 0.010, kick: 0.010, snd: 'pistol' },
  smg:     { name: 'MP40 SMG',      dmg: 9,  rate: 0.085, mag: 32, reload: 1.7, range: 48, spread: 0.038, pellets: 1, bloom: 0.006, kick: 0.005, snd: 'smg' },
  rifle:   { name: 'AK47 RIFLE',    dmg: 23, rate: 0.15, mag: 30, reload: 2.1, range: 95, spread: 0.020, pellets: 1, bloom: 0.009, kick: 0.009, snd: 'rifle' },
  scar:    { name: 'SCAR-L RIFLE',  dmg: 19, rate: 0.115, mag: 35, reload: 2.0, range: 90, spread: 0.015, pellets: 1, bloom: 0.006, kick: 0.006, snd: 'scar' },
  lmg:     { name: 'M249 LMG',      dmg: 13, rate: 0.09, mag: 60, reload: 3.2, range: 80, spread: 0.045, pellets: 1, bloom: 0.005, kick: 0.007, snd: 'lmg' },
  shotgun: { name: 'M1014 SHOTGUN', dmg: 10, rate: 0.95, mag: 6,  reload: 2.5, range: 27, spread: 0.075, pellets: 7, bloom: 0.020, kick: 0.030, snd: 'shotgun' },
  sniper:  { name: 'M24 SNIPER',    dmg: 90, rate: 1.5, mag: 5,  reload: 2.8, range: 165, spread: 0.003, pellets: 1, bloom: 0.002, kick: 0.045, snd: 'sniper' }
};
var GUN_COLORS = { pistol: 0x708090, smg: 0x556677, rifle: 0x7a5230, scar: 0x4f6228, lmg: 0x565244, shotgun: 0x6b4a33, sniper: 0x33402e };

var BOT_NAMES = ['Viper', 'Ghost', 'Raptor', 'Nyx', 'Blaze', 'Frost', 'Havoc', 'Titan', 'Rex', 'Echo',
  'Jett', 'Shadow', 'Krait', 'Mamba', 'Zero', 'Onyx', 'Falcon', 'Draco', 'Sable', 'Rogue',
  'Lynx', 'Pyro', 'Sage', 'Wolf', 'Ember', 'Quake', 'Nova', 'Venom', 'Bolt'];

var ZONE_PHASES = [
  { wait: 30, shrink: 26, to: 190, dps: 2 },
  { wait: 22, shrink: 24, to: 115, dps: 4 },
  { wait: 18, shrink: 20, to: 66,  dps: 7 },
  { wait: 15, shrink: 18, to: 34,  dps: 10 },
  { wait: 13, shrink: 15, to: 14,  dps: 14 },
  { wait: 11, shrink: 13, to: 4,   dps: 18 }
];

/* ---------------- dom refs ---------------- */
var el = {
  canvas: $('game'), hud: $('hud'), aliveVal: $('aliveVal'), killVal: $('killVal'),
  zoneChip: $('zoneChip'), zoneTxt: $('zoneTxt'), killfeed: $('killfeed'), minimap: $('minimap'),
  hpfill: $('hpfill'), hpTxt: $('hpTxt'), medVal: $('medVal'), wname: $('wname'), ammo: $('ammo'),
  crosshair: $('crosshair'), hitmarker: $('hitmarker'), vignette: $('vignette'),
  banner: $('banner'), toast: $('toast'), medbar: $('medbar'), medfill: $('medfill'),
  menu: $('menu'), gameover: $('gameover'), pauseMenu: $('pauseMenu'),
  goTitle: $('gameoverTitle'), goStats: $('goStats')
};
var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
if (!isTouch) document.body.classList.add('desktop');

/* ---------------- audio (tiny synth, no assets) ---------------- */
var Sfx = {
  ctx: null, master: null,
  ensure: function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} } return; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      var len = this.ctx.sampleRate * 0.25;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = this.noise.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  env: function (node, t0, a, peak, dec) {
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
    node.connect(g); g.connect(this.master);
    return g;
  },
  burst: function (freq, peak, dec, vol) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var src = this.ctx.createBufferSource(); src.buffer = this.noise;
    var f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    src.connect(f); this.env(f, t, 0.005, peak * vol, dec);
    src.start(t); src.stop(t + dec + 0.05);
  },
  tone: function (type, f0, f1, dur, vol) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.env(o, t, 0.008, vol, dur);
    o.start(t); o.stop(t + dur + 0.05);
  },
  shot: function (kind, dist) {
    var v = clamp(1.6 / (1 + dist * 0.05), 0.05, 1);
    if (kind === 'shotgun') this.burst(420, 0.9, 0.22, v);
    else if (kind === 'rifle') this.burst(820, 0.8, 0.14, v);
    else if (kind === 'scar') this.burst(950, 0.72, 0.12, v);
    else if (kind === 'lmg') this.burst(650, 0.75, 0.16, v);
    else if (kind === 'sniper') { this.burst(300, 1.0, 0.3, v); this.tone('sine', 150, 55, 0.28, v * 0.55); }
    else if (kind === 'smg') this.burst(1300, 0.5, 0.08, v);
    else this.burst(1000, 0.7, 0.12, v);
  },
  hit: function () { this.tone('square', 1150, 900, 0.06, 0.25); },
  kill: function () { this.tone('square', 880, 880, 0.09, 0.3); var s = this; setTimeout(function () { s.tone('square', 1320, 1320, 0.12, 0.3); }, 90); },
  hurt: function () { this.tone('sawtooth', 170, 90, 0.14, 0.4); this.burst(240, 0.5, 0.1, 1); },
  heal: function () { this.tone('sine', 480, 920, 0.35, 0.3); },
  pickup: function () { var s = this; this.tone('sine', 700, 700, 0.06, 0.25); setTimeout(function () { s.tone('sine', 1050, 1050, 0.08, 0.25); }, 70); },
  warn: function () { var s = this; this.tone('triangle', 620, 620, 0.12, 0.3); setTimeout(function () { s.tone('triangle', 620, 620, 0.12, 0.3); }, 180); },
  empty: function () { this.tone('square', 220, 180, 0.05, 0.2); },
  zoneTick: function () { this.tone('sine', 110, 100, 0.1, 0.35); },
  booyah: function () { var s = this; [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { s.tone('triangle', f, f, 0.25, 0.35); }, i * 130); }); }
};

/* ---------------- three.js setup ---------------- */
var renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd4ff);
scene.fog = new THREE.Fog(0xa8d8ff, 130, 420);

var camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 900);

var hemi = new THREE.HemisphereLight(0xcfe8ff, 0x51683f, 0.95);
scene.add(hemi);
var sun = new THREE.DirectionalLight(0xfff1cf, 0.85);
sun.position.set(70, 120, 40);
scene.add(sun);

function onResize() {
  var w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

/* ---------------- textures ---------------- */
function grassTexture() {
  var c = document.createElement('canvas'); c.width = c.height = 256;
  var x = c.getContext('2d');
  x.fillStyle = '#4e7a37'; x.fillRect(0, 0, 256, 256);
  for (var i = 0; i < 900; i++) {
    var g = randi(0, 3);
    x.fillStyle = ['#587f3c', '#48702f', '#5d8544', '#436b2d'][g];
    var s = rand(2, 7);
    x.fillRect(rand(0, 256), rand(0, 256), s, s);
  }
  for (var j = 0; j < 40; j++) {
    x.fillStyle = 'rgba(120,140,70,0.25)';
    x.beginPath(); x.arc(rand(0, 256), rand(0, 256), rand(6, 18), 0, 6.3); x.fill();
  }
  var t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(34, 34);
  return t;
}

/* ---------------- world ---------------- */
var worldGroup = new THREE.Group();
scene.add(worldGroup);

var world = {
  circles: [],   // {x,z,r}
  boxes: [],     // {x0,x1,z0,z1,h}
  pickups: [],   // {type, weapon, amount, x,z, mesh, taken}
  buildings: []
};

function addBoxCollider(x, z, w, d, h) {
  world.boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: h });
}
function addCircleCollider(x, z, r) { world.circles.push({ x: x, z: z, r: r }); }

var _m4 = new THREE.Matrix4();
var _q = new THREE.Quaternion();
var _v3 = new THREE.Vector3();
var _e = new THREE.Euler();

function buildTerrain() {
  var ground = new THREE.Mesh(
    new THREE.CircleGeometry(CFG.mapR + 8, 56),
    new THREE.MeshLambertMaterial({ map: grassTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  worldGroup.add(ground);

  var beach = new THREE.Mesh(
    new THREE.CircleGeometry(CFG.mapR + 26, 56),
    new THREE.MeshLambertMaterial({ color: 0xd9c68a })
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.y = -0.25;
  worldGroup.add(beach);

  var sea = new THREE.Mesh(
    new THREE.CircleGeometry(900, 40),
    new THREE.MeshLambertMaterial({ color: 0x1d5c8a })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.5;
  worldGroup.add(sea);
}

function buildForest() {
  var N = 72;
  var trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.8, 6);
  var crownGeo = new THREE.ConeGeometry(2.0, 3.8, 7);
  var trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a4a21 }), N);
  var crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
  var placed = 0, guard = 0;
  while (placed < N && guard++ < 800) {
    var a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * (CFG.mapR - 14) + 8;
    var x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (dist2d(x, z, 0, 0) < 14) continue;
    var blocked = false;
    for (var i = 0; i < world.circles.length; i++) {
      if (dist2d(x, z, world.circles[i].x, world.circles[i].z) < 4) { blocked = true; break; }
    }
    if (blocked) continue;
    var s = rand(0.8, 1.5);
    _e.set(0, rand(0, 6.3), 0); _q.setFromEuler(_e);
    _v3.set(s, s, s);
    _m4.compose(new THREE.Vector3(x, 1.4 * s, z), _q, _v3);
    trunks.setMatrixAt(placed, _m4);
    _m4.compose(new THREE.Vector3(x, (2.8 + 1.9) * s, z), _q, _v3);
    crowns.setMatrixAt(placed, _m4);
    crowns.setColorAt(placed, new THREE.Color().setHSL(0.29 + rand(-0.04, 0.04), 0.5, rand(0.28, 0.4)));
    addCircleCollider(x, z, 0.55 * s);
    placed++;
  }
  trunks.count = placed; crowns.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  worldGroup.add(trunks); worldGroup.add(crowns);
}

function buildRocks() {
  var N = 26;
  var geo = new THREE.DodecahedronGeometry(1, 0);
  var rocks = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x8d8d95, flatShading: true }), N);
  var placed = 0, guard = 0;
  while (placed < N && guard++ < 400) {
    var a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * (CFG.mapR - 20) + 10;
    var x = Math.cos(a) * r, z = Math.sin(a) * r;
    var s = rand(0.6, 1.7);
    _e.set(rand(0, 0.4), rand(0, 6.3), rand(0, 0.4)); _q.setFromEuler(_e);
    _v3.set(s, s * 0.7, s);
    _m4.compose(new THREE.Vector3(x, s * 0.35, z), _q, _v3);
    rocks.setMatrixAt(placed, _m4);
    addCircleCollider(x, z, s * 0.9);
    placed++;
  }
  rocks.count = placed;
  rocks.instanceMatrix.needsUpdate = true;
  worldGroup.add(rocks);
}

function building(x, z, w, d, h, wallColor, roofColor) {
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: wallColor }));
  body.position.y = h / 2;
  g.add(body);
  var roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.6, 4), new THREE.MeshLambertMaterial({ color: roofColor }));
  roof.position.y = h + 0.8;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  g.position.set(x, 0, z);
  worldGroup.add(g);
  addBoxCollider(x, z, w, d, h + 1.6);
  world.buildings.push({ x: x, z: z, w: w, d: d });
}

function wallSeg(x, z, w, d, h) {
  var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: 0xb0a284 }));
  m.position.set(x, h / 2, z);
  worldGroup.add(m);
  addBoxCollider(x, z, w, d, h);
}

function buildTown() {
  var palette = [[0xcfc0a0, 0xa8422f], [0x9fb2c0, 0x445464], [0xd8d2c4, 0x7a5230]];
  for (var i = 0; i < 9; i++) {
    var a = (i / 9) * Math.PI * 2 + rand(-0.3, 0.3);
    var r = rand(60, CFG.mapR - 55);
    var cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    var p = pick(palette);
    building(cx, cz, rand(6, 10), rand(6, 10), rand(3.2, 4.6), p[0], p[1]);
    if (Math.random() < 0.7) building(cx + rand(-12, 12), cz + rand(-12, 12), rand(4, 7), rand(4, 7), rand(2.6, 3.6), p[0], p[1]);
    if (Math.random() < 0.5) wallSeg(cx + rand(-14, 14), cz + rand(-14, 14), rand(5, 9), 0.6, rand(1.6, 2.4));
  }
  // central watchtower
  building(0, 0, 3.2, 3.2, 7.5, 0x8a7a5c, 0x55432e);
}

function buildClouds() {
  var mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (var i = 0; i < 8; i++) {
    var c = new THREE.Mesh(new THREE.SphereGeometry(rand(6, 12), 7, 5), mat);
    c.scale.y = 0.35;
    c.position.set(rand(-300, 300), rand(80, 130), rand(-300, 300));
    c.userData.drift = rand(0.5, 1.5);
    worldGroup.add(c);
  }
}

/* ---------------- pickups ---------------- */
function weaponPickupMesh(kind) {
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.85), new THREE.MeshLambertMaterial({ color: GUN_COLORS[kind] }));
  g.add(body);
  var grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.12), new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
  grip.position.set(0, -0.16, 0.22);
  g.add(grip);
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 18), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return g;
}
function medPickupMesh() {
  var g = new THREE.Group();
  var box = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.34), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
  g.add(box);
  var c1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.36), new THREE.MeshLambertMaterial({ color: 0xd42a2a }));
  g.add(c1);
  var c2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.36), new THREE.MeshLambertMaterial({ color: 0xd42a2a }));
  g.add(c2);
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 18), new THREE.MeshLambertMaterial({ color: 0xff6a6a }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return g;
}
function ammoPickupMesh() {
  var g = new THREE.Group();
  var box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.3), new THREE.MeshLambertMaterial({ color: 0x4a7a2e }));
  g.add(box);
  for (var i = 0; i < 3; i++) {
    var b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6), new THREE.MeshLambertMaterial({ color: 0xd8b23a }));
    b.position.set(-0.1 + i * 0.1, 0.12, 0);
    g.add(b);
  }
  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 18), new THREE.MeshLambertMaterial({ color: 0xa0d860 }));
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  return g;
}

function pointFree(x, z, pad) {
  if (dist2d(x, z, 0, 0) > CFG.mapR - 8) return false;
  for (var i = 0; i < world.circles.length; i++) {
    if (dist2d(x, z, world.circles[i].x, world.circles[i].z) < world.circles[i].r + pad) return false;
  }
  for (var j = 0; j < world.boxes.length; j++) {
    var b = world.boxes[j];
    if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return false;
  }
  return true;
}

function spawnPickup(type, weapon, x, z) {
  var mesh;
  if (type === 'weapon') mesh = weaponPickupMesh(weapon);
  else if (type === 'med') mesh = medPickupMesh();
  else mesh = ammoPickupMesh();
  mesh.position.set(x, 0.55, z);
  worldGroup.add(mesh);
  world.pickups.push({ type: type, weapon: weapon, x: x, z: z, mesh: mesh, taken: false, spin: rand(0, 6.3) });
}

function scatterLoot() {
  var i, tries = 0, x, z;
  for (i = 0; i < 42; i++) {
    tries = 0;
    do { var a = rand(0, 6.3), r = Math.sqrt(Math.random()) * (CFG.mapR - 16) + 6; x = Math.cos(a) * r; z = Math.sin(a) * r; }
    while (!pointFree(x, z, 1.0) && ++tries < 60);
    if (tries >= 60) continue;
    var roll = Math.random();
    if (roll < 0.42) spawnPickup('weapon', pick(['smg', 'rifle', 'rifle', 'shotgun', 'smg']), x, z);
    else if (roll < 0.70) spawnPickup('ammo', null, x, z);
    else spawnPickup('med', null, x, z);
  }
  // guaranteed good loot near buildings
  for (i = 0; i < world.buildings.length; i++) {
    var b = world.buildings[i];
    var ang = rand(0, 6.3);
    x = b.x + Math.cos(ang) * (b.w * 0.9 + 1.4);
    z = b.z + Math.sin(ang) * (b.d * 0.9 + 1.4);
    if (!pointFree(x, z, 0.8)) continue;
    spawnPickup(Math.random() < 0.7 ? 'weapon' : 'med', pick(['rifle', 'smg', 'shotgun']), x, z);
  }
}

/* ---------------- soldiers ---------------- */
function makeSoldier(shirt, pants, skin, hat) {
  var g = new THREE.Group();
  var mShirt = new THREE.MeshLambertMaterial({ color: shirt });
  var mPants = new THREE.MeshLambertMaterial({ color: pants });
  var mSkin = new THREE.MeshLambertMaterial({ color: skin });

  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.66, 0.34), mShirt);
  torso.position.y = 1.1;
  g.add(torso);

  var head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 7), mSkin);
  head.position.y = 1.63;
  g.add(head);

  if (hat) {
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.1, 8), new THREE.MeshLambertMaterial({ color: hat }));
    cap.position.y = 1.76;
    g.add(cap);
    var brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.24), new THREE.MeshLambertMaterial({ color: hat }));
    brim.position.set(0, 1.72, 0.22);
    g.add(brim);
  }

  var legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.22);
  legGeo.translate(0, -0.3, 0);
  var legL = new THREE.Mesh(legGeo, mPants);
  legL.position.set(-0.15, 0.77, 0);
  g.add(legL);
  var legR = new THREE.Mesh(legGeo, mPants);
  legR.position.set(0.15, 0.77, 0);
  g.add(legR);

  var armGeo = new THREE.BoxGeometry(0.16, 0.52, 0.18);
  armGeo.translate(0, -0.26, 0);
  var armL = new THREE.Mesh(armGeo, mShirt);
  armL.position.set(-0.4, 1.38, 0);
  g.add(armL);
  var armR = new THREE.Mesh(armGeo, mShirt);
  armR.position.set(0.4, 1.38, 0);
  g.add(armR);

  var shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  g.add(shadow);

  g.userData = { legL: legL, legR: legR, armL: armL, armR: armR, torso: torso, gun: null, gunColor: 0x333333 };
  return g;
}

function attachGun(soldier, color) {
  var u = soldier.userData;
  if (u.gun) { u.armR.remove(u.gun); }
  var gun = new THREE.Group();
  var body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.72), new THREE.MeshLambertMaterial({ color: color }));
  gun.add(body);
  var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, 0.48);
  gun.add(barrel);
  gun.position.set(0, -0.5, 0.12);
  u.armR.add(gun);
  u.gun = gun;
}

function setGunColor(soldier, color) {
  var u = soldier.userData;
  if (u.gun) {
    u.gun.children[0].material.color.setHex(color);
    u.gunColor = color;
  }
}

/* ---------------- effects pools ---------------- */
var fx = { tracers: [], flashes: [], sparks: [] };

function initFx() {
  for (var i = 0; i < 22; i++) {
    var geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }));
    line.visible = false;
    scene.add(line);
    fx.tracers.push({ line: line, life: 0 });
  }
  var flashMat = new THREE.MeshBasicMaterial({ color: 0xffc766, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  for (var j = 0; j < 8; j++) {
    var f = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flashMat.clone());
    f.visible = false;
    scene.add(f);
    fx.flashes.push({ mesh: f, life: 0 });
  }
  var sparkMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  for (var k = 0; k < 10; k++) {
    var s = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), sparkMat.clone());
    s.visible = false;
    scene.add(s);
    fx.sparks.push({ mesh: s, life: 0 });
  }
}
initFx();

function spawnTracer(a, b) {
  for (var i = 0; i < fx.tracers.length; i++) {
    var t = fx.tracers[i];
    if (t.life <= 0) {
      var pos = t.line.geometry.attributes.position;
      pos.setXYZ(0, a.x, a.y, a.z);
      pos.setXYZ(1, b.x, b.y, b.z);
      pos.needsUpdate = true;
      t.line.visible = true;
      t.line.material.opacity = 0.9;
      t.life = 0.09;
      return;
    }
  }
}
function spawnFlash(p) {
  for (var i = 0; i < fx.flashes.length; i++) {
    var f = fx.flashes[i];
    if (f.life <= 0) {
      f.mesh.position.copy(p);
      f.mesh.quaternion.copy(camera.quaternion);
      f.mesh.rotation.z = rand(0, 6.3);
      f.mesh.scale.setScalar(rand(0.7, 1.3));
      f.mesh.visible = true;
      f.mesh.material.opacity = 1;
      f.life = 0.05;
      return;
    }
  }
}
function spawnSpark(p, colorHex) {
  for (var i = 0; i < fx.sparks.length; i++) {
    var s = fx.sparks[i];
    if (s.life <= 0) {
      s.mesh.position.copy(p);
      s.mesh.quaternion.copy(camera.quaternion);
      s.mesh.scale.setScalar(rand(1, 2.2));
      s.mesh.material.color.setHex(colorHex || 0xff3b3b);
      s.mesh.visible = true;
      s.mesh.material.opacity = 1;
      s.life = 0.14;
      return;
    }
  }
}
function updateFx(dt) {
  var i;
  for (i = 0; i < fx.tracers.length; i++) {
    var t = fx.tracers[i];
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) t.line.visible = false;
    }
  }
  for (i = 0; i < fx.flashes.length; i++) {
    var f = fx.flashes[i];
    if (f.life > 0) {
      f.life -= dt;
      f.mesh.material.opacity = Math.max(0, f.life / 0.05);
      if (f.life <= 0) f.mesh.visible = false;
    }
  }
  for (i = 0; i < fx.sparks.length; i++) {
    var s = fx.sparks[i];
    if (s.life > 0) {
      s.life -= dt;
      s.mesh.material.opacity = Math.max(0, s.life / 0.14);
      if (s.life <= 0) s.mesh.visible = false;
    }
  }
}

/* ---------------- raycasts / LOS ---------------- */
function rayCircle(ox, oz, dx, dz, c, maxT) {
  var mx = c.x - ox, mz = c.z - oz;
  var t = mx * dx + mz * dz;
  if (t < 0 || t > maxT) return Infinity;
  var px = ox + dx * t - c.x, pz = oz + dz * t - c.z;
  if (px * px + pz * pz <= c.r * c.r) return t;
  return Infinity;
}
function rayBoxT(ox, oz, dx, dz, b) {
  var tmin = 0.001, tmax = Infinity, t1, t2, tmp;
  if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) return Infinity; }
  else {
    t1 = (b.x0 - ox) / dx; t2 = (b.x1 - ox) / dx;
    if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) return Infinity; }
  else {
    t1 = (b.z0 - oz) / dz; t2 = (b.z1 - oz) / dz;
    if (t1 > t2) { tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
// nearest obstacle hit along 2d ray, returns t or Infinity (with height check via oy/dy)
function rayObstacles(ox, oy, oz, dx, dy, dz, maxT) {
  var best = maxT, i, t;
  for (i = 0; i < world.circles.length; i++) {
    var y = oy + dy * 0; // circles are ground objects; check y range roughly 0..3.6
    t = rayCircle(ox, oz, dx, dz, world.circles[i], best);
    if (t < best) {
      var hy = oy + dy * t;
      if (hy > 0 && hy < 3.8) best = t;
    }
  }
  for (i = 0; i < world.boxes.length; i++) {
    t = rayBoxT(ox, oz, dx, dz, world.boxes[i]);
    if (t < best) {
      var hy2 = oy + dy * t;
      if (hy2 > 0 && hy2 < world.boxes[i].h) best = t;
    }
  }
  return best;
}
function losClear(ax, ay, az, bx, by, bz) {
  var dx = bx - ax, dy = by - ay, dz = bz - az;
  var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < 0.001) return true;
  dx /= d; dy /= d; dz /= d;
  return rayObstacles(ax, ay, az, dx, dy, dz, d) >= d;
}

/* ---------------- collision resolve ---------------- */
function collide(pos, r) {
  for (var i = 0; i < world.circles.length; i++) {
    var c = world.circles[i];
    var d = dist2d(pos.x, pos.z, c.x, c.z);
    var min = c.r + r;
    if (d < min && d > 0.0001) {
      var push = (min - d) / d;
      pos.x += (pos.x - c.x) * push;
      pos.z += (pos.z - c.z) * push;
    }
  }
  for (var j = 0; j < world.boxes.length; j++) {
    var b = world.boxes[j];
    var cx = clamp(pos.x, b.x0, b.x1);
    var cz = clamp(pos.z, b.z0, b.z1);
    var dx = pos.x - cx, dz = pos.z - cz;
    var d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.000001) {
        var dd = Math.sqrt(d2);
        pos.x = cx + dx / dd * r;
        pos.z = cz + dz / dd * r;
      } else {
        // inside the box: push out along smallest axis
        var lx = Math.min(pos.x - b.x0, b.x1 - pos.x);
        var lz = Math.min(pos.z - b.z0, b.z1 - pos.z);
        if (lx < lz) pos.x = (pos.x - b.x0 < b.x1 - pos.x) ? b.x0 - r : b.x1 + r;
        else pos.z = (pos.z - b.z0 < b.z1 - pos.z) ? b.z0 - r : b.z1 + r;
      }
    }
  }
  var dc = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
  var lim = CFG.mapR + 18;
  if (dc > lim) { pos.x = pos.x / dc * lim; pos.z = pos.z / dc * lim; }
}

/* ---------------- player ---------------- */
var player = {
  alive: true, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  yaw: 0, elev: 0.18, hp: 100, kills: 0, meds: 1,
  mode: 'menu', // menu | drop | play | dead | win
  dropV: 0, para: null,
  weapons: ['pistol'], cur: 0,
  ammo: {}, reserve: {},
  fireCd: 0, reloadT: 0, healT: 0, bloom: 0,
  mesh: null, walkT: 0, moving: 0, sprinting: false
};

function resetPlayerState() {
  player.alive = true;
  player.hp = 100; player.kills = 0; player.meds = 1;
  player.weapons = ['pistol'];
  player.cur = 0;
  player.ammo = { pistol: 10 };
  player.reserve = { pistol: Infinity };
  player.fireCd = 0; player.reloadT = 0; player.healT = 0; player.bloom = 0;
  player.vel.set(0, 0, 0);
}
function currentWeapon() { return WEAPONS[player.weapons[player.cur]]; }
function currentWeaponKey() { return player.weapons[player.cur]; }

/* ---------------- bots ---------------- */
var bots = [];

function spawnBots() {
  var shirts = [0xd43f3f, 0x3f6fd4, 0x3fd46f, 0xd4b23f, 0x9b3fd4, 0xd43f96, 0x3fd4d4, 0xd4793f];
  for (var i = 0; i < CFG.botCount; i++) {
    var tries = 0, x = 0, z = 0;
    do {
      var a = rand(0, 6.3), r = Math.sqrt(Math.random()) * (CFG.mapR - 30) + 12;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } while (!pointFree(x, z, 1.2) && ++tries < 80);
    var mesh = makeSoldier(pick(shirts), 0x37414f, pick([0xe8b98a, 0xc98d5f, 0x8a5a3b]));
    attachGun(mesh, pick([0x555555, 0x6b4a33, 0x708090]));
    mesh.position.set(x, 0, z);
    worldGroup.add(mesh);
    var bot = {
      name: BOT_NAMES[i % BOT_NAMES.length],
      mesh: mesh, alive: true, deathT: 0,
      pos: new THREE.Vector3(x, 0, z), yaw: rand(0, 6.3),
      hp: 100, state: 'wander', target: null,
      fireT: rand(1, 3), strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(1, 2),
      stuckT: 0, lastX: x, lastZ: z,
      walkT: rand(0, 6), flashT: 0, shotRecent: 0, dmgCd: rand(0, 1.5),
      weapon: pick(['smg', 'rifle', 'shotgun', 'pistol'])
    };
    bots.push(bot);
  }
}
function botsAlive() {
  var n = 0;
  for (var i = 0; i < bots.length; i++) if (bots[i].alive) n++;
  return n;
}

/* ---------------- zone ---------------- */
var zone = {
  cx: 0, cz: 0, r: CFG.mapR,
  tx: 0, tz: 0, tr: CFG.mapR,
  phase: 0, t: 0, state: 'idle', // idle | wait | shrink | done
  dps: 0, dmgTick: 0, warned: false,
  wall: null, ring: null, targetRing: null
};

function buildZoneMeshes() {
  var wallGeo = new THREE.CylinderGeometry(1, 1, 70, 64, 1, true);
  var wallMat = new THREE.MeshBasicMaterial({ color: 0xff3545, transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false });
  zone.wall = new THREE.Mesh(wallGeo, wallMat);
  zone.wall.position.y = 35;
  zone.wall.visible = false;
  worldGroup.add(zone.wall);

  var ringGeo = new THREE.RingGeometry(0.975, 1.0, 72);
  var ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  zone.ring = new THREE.Mesh(ringGeo, ringMat);
  zone.ring.rotation.x = -Math.PI / 2;
  zone.ring.position.y = 0.1;
  zone.ring.visible = false;
  worldGroup.add(zone.ring);

  var pts = [];
  for (var i = 0; i <= 72; i++) {
    var a = i / 72 * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  var tgeo = new THREE.BufferGeometry().setFromPoints(pts);
  zone.targetRing = new THREE.Line(tgeo, new THREE.LineDashedMaterial({ color: 0x9fdcff, dashSize: 2.4, gapSize: 1.6, transparent: true, opacity: 0.9 }));
  zone.targetRing.computeLineDistances();
  zone.targetRing.rotation.x = -Math.PI / 2;
  zone.targetRing.position.y = 0.15;
  zone.targetRing.visible = false;
  worldGroup.add(zone.targetRing);
}

function resetZone() {
  zone.cx = 0; zone.cz = 0; zone.r = CFG.mapR;
  zone.tx = 0; zone.tz = 0; zone.tr = CFG.mapR;
  zone.phase = 0; zone.state = 'idle'; zone.t = 0; zone.dps = 0; zone.dmgTick = 0; zone.warned = false;
  zone.wall.visible = false; zone.ring.visible = false; zone.targetRing.visible = false;
}
function startZone() {
  zone.state = 'wait';
  zone.t = ZONE_PHASES[0].wait;
  zone.wall.visible = true; zone.ring.visible = true;
  showBanner('SAFE ZONE ACTIVE', '#9fdcff', 2.2);
  Sfx.warn();
}
function pickNextZone() {
  var ph = ZONE_PHASES[zone.phase];
  var shrinkTo = ph.to;
  var maxOff = Math.max(0, zone.r - shrinkTo) * 0.55;
  var a = rand(0, 6.3), d = rand(0, maxOff);
  var nx = zone.cx + Math.cos(a) * d, nz = zone.cz + Math.sin(a) * d;
  var dc = Math.sqrt(nx * nx + nz * nz);
  if (dc > CFG.mapR - shrinkTo) { nx *= (CFG.mapR - shrinkTo) / dc; nz *= (CFG.mapR - shrinkTo) / dc; }
  zone.tx = nx; zone.tz = nz; zone.tr = shrinkTo;
  zone.targetRing.position.set(nx, 0.15, nz);
  zone.targetRing.scale.set(shrinkTo, 1, shrinkTo);
  zone.targetRing.computeLineDistances();
  zone.targetRing.visible = true;
}
function updateZone(dt) {
  if (zone.state === 'idle' || zone.state === 'done') {
    if (zone.state === 'done') applyZoneDamage(dt);
    return;
  }
  zone.t -= dt;
  if (zone.state === 'wait') {
    if (!zone.warned && zone.t < 8) {
      zone.warned = true;
      showBanner('ZONE SHRINKING SOON', '#ff8c1a', 2);
      Sfx.warn();
    }
    if (zone.t <= 0) {
      zone.state = 'shrink';
      zone.t = ZONE_PHASES[zone.phase].shrink;
      zone.fromR = zone.r; zone.fromX = zone.cx; zone.fromZ = zone.cz;
      showBanner('ZONE SHRINKING!', '#ff5b5b', 2);
      Sfx.warn();
    }
  } else if (zone.state === 'shrink') {
    var ph = ZONE_PHASES[zone.phase];
    var k = 1 - clamp(zone.t / ph.shrink, 0, 1);
    zone.r = lerp(zone.fromR, zone.tr, k);
    zone.cx = lerp(zone.fromX, zone.tx, k);
    zone.cz = lerp(zone.fromZ, zone.tz, k);
    if (zone.t <= 0) {
      zone.r = zone.tr; zone.cx = zone.tx; zone.cz = zone.tz;
      zone.phase++;
      if (zone.phase >= ZONE_PHASES.length) {
        zone.state = 'done';
        zone.dps = ZONE_PHASES[ZONE_PHASES.length - 1].dps;
        zone.targetRing.visible = false;
      } else {
        zone.state = 'wait';
        zone.t = ZONE_PHASES[zone.phase].wait;
        zone.warned = false;
        zone.dps = ZONE_PHASES[zone.phase - 1].dps;
        pickNextZone();
      }
    }
  }
  if (zone.state === 'wait' && zone.phase < ZONE_PHASES.length && zone.r !== zone.tr) {
    // keep showing target during wait
  }
  zone.wall.position.set(zone.cx, 35, zone.cz);
  zone.wall.scale.set(zone.r, 1, zone.r);
  zone.ring.position.set(zone.cx, 0.1, zone.cz);
  zone.ring.scale.set(zone.r, zone.r, 1);
  applyZoneDamage(dt);
}
function applyZoneDamage(dt) {
  var dps = zone.state === 'done' ? zone.dps : ZONE_PHASES[Math.min(zone.phase, ZONE_PHASES.length - 1)].dps;
  zone.dmgTick += dt;
  if (zone.dmgTick >= 0.5) {
    zone.dmgTick = 0;
    // player
    if (player.alive && player.mode === 'play') {
      var d = dist2d(player.pos.x, player.pos.z, zone.cx, zone.cz);
      if (d > zone.r) {
        damagePlayer(dps * 0.5, null, true);
        Sfx.zoneTick();
      }
    }
    // bots
    for (var i = 0; i < bots.length; i++) {
      var b = bots[i];
      if (!b.alive) continue;
      if (dist2d(b.pos.x, b.pos.z, zone.cx, zone.cz) > zone.r) {
        b.hp -= dps * 0.5;
        if (b.hp <= 0) killBot(b, null, false);
      }
    }
  }
}

/* ---------------- fake eliminations (match pacing) ---------------- */
var fakeT = 9;
function updateFakeElims(dt) {
  if (botsAlive() <= 7 || zone.r < 95) return;
  fakeT -= dt;
  if (fakeT > 0) return;
  fakeT = rand(7, 13);
  var far = [];
  for (var i = 0; i < bots.length; i++) {
    if (bots[i].alive && dist2d(bots[i].pos.x, bots[i].pos.z, player.pos.x, player.pos.z) > 70) far.push(bots[i]);
  }
  if (far.length < 2) return;
  var victim = pick(far);
  var killer = pick(far);
  if (killer === victim) return;
  killBot(victim, killer, false);
  Sfx.shot('rifle', 110);
}

/* ---------------- bot vs bot skirmish ---------------- */
var skirmishT = 2;
function updateSkirmish(dt) {
  skirmishT -= dt;
  if (skirmishT > 0) return;
  skirmishT = 1.6;
  if (zone.r > 110) return;
  var pool = [];
  for (var i = 0; i < bots.length; i++) if (bots[i].alive) pool.push(bots[i]);
  if (pool.length < 2) return;
  for (i = 0; i < pool.length; i++) {
    for (var j = i + 1; j < pool.length; j++) {
      var A = pool[i], B = pool[j];
      if (dist2d(A.pos.x, A.pos.z, B.pos.x, B.pos.z) < 26) {
        var dmg = rand(16, 34);
        var target = Math.random() < 0.5 ? A : B;
        var shooter = target === A ? B : A;
        target.hp -= dmg;
        if (target.hp <= 0) killBot(target, shooter, false);
        return;
      }
    }
  }
}

/* ---------------- combat ---------------- */
function aimDir() {
  var cp = Math.cos(player.elev), sp = Math.sin(player.elev);
  return new THREE.Vector3(Math.sin(player.yaw) * cp, sp, Math.cos(player.yaw) * cp);
}
function muzzlePos() {
  var f = aimDir(); f.y = 0; f.normalize();
  var r = new THREE.Vector3(-f.z, 0, f.x);
  return new THREE.Vector3(
    player.pos.x + f.x * 0.55 - r.x * 0.25,
    player.pos.y + 1.38,
    player.pos.z + f.z * 0.55 - r.z * 0.25
  );
}
function tryFire(dt) {
  var w = currentWeapon();
  var key = currentWeaponKey();
  if (player.reloadT > 0 || player.healT > 0) return;
  if (player.fireCd > 0) return;
  if (player.ammo[key] <= 0) {
    if (player.reserve[key] > 0) startReload();
    else { Sfx.empty(); player.fireCd = 0.3; }
    return;
  }
  player.fireCd = w.rate;
  player.ammo[key]--;
  player.bloom = Math.min(0.05, player.bloom + w.bloom);
  player.elev = clamp(player.elev + w.kick, -0.5, 1.05);

  var muz = muzzlePos();
  var dir0 = aimDir();
  var origin = new THREE.Vector3(player.pos.x, player.pos.y + 1.35, player.pos.z).addScaledVector(dir0, 0.4);

  for (var p = 0; p < w.pellets; p++) {
    var spread = w.spread + player.bloom;
    var dir = new THREE.Vector3(
      dir0.x + rand(-spread, spread),
      dir0.y + rand(-spread, spread),
      dir0.z + rand(-spread, spread)
    ).normalize();
    var hitT = rayObstacles(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, w.range);
    var hitBot = null, botT = Infinity;
    for (var i = 0; i < bots.length; i++) {
      var b = bots[i];
      if (!b.alive) continue;
      var t = rayCircle(origin.x, origin.z, dir.x, dir.z, { x: b.pos.x, z: b.pos.z, r: 0.6 }, Math.min(hitT, w.range));
      if (t < botT) {
        var y = origin.y + dir.y * t - b.pos.y;
        if (y > 0.05 && y < 1.95) { botT = t; hitBot = b; }
      }
    }
    var end;
    if (hitBot && botT < hitT) {
      var dmg = w.dmg * (botT > w.range * 0.7 ? 0.75 : 1);
      end = new THREE.Vector3(origin.x + dir.x * botT, origin.y + dir.y * botT, origin.z + dir.z * botT);
      spawnSpark(end, 0xff3b3b);
      damageBot(hitBot, dmg, true);
    } else {
      end = new THREE.Vector3(origin.x + dir.x * hitT, origin.y + dir.y * hitT, origin.z + dir.z * hitT);
      if (hitT < w.range) spawnSpark(end, 0xd8d8c0);
    }
    spawnTracer(muz, end);
  }
  spawnFlash(muz);
  Sfx.shot(w.snd, 0);
  cancelHeal();
  updateAmmoHud();
}

function startReload() {
  var key = currentWeaponKey();
  var w = currentWeapon();
  if (player.reloadT > 0) return;
  if (player.ammo[key] >= w.mag) return;
  if (player.reserve[key] <= 0) return;
  player.reloadT = w.reload;
  Sfx.tone('square', 300, 500, 0.08, 0.2);
}
function finishReload() {
  var key = currentWeaponKey();
  var w = currentWeapon();
  var need = w.mag - player.ammo[key];
  var take = Math.min(need, player.reserve[key]);
  player.ammo[key] += take;
  if (player.reserve[key] !== Infinity) player.reserve[key] -= take;
  updateAmmoHud();
}
function swapWeapon() {
  if (player.weapons.length < 2 || player.reloadT > 0) return;
  player.cur = (player.cur + 1) % player.weapons.length;
  setGunColor(player.mesh, GUN_COLORS[currentWeaponKey()]);
  updateAmmoHud();
  Sfx.tone('square', 500, 380, 0.07, 0.18);
  showToast(currentWeapon().name);
}
function giveWeapon(kind) {
  if (player.weapons.indexOf(kind) === -1) {
    player.weapons.push(kind);
    player.reserve[kind] = WEAPONS[kind].mag * 3;
    player.ammo[kind] = WEAPONS[kind].mag;
    player.cur = player.weapons.length - 1;
    setGunColor(player.mesh, GUN_COLORS[kind]);
    showToast('PICKED UP ' + WEAPONS[kind].name);
  } else {
    player.reserve[kind] += WEAPONS[kind].mag * 2;
    showToast('+' + WEAPONS[kind].name + ' AMMO');
  }
  updateAmmoHud();
}
function useMed() {
  if (player.meds <= 0 || player.hp >= 100 || player.healT > 0) return;
  player.healT = 3;
  el.medbar.style.opacity = '1';
  Sfx.tone('sine', 400, 600, 0.15, 0.2);
}
function cancelHeal() {
  if (player.healT > 0) { player.healT = 0; el.medbar.style.opacity = '0'; }
}

function damageBot(bot, dmg, byPlayer) {
  bot.hp -= dmg;
  bot.flashT = 0.12;
  bot.state = 'fight';
  if (byPlayer) {
    flashHitmarker(false);
    Sfx.hit();
  }
  if (bot.hp <= 0) killBot(bot, byPlayer ? 'YOU' : null, byPlayer);
}

function killBot(bot, killerName, byPlayer) {
  if (!bot.alive) return;
  bot.alive = false;
  bot.deathT = 0;
  if (byPlayer) {
    player.kills++;
    el.killVal.textContent = player.kills;
    flashHitmarker(true);
    Sfx.kill();
    vibrate(70);
    showBanner('ELIMINATED ' + bot.name.toUpperCase(), '#ffd23f', 1.6);
  }
  addFeed(killerName || (zone.state !== 'idle' ? 'Zone' : '???'), bot.name, byPlayer);
  // drop loot
  if (Math.random() < 0.55) spawnPickup('ammo', null, bot.pos.x + rand(-1, 1), bot.pos.z + rand(-1, 1));
  if (Math.random() < 0.35) spawnPickup('med', null, bot.pos.x + rand(-1, 1), bot.pos.z + rand(-1, 1));
  if (Math.random() < 0.45) spawnPickup('weapon', bot.weapon, bot.pos.x + rand(-1.5, 1.5), bot.pos.z + rand(-1.5, 1.5));
  updateAliveHud();
  checkWin();
}

function damagePlayer(dmg, fromBot, silentVib) {
  if (!player.alive || player.mode !== 'play') return;
  player.hp -= dmg;
  el.vignette.style.opacity = '0.85';
  setTimeout(function () { el.vignette.style.opacity = '0'; }, 220);
  Sfx.hurt();
  if (!silentVib) vibrate(45);
  updateHpHud();
  if (player.hp <= 0) {
    player.hp = 0;
    playerDie(fromBot);
  }
}

function playerDie(killerBot) {
  player.alive = false;
  player.mode = 'dead';
  var rank = botsAlive() + 1;
  addFeed(killerBot ? killerBot.name : 'Zone', 'YOU', false);
  showBanner('YOU WERE ELIMINATED', '#ff5b5b', 2.5);
  setTimeout(function () { endMatch(false, rank); }, 1600);
}

function checkWin() {
  if (player.mode === 'play' && botsAlive() === 0) {
    player.mode = 'win';
    setTimeout(function () { endMatch(true, 1); }, 1200);
  }
}

/* ---------------- bot update ---------------- */
function updateBot(bot, dt) {
  if (!bot.alive) {
    if (bot.deathT < 1.2) {
      bot.deathT += dt;
      var k = clamp(bot.deathT / 0.4, 0, 1);
      bot.mesh.rotation.x = -Math.PI / 2 * k;
      bot.mesh.position.y = 0.2 * (1 - k);
    }
    return;
  }
  var dPlayer = dist2d(bot.pos.x, bot.pos.z, player.pos.x, player.pos.z);
  var distC = dist2d(bot.pos.x, bot.pos.z, zone.cx, zone.cz);

  // choose state
  var canSee = player.alive && player.mode === 'play' && dPlayer < 46 &&
    losClear(bot.pos.x, 1.4, bot.pos.z, player.pos.x, 1.3, player.pos.z);
  if (distC > zone.r - 6) bot.state = 'zone';
  else if (canSee) bot.state = 'fight';
  else if (bot.state === 'fight' && dPlayer < 60) bot.state = 'fight';
  else bot.state = 'wander';

  var speed = 0;
  var dirX = 0, dirZ = 0;

  if (bot.state === 'zone') {
    var zx = zone.cx + rand(-1, 1) * zone.r * 0.3;
    var zz = zone.cz + rand(-1, 1) * zone.r * 0.3;
    if (!bot.target || dist2d(bot.pos.x, bot.pos.z, bot.target.x, bot.target.z) < 3) {
      bot.target = { x: zone.cx + rand(-0.5, 0.5) * zone.r * 0.6, z: zone.cz + rand(-0.5, 0.5) * zone.r * 0.6 };
    }
    dirX = bot.target.x - bot.pos.x; dirZ = bot.target.z - bot.pos.z;
    speed = CFG.botRush;
  } else if (bot.state === 'fight') {
    // face player
    var wantYaw = Math.atan2(player.pos.x - bot.pos.x, player.pos.z - bot.pos.z);
    var dyaw = wantYaw - bot.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.yaw += clamp(dyaw, -3.2 * dt, 3.2 * dt);
    // strafe + keep range
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) { bot.strafe *= -1; bot.strafeT = rand(1.0, 2.4); }
    var fx0 = Math.sin(bot.yaw), fz0 = Math.cos(bot.yaw);
    var rx = -fz0, rz = fx0;
    var moveF = dPlayer > 24 ? 1 : (dPlayer < 10 ? -0.8 : 0);
    dirX = fx0 * moveF + rx * bot.strafe * 0.7;
    dirZ = fz0 * moveF + rz * bot.strafe * 0.7;
    speed = CFG.botSpeed;
    // shoot
    bot.fireT -= dt;
    if (bot.fireT <= 0 && canSee && player.alive) {
      var w = WEAPONS[bot.weapon];
      bot.fireT = w.rate * rand(2.5, 5);
      var muz = new THREE.Vector3(bot.pos.x + fx0 * 0.5, 1.35, bot.pos.z + fz0 * 0.5);
      var chance = clamp(0.42 - dPlayer * 0.006 - (player.moving > 0.1 ? 0.08 : 0) - (player.pos.y > 0.3 ? 0.07 : 0), 0.06, 0.5);
      var hit = Math.random() < chance;
      var aim = new THREE.Vector3(player.pos.x, 1.25, player.pos.z);
      if (!hit) aim.x += rand(-2.5, 2.5); aim.y += rand(-0.5, 1); aim.z += rand(-2.5, 2.5);
      spawnTracer(muz, aim);
      spawnFlash(muz);
      bot.shotRecent = 3;
      Sfx.shot(w.snd, dPlayer);
      if (hit) damagePlayer(rand(6, 13), bot, false);
    }
  } else { // wander
    if (!bot.target || dist2d(bot.pos.x, bot.pos.z, bot.target.x, bot.target.z) < 2.5) {
      var a = rand(0, 6.3), r = Math.sqrt(Math.random()) * Math.max(10, zone.r * 0.85);
      bot.target = { x: zone.cx + Math.cos(a) * r, z: zone.cz + Math.sin(a) * r };
    }
    dirX = bot.target.x - bot.pos.x; dirZ = bot.target.z - bot.pos.z;
    speed = CFG.botSpeed * 0.8;
  }

  // move
  var dl = Math.sqrt(dirX * dirX + dirZ * dirZ);
  if (dl > 0.001 && speed > 0) {
    dirX /= dl; dirZ /= dl;
    bot.pos.x += dirX * speed * dt;
    bot.pos.z += dirZ * speed * dt;
    collide(bot.pos, 0.45);
    if (bot.state !== 'fight') {
      var wantYaw2 = Math.atan2(dirX, dirZ);
      var dy2 = wantYaw2 - bot.yaw;
      while (dy2 > Math.PI) dy2 -= Math.PI * 2;
      while (dy2 < -Math.PI) dy2 += Math.PI * 2;
      bot.yaw += clamp(dy2, -4 * dt, 4 * dt);
    }
    bot.walkT += dt * speed * 1.6;
  }

  // stuck?
  bot.stuckT += dt;
  if (bot.stuckT > 1.5) {
    if (dist2d(bot.pos.x, bot.pos.z, bot.lastX, bot.lastZ) < 0.5) bot.target = null;
    bot.lastX = bot.pos.x; bot.lastZ = bot.pos.z;
    bot.stuckT = 0;
  }

  // zone damage handled in applyZoneDamage

  // flash red when hit
  if (bot.flashT > 0) {
    bot.flashT -= dt;
    var mat = bot.mesh.userData.torso.material;
    mat.color.setHex(bot.flashT > 0 ? 0xff5555 : mat.userData0 || mat.color.getHex());
    if (bot.flashT <= 0) {
      // restore original shirt color
      mat.color.setHex(bot.mesh.userData.shirtColor || 0xcc3333);
    }
  }

  // animate
  var u = bot.mesh.userData;
  var swing = Math.sin(bot.walkT) * 0.5;
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  if (bot.state === 'fight') {
    u.armR.rotation.x = -1.35;
    u.armL.rotation.x = -1.1;
  } else {
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
  }
  bot.mesh.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
  bot.mesh.rotation.y = bot.yaw;
  if (bot.shotRecent > 0) bot.shotRecent -= dt;
}

/* ---------------- player update ---------------- */
var input = {
  mx: 0, mz: 0,        // move axis -1..1
  fire: false, lookDx: 0, lookDy: 0,
  keys: {}
};

function updatePlayer(dt) {
  if (player.mode === 'drop') {
    // steer while parachuting
    var df = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    var dr = new THREE.Vector3(-df.z, 0, df.x);
    var dmx = input.mx, dmz = input.mz;
    if (!isTouch) {
      dmx = (input.keys['KeyD'] ? 1 : 0) - (input.keys['KeyA'] ? 1 : 0);
      dmz = (input.keys['KeyW'] ? 1 : 0) - (input.keys['KeyS'] ? 1 : 0);
    }
    var dspd = 9;
    player.pos.addScaledVector(df, dmz * dspd * dt);
    player.pos.addScaledVector(dr, dmx * dspd * dt);
    collide(player.pos, 0.45);
    player.dropV = lerp(player.dropV, 15, dt * 1.5);
    player.pos.y -= player.dropV * dt;
    if (player.pos.y <= 0) {
      player.pos.y = 0;
      player.mode = 'play';
      if (player.para) { player.mesh.remove(player.para); player.para = null; }
      spawnSpark(new THREE.Vector3(player.pos.x, 0.2, player.pos.z), 0xd9c68a);
      startZone();
      showBanner('MATCH STARTED — GOOD LUCK!', '#ffd23f', 2.2);
      Sfx.pickup();
    }
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.yaw;
    return;
  }
  if (player.mode !== 'play' || !player.alive) return;

  // look
  var sens = isTouch ? 0.0058 : 0.0026;
  player.yaw -= input.lookDx * sens;
  player.elev = clamp(player.elev - input.lookDy * sens, -0.5, 1.05);
  input.lookDx = 0; input.lookDy = 0;

  // move
  var f = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  var r = new THREE.Vector3(-f.z, 0, f.x);
  var mx = input.mx, mz = input.mz;
  if (!isTouch) {
    mx = (input.keys['KeyD'] ? 1 : 0) - (input.keys['KeyA'] ? 1 : 0);
    mz = (input.keys['KeyW'] ? 1 : 0) - (input.keys['KeyS'] ? 1 : 0);
  }
  var mag = Math.min(1, Math.sqrt(mx * mx + mz * mz));
  player.sprinting = mag > 0.92 && mz > 0.4 && (input.keys['ShiftLeft'] || input.keys['ShiftRight'] || isTouch);
  var spd = player.sprinting ? CFG.sprintSpeed : CFG.walkSpeed;
  if (player.healT > 0) spd *= 0.4;

  var targetVx = f.x * mz + r.x * mx;
  var targetVz = f.z * mz + r.z * mx;
  var tl = Math.sqrt(targetVx * targetVx + targetVz * targetVz);
  if (tl > 1) { targetVx /= tl; targetVz /= tl; }
  targetVx *= spd * Math.min(1, mag || 1);
  targetVz *= spd * Math.min(1, mag || 1);

  var k = 1 - Math.exp(-12 * dt);
  player.vel.x += (targetVx - player.vel.x) * k;
  player.vel.z += (targetVz - player.vel.z) * k;

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;
  collide(player.pos, CFG.playerR);

  // jump
  if (player.pos.y > 0 || player.vy > 0) {
    player.vy -= CFG.gravity * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; }
  }
  player.moving = Math.sqrt(player.vel.x * player.vel.x + player.vel.z * player.vel.z);

  // timers
  player.fireCd -= dt;
  player.bloom = Math.max(0, player.bloom - dt * 0.05);
  if (player.reloadT > 0) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) finishReload();
  }
  if (player.healT > 0) {
    player.healT -= dt;
    el.medfill.style.width = ((1 - player.healT / 3) * 100) + '%';
    if (player.healT <= 0) {
      player.meds--;
      player.hp = Math.min(100, player.hp + 65);
      el.medbar.style.opacity = '0';
      el.medVal.textContent = player.meds;
      Sfx.heal();
      updateHpHud();
    }
  }
  if (input.fire) tryFire(dt);

  // animate
  player.walkT += dt * player.moving * 1.5;
  var u = player.mesh.userData;
  var swing = Math.sin(player.walkT) * 0.5 * clamp(player.moving / 6, 0, 1);
  u.legL.rotation.x = swing;
  u.legR.rotation.x = -swing;
  if (input.fire || player.fireCd > currentWeapon().rate * 0.4) {
    u.armR.rotation.x = -1.35;
    u.armL.rotation.x = -1.1;
  } else {
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
  }
  if (u.gun) {
    u.gun.position.z = 0.12 - (input.fire ? 0.05 : 0);
  }
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y = player.yaw;
}

function jump() {
  if (player.mode === 'play' && player.alive && player.pos.y <= 0) {
    player.vy = 4.8;
    Sfx.tone('sine', 240, 180, 0.08, 0.12);
  }
}

/* ---------------- camera ---------------- */
function updateCamera(dt) {
  var target;
  if (player.mode === 'menu') {
    var t = performance.now() * 0.0001;
    camera.position.set(Math.cos(t) * 95, 46, Math.sin(t) * 95);
    camera.lookAt(0, 4, 0);
    return;
  }
  target = new THREE.Vector3(player.pos.x, player.pos.y + CFG.camHeight, player.pos.z);
  var dir = aimDir();
  var dist = CFG.camDist;
  if (player.mode === 'drop') { dist = 7.5; dir.y = Math.max(dir.y, 0.45); dir.normalize(); }
  var camPos = new THREE.Vector3().copy(target).addScaledVector(dir, -dist);
  // shoulder offset
  var right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  camPos.addScaledVector(right, CFG.shoulder);
  camPos.y = Math.max(camPos.y, 0.4);
  camera.position.lerp(camPos, 1 - Math.exp(-14 * dt));
  camera.lookAt(target.x + dir.x * 8, target.y + dir.y * 8, target.z + dir.z * 8);

  var wantFov = player.sprinting ? 71 : 65;
  if (Math.abs(camera.fov - wantFov) > 0.1) {
    camera.fov = lerp(camera.fov, wantFov, 1 - Math.exp(-6 * dt));
    camera.updateProjectionMatrix();
  }
}

/* ---------------- pickups update ---------------- */
function updatePickups(dt) {
  for (var i = 0; i < world.pickups.length; i++) {
    var p = world.pickups[i];
    if (p.taken) continue;
    p.spin += dt * 2;
    p.mesh.rotation.y = p.spin;
    p.mesh.position.y = 0.55 + Math.sin(p.spin * 1.4) * 0.08;
    if (player.mode === 'play' && player.alive) {
      var d = dist2d(p.x, p.z, player.pos.x, player.pos.z);
      if (d < 1.7) {
        p.taken = true;
        p.mesh.visible = false;
        if (p.type === 'weapon') giveWeapon(p.weapon);
        else if (p.type === 'med') {
          if (player.meds < 4) { player.meds++; el.medVal.textContent = player.meds; showToast('+1 MEDKIT'); }
          else { player.reserve[currentWeaponKey()] += 20; showToast('+20 AMMO (MED FULL)'); }
        } else {
          var key = currentWeaponKey();
          if (key === 'pistol') {
            var alt = null;
            for (var j = 0; j < player.weapons.length; j++) if (player.weapons[j] !== 'pistol') alt = player.weapons[j];
            key = alt || 'pistol';
          }
          player.reserve[key] += 40;
          showToast('+40 AMMO');
          updateAmmoHud();
        }
        Sfx.pickup();
      }
    }
  }
}

/* ---------------- HUD ---------------- */
var bannerT = null, toastT = null, hitT = null;
function showBanner(text, color, dur) {
  el.banner.textContent = text;
  el.banner.style.color = color || '#ffd23f';
  el.banner.style.opacity = '1';
  if (bannerT) clearTimeout(bannerT);
  bannerT = setTimeout(function () { el.banner.style.opacity = '0'; }, (dur || 2) * 1000);
}
function showToast(text) {
  el.toast.textContent = text;
  el.toast.style.opacity = '1';
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(function () { el.toast.style.opacity = '0'; }, 1600);
}
function flashHitmarker(kill) {
  el.hitmarker.style.opacity = '1';
  el.hitmarker.className = kill ? 'kill' : '';
  if (hitT) clearTimeout(hitT);
  hitT = setTimeout(function () { el.hitmarker.style.opacity = '0'; }, kill ? 220 : 110);
}
function addFeed(killer, victim, byPlayer) {
  var div = document.createElement('div');
  div.className = 'feed';
  var k = document.createElement('span');
  k.className = byPlayer ? 'me' : 'red';
  k.textContent = killer;
  var v = document.createElement('span');
  v.className = 'dim';
  v.textContent = '  \u2694  ' + victim;
  div.appendChild(k); div.appendChild(v);
  el.killfeed.insertBefore(div, el.killfeed.firstChild);
  while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.lastChild);
  setTimeout(function () { if (div.parentNode) div.parentNode.removeChild(div); }, 5000);
}
function updateHpHud() {
  var p = clamp(player.hp, 0, 100);
  el.hpfill.style.width = p + '%';
  el.hpfill.className = p < 30 ? 'low' : '';
  el.hpTxt.textContent = Math.ceil(p);
}
function updateAmmoHud() {
  var w = currentWeapon(), key = currentWeaponKey();
  el.wname.textContent = w.name;
  var res = player.reserve[key];
  el.ammo.innerHTML = player.reloadT > 0 ? '— <span>/ ' + (res === Infinity ? '∞' : res) + '</span>'
    : player.ammo[key] + ' <span>/ ' + (res === Infinity ? '∞' : res) + '</span>';
}
function updateAliveHud() {
  el.aliveVal.textContent = botsAlive() + (player.alive ? 1 : 0);
}
function updateZoneHud() {
  if (zone.state === 'idle') { el.zoneTxt.textContent = '—'; el.zoneChip.className = 'chip'; return; }
  if (zone.state === 'wait') {
    el.zoneTxt.textContent = 'SHRINKS IN ' + fmtTime(zone.t);
    el.zoneChip.className = zone.t < 8 ? 'chip warn' : 'chip';
  } else if (zone.state === 'shrink') {
    el.zoneTxt.textContent = 'ZONE SHRINKING';
    el.zoneChip.className = 'chip warn';
  } else {
    el.zoneTxt.textContent = 'FINAL ZONE';
    el.zoneChip.className = 'chip warn';
  }
}

/* minimap */
var mmCtx = el.minimap.getContext('2d');
var mmTimer = 0;
function drawMinimap() {
  var c = mmCtx, S = el.minimap.width, scale = S / 2 / (CFG.mapR + 20);
  var cx = S / 2, cz = S / 2;
  c.clearRect(0, 0, S, S);
  c.save();
  c.beginPath(); c.arc(cx, cz, S / 2 - 2, 0, 6.3); c.clip();
  c.fillStyle = '#2e4a22';
  c.fillRect(0, 0, S, S);
  // water ring
  c.strokeStyle = '#1d5c8a'; c.lineWidth = 3;
  c.beginPath(); c.arc(cx, cz, (CFG.mapR + 24) * scale, 0, 6.3); c.stroke();
  // zone
  c.strokeStyle = '#ffffff'; c.lineWidth = 1.6;
  c.beginPath(); c.arc(cx + zone.cx * scale, cz + zone.cz * scale, Math.max(2, zone.r * scale), 0, 6.3); c.stroke();
  if (zone.targetRing.visible) {
    c.strokeStyle = '#7fd4ff'; c.setLineDash([3, 3]); c.lineWidth = 1.2;
    c.beginPath(); c.arc(cx + zone.tx * scale, cz + zone.tz * scale, Math.max(2, zone.tr * scale), 0, 6.3); c.stroke();
    c.setLineDash([]);
  }
  // pickups
  c.fillStyle = '#ffd23f';
  for (var i = 0; i < world.pickups.length; i++) {
    var p = world.pickups[i];
    if (p.taken) continue;
    c.fillRect(cx + p.x * scale - 1, cz + p.z * scale - 1, 2, 2);
  }
  // bots that fired recently
  var now = performance.now();
  for (i = 0; i < bots.length; i++) {
    var b = bots[i];
    if (!b.alive) continue;
    if (b.state === 'fight' || b.shotRecent > 0) {
      c.fillStyle = '#ff4d4d';
      c.beginPath(); c.arc(cx + b.pos.x * scale, cz + b.pos.z * scale, 2.4, 0, 6.3); c.fill();
    }
  }
  // player
  var px = cx + player.pos.x * scale, pz = cz + player.pos.z * scale;
  c.translate(px, pz);
  c.rotate(-player.yaw + Math.PI);
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(0, -5); c.lineTo(3.4, 4); c.lineTo(-3.4, 4);
  c.closePath(); c.fill();
  c.restore();
}

/* ---------------- input ---------------- */
  function vibrate(ms) {
  try {
    var num = (typeof ms === 'object' && ms.length) ? 150 : ms;
    if (navigator.vibrate) navigator.vibrate(ms);
    if (window.AndroidBridge && AndroidBridge.vibrate) AndroidBridge.vibrate(num);
  } catch (e) {}
}

var stick = { active: false, id: -1, cx: 0, cy: 0 };
var look = { id: -1, lx: 0, ly: 0 };

function bindTouch() {
  var stickEl = $('stick'), knob = $('knob');

  function setKnob(dx, dy) {
    knob.style.transform = 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px)';
  }

  document.addEventListener('touchstart', function (e) {
    Sfx.ensure();
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var onStick = false;
      var se = stickEl.getBoundingClientRect();
      if (t.clientX >= se.left - 24 && t.clientX <= se.right + 24 && t.clientY >= se.top - 24 && t.clientY <= se.bottom + 24) onStick = true;
      if (onStick && !stick.active) {
        stick.active = true; stick.id = t.identifier;
        stick.cx = se.left + se.width / 2; stick.cy = se.top + se.height / 2;
        moveStick(t.clientX, t.clientY);
      } else if (look.id === -1 && t.clientX > window.innerWidth * 0.32) {
        look.id = t.identifier; look.lx = t.clientX; look.ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });

  function moveStick(x, y) {
    var dx = x - stick.cx, dy = y - stick.cy;
    var d = Math.sqrt(dx * dx + dy * dy);
    var max = 44;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    setKnob(dx, dy);
    input.mx = dx / max;
    input.mz = -dy / max;
  }

  document.addEventListener('touchmove', function (e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (stick.active && t.identifier === stick.id) moveStick(t.clientX, t.clientY);
      else if (t.identifier === look.id) {
        input.lookDx += t.clientX - look.lx;
        input.lookDy += t.clientY - look.ly;
        look.lx = t.clientX; look.ly = t.clientY;
      }
    }
    e.preventDefault();
  }, { passive: false });

  function endTouch(e) {
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (t.identifier === stick.id) {
        stick.active = false; stick.id = -1;
        input.mx = 0; input.mz = 0;
        setKnob(0, 0);
      } else if (t.identifier === look.id) {
        look.id = -1;
      }
    }
    e.preventDefault();
  }
  document.addEventListener('touchend', endTouch, { passive: false });
  document.addEventListener('touchcancel', endTouch, { passive: false });

  function bindBtn(id, down, up) {
    var b = $(id);
    b.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); Sfx.ensure(); down(); }, { passive: false });
    if (up) {
      b.addEventListener('touchend', function (e) { e.preventDefault(); e.stopPropagation(); up(); }, { passive: false });
      b.addEventListener('touchcancel', function (e) { e.preventDefault(); e.stopPropagation(); up(); }, { passive: false });
    }
  }
  bindBtn('fireBtn', function () { input.fire = true; $('fireBtn').classList.add('on'); },
    function () { input.fire = false; $('fireBtn').classList.remove('on'); });
  bindBtn('reloadBtn', function () { startReload(); });
  bindBtn('swapBtn', function () { swapWeapon(); });
  bindBtn('medBtn', function () { useMed(); });
  bindBtn('jumpBtn', function () { jump(); });
  bindBtn('pauseBtn', function () { openPause(); });
}

function bindDesktop() {
  document.addEventListener('keydown', function (e) {
    input.keys[e.code] = true;
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyQ') swapWeapon();
    if (e.code === 'KeyH') useMed();
    if (e.code === 'Space') { jump(); e.preventDefault(); }
    if (e.code === 'KeyP') { if (player.mode === 'play' || player.mode === 'drop') openPause(); else closePause(); }
    if (e.code === 'Escape') { if (paused) closePause(); }
  });
  document.addEventListener('keyup', function (e) { input.keys[e.code] = false; });

  el.canvas.addEventListener('mousedown', function (e) {
    Sfx.ensure();
    if (document.pointerLockElement !== el.canvas && e.button === 0 && !paused &&
      (player.mode === 'play' || player.mode === 'drop')) {
      lockPointer();
      return;
    }
    if (document.pointerLockElement === el.canvas && e.button === 0) input.fire = true;
  });
  document.addEventListener('mouseup', function (e) { if (e.button === 0) input.fire = false; });
  document.addEventListener('mousemove', function (e) {
    if (document.pointerLockElement === el.canvas) {
      input.lookDx += e.movementX;
      input.lookDy += e.movementY;
    }
  });
  document.addEventListener('pointerlockchange', function () {
    if (document.pointerLockElement !== el.canvas && !paused &&
      (player.mode === 'play' || player.mode === 'drop') && !isTouch) {
      openPause();
    }
  });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
}

/* ---------------- flow ---------------- */
function lockPointer() {
  try { el.canvas.requestPointerLock(); } catch (e) {}
}

var paused = false, lastBack = 0;

function clearWorld() {
  // remove & dispose everything in worldGroup
  while (worldGroup.children.length) {
    var obj = worldGroup.children[0];
    worldGroup.remove(obj);
    obj.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
        else o.material.dispose();
      }
    });
  }
  world.circles.length = 0;
  world.boxes.length = 0;
  world.pickups.length = 0;
  world.buildings.length = 0;
  bots.length = 0;
}

function buildWorld() {
  world.circles.length = 0; world.boxes.length = 0; world.pickups.length = 0; world.buildings.length = 0;
  buildTerrain();
  buildTown();
  buildForest();
  buildRocks();
  buildClouds();
  buildZoneMeshes();
  scatterLoot();
}

function startMatch() {
  clearWorld();
  buildWorld();
  resetPlayerState();
  resetZone();
  el.killfeed.innerHTML = '';
  el.killVal.textContent = '0';
  el.medVal.textContent = '1';
  fakeT = rand(8, 12);
  skirmishT = 2;

  // player mesh
  if (player.mesh) { scene.remove(player.mesh); }
  player.mesh = makeSoldier(0xff8c1a, 0x2f3b4c, 0xe8b98a, 0xff5b1a);
  attachGun(player.mesh, GUN_COLORS.pistol);
  scene.add(player.mesh);

  // drop position
  var a = rand(0, 6.3), r = rand(0, 110);
  player.pos.set(Math.cos(a) * r, 135, Math.sin(a) * r);
  player.yaw = rand(0, 6.3); player.elev = 0.5;
  player.vy = 0; player.dropV = 2;

  player.para = new THREE.Mesh(
    new THREE.ConeGeometry(2.4, 1.5, 8),
    new THREE.MeshLambertMaterial({ color: 0xff8c1a, side: THREE.DoubleSide })
  );
  player.para.position.y = 3.4;
  player.mesh.add(player.para);

  player.mode = 'drop';
  paused = false;

  spawnBots();
  updateAliveHud();
  updateHpHud();
  updateAmmoHud();
  el.hud.classList.remove('hidden');
  el.menu.classList.add('hidden');
  el.gameover.classList.add('hidden');
  el.pauseMenu.classList.add('hidden');
  showBanner('STEER YOUR DROP!', '#ffd23f', 2);
  Sfx.warn();
  if (!isTouch) {
    setTimeout(function () { if (!paused) lockPointer(); }, 100);
  }
}

function endMatch(won, rank) {
  player.mode = won ? 'win' : 'dead';
  el.goTitle.textContent = won ? 'BOOYAH!' : 'DEFEATED';
  el.goTitle.className = won ? 'win' : 'lose';
  el.goStats.innerHTML = won
    ? '#1 / ' + (CFG.botCount + 1) + ' &bull; <b>' + player.kills + '</b> ELIMINATIONS'
    : '#' + rank + ' / ' + (CFG.botCount + 1) + ' &bull; <b>' + player.kills + '</b> ELIMINATIONS';
  el.gameover.classList.remove('hidden');
  el.hud.classList.add('hidden');
  if (document.pointerLockElement === el.canvas) document.exitPointerLock();
  if (won) { Sfx.booyah(); vibrate([60, 60, 120]); }
  else { Sfx.tone('sawtooth', 200, 80, 0.5, 0.4); }
}

function openPause() {
  if (paused || !(player.mode === 'play' || player.mode === 'drop')) return;
  paused = true;
  el.pauseMenu.classList.remove('hidden');
  input.fire = false;
  input.mx = 0; input.mz = 0;
  if (document.pointerLockElement === el.canvas) document.exitPointerLock();
}
function closePause() {
  if (!paused) return;
  paused = false;
  el.pauseMenu.classList.add('hidden');
  if (!isTouch && (player.mode === 'play' || player.mode === 'drop')) {
    lockPointer();
  }
}
function exitToMenu() {
  paused = false;
  player.mode = 'menu';
  el.pauseMenu.classList.add('hidden');
  el.gameover.classList.add('hidden');
  el.hud.classList.add('hidden');
  el.menu.classList.remove('hidden');
  if (document.pointerLockElement === el.canvas) document.exitPointerLock();
  if (player.mesh) player.mesh.visible = false;
}

$('playBtn').addEventListener('click', function () { Sfx.ensure(); startMatch(); });
$('againBtn').addEventListener('click', function () { Sfx.ensure(); startMatch(); });
$('menuBtn').addEventListener('click', exitToMenu);
$('resumeBtn').addEventListener('click', closePause);
$('restartBtn').addEventListener('click', function () { closePause(); startMatch(); });
$('exitBtn').addEventListener('click', exitToMenu);

/* android bridge hooks */
window.androidBack = function () {
  var now = performance.now();
  if (player.mode === 'play' || player.mode === 'drop') { openPause(); return; }
  if (paused) { if (now - lastBack < 2200) { if (window.AndroidBridge) AndroidBridge.exitApp(); } else { showToast('PRESS BACK AGAIN TO EXIT'); lastBack = now; } return; }
  if (player.mode === 'menu' || player.mode === 'win' || player.mode === 'dead') {
    if (now - lastBack < 2200) { if (window.AndroidBridge) AndroidBridge.exitApp(); }
    else { showToast('PRESS BACK AGAIN TO EXIT'); lastBack = now; }
  }
};
window.gamePause = function () { if (player.mode === 'play' || player.mode === 'drop') openPause(); };
window.gameResume = function () { /* user resumes manually */ };

document.addEventListener('visibilitychange', function () {
  if (document.hidden && (player.mode === 'play' || player.mode === 'drop')) openPause();
});

window.addEventListener('error', function (e) {
  var box = $('err');
  box.style.display = 'block';
  box.textContent = 'Error: ' + (e.message || e.error);
});

/* ---------------- main loop ---------------- */
var last = performance.now(), mmAcc = 0;

function tick(dt) {
  if (paused) return;
  var i;
  if (player.mode === 'drop') {
    updatePlayer(dt);
    for (i = 0; i < bots.length; i++) updateBot(bots[i], dt);
    updateFx(dt);
    updateCamera(dt);
    updateZoneHud();
    return;
  }
  if (player.mode === 'play') {
    updatePlayer(dt);
    for (i = 0; i < bots.length; i++) updateBot(bots[i], dt);
    updateZone(dt);
    updateFakeElims(dt);
    updateSkirmish(dt);
    updatePickups(dt);
    updateFx(dt);
    updateCamera(dt);
    updateZoneHud();
    mmAcc += dt;
    if (mmAcc > 0.12) { mmAcc = 0; drawMinimap(); }
    return;
  }
  if (player.mode === 'menu' || player.mode === 'win' || player.mode === 'dead') {
    // ambient menu world
    for (i = 0; i < bots.length; i++) updateBot(bots[i], dt);
    updateFx(dt);
    updateCamera(dt);
  }
}

function loop() {
  requestAnimationFrame(loop);
  var now = performance.now();
  var dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
  renderer.render(scene, camera);
}

/* ---------------- first-run loader ----------------
   Shows a progress bar that really verifies the game packages
   (graphics engine, WebGL, audio, storage, game files) on first
   launch, then re-checks quickly on every later launch. */
function runLoader(done) {
  var screen = $('loading'), fill = $('loadfill'), txt = $('loadTxt'),
      pct = $('loadPct'), sub = $('loadSub');
  var first = true;
  try { first = !window.localStorage.getItem('fz_setup_done'); } catch (e) { first = true; }

  if (screen) screen.style.display = 'flex';
  if (sub) sub.textContent = first ? 'FIRST TIME SETUP — INSTALLING PACKAGES' : 'CHECKING GAME PACKAGES';

  var steps = [];
  function step(label, weight, fn) { steps.push({ label: label, weight: weight, fn: fn }); }

  step('CHECKING DEVICE', 1, function () {
    var c = document.createElement('canvas');
    var gl = c.getContext && (c.getContext('webgl') || c.getContext('experimental-webgl'));
    if (!gl) throw new Error('WEBGL NOT SUPPORTED');
  });
  step('LOADING GRAPHICS ENGINE', 2, function () {
    if (!window.THREE || !THREE.WebGLRenderer || !THREE.Scene) throw new Error('ENGINE MISSING');
  });
  step('VERIFYING GAME FILES', 2, function () {
    if (typeof makeSoldier !== 'function' || typeof buildWorld !== 'function' ||
        typeof startMatch !== 'function') throw new Error('GAME FILES CORRUPT');
    if (!el.canvas) throw new Error('RENDER TARGET MISSING');
  });
  step('INSTALLING AUDIO PACKAGES', 1, function () { Sfx.ensure(); });
  step('CHECKING STORAGE', 1, function () {
    try { window.localStorage.setItem('fz_probe', '1'); window.localStorage.removeItem('fz_probe'); } catch (e) { /* optional */ }
  });
  step('GENERATING ISLAND MAP', 4, null); // real world build happens in boot
  step('OPTIMIZING FOR DEVICE', 1, function () {
    var dpr = window.devicePixelRatio || 1;
    if (dpr > 2.5) renderer.setPixelRatio(2);
  });
  step('STARTING GAME', 1, null);

  var total = 0, i;
  for (i = 0; i < steps.length; i++) total += steps[i].weight;
  var acc = 0, idx = 0;

  function paint(p, label) {
    var pc = Math.round(p * 100);
    if (fill) fill.style.width = pc + '%';
    if (pct) pct.textContent = pc + '%';
    if (txt && label) txt.textContent = label;
  }

  function next() {
    if (idx >= steps.length) {
      paint(1, 'ALL CHECKS PASSED — OPENING GAME');
      try { window.localStorage.setItem('fz_setup_done', '1'); } catch (e) {}
      setTimeout(function () {
        if (screen) screen.style.display = 'none';
        $('menu').classList.remove('hidden');
        done();
      }, 420);
      return;
    }
    var s = steps[idx];
    paint(acc / total, s.label + '…');
    setTimeout(function () {
      try {
        if (s.fn) s.fn();
      } catch (e) {
        if (txt) { txt.textContent = 'ERROR: ' + e.message; txt.style.color = '#ff5b5b'; }
        return;
      }
      acc += s.weight;
      idx++;
      next();
    }, first ? 260 : 110);
  }
  next();
}

/* ---------------- boot ---------------- */
var booted = false;
function bootGame() {
  if (booted) return;
  booted = true;
  if (player.mode === 'menu') {
    // ambient island for the menu backdrop
    buildWorld();
    player.mesh = makeSoldier(0xff8c1a, 0x2f3b4c, 0xe8b98a, 0xff5b1a);
    attachGun(player.mesh, GUN_COLORS.pistol);
    scene.add(player.mesh);
    player.mesh.visible = false;
  }
  if (isTouch) bindTouch(); else bindDesktop();
  loop();
}

/* test / debug api */
window.FZ = {
  start: startMatch,
  step: tick,
  player: player,
  bots: bots,
  zone: zone,
  world: world,
  input: input,
  botsAlive: botsAlive,
  pause: openPause,
  resume: closePause,
  give: giveWeapon,
  weapons: WEAPONS,
  fire: function () { input.fire = true; tryFire(0.016); input.fire = false; }
};

player.mode = 'menu';
runLoader(bootGame);
})();
;
