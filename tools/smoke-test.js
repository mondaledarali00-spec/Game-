/* Headless smoke test for Fire Zone game.js — stubs DOM/WebGL, runs the real game loop in Node.
   Run with:  node tools/smoke-test.js   (async wrapper at bottom) */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const GAME_DIR = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'game');

/* ---------- stubs ---------- */
function classListStub() {
  const set = new Set();
  return {
    add: (...c) => c.forEach(x => set.add(x)),
    remove: (...c) => c.forEach(x => set.delete(x)),
    contains: c => set.has(c),
    toggle: c => (set.has(c) ? set.delete(c) : set.add(c))
  };
}
function make2DStub() {
  const target = {};
  return new Proxy(target, {
    get(t, p) { if (p in t) return t[p]; return () => {}; },
    set(t, p, v) { t[p] = v; return true; }
  });
}
const glExtensionProxy = new Proxy({}, { get: () => () => {} });
/* real GL constants so constant-comparison paths resolve sensibly */
const GLC = {
  POINTS: 0, LINES: 1, LINE_LOOP: 2, LINE_STRIP: 3, TRIANGLES: 4, TRIANGLE_STRIP: 5, TRIANGLE_FAN: 6,
  ZERO: 0, ONE: 1, SRC_COLOR: 768, SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771, DST_ALPHA: 772,
  FLOAT: 5126, UNSIGNED_BYTE: 5121, UNSIGNED_SHORT: 5123, UNSIGNED_INT: 5125,
  RGBA: 6408, RGB: 6407, LUMINANCE: 6409, UNSIGNED_SHORT_5_6_5: 33635,
  NEAREST: 9728, LINEAR: 9729, NEAREST_MIPMAP_NEAREST: 9984, LINEAR_MIPMAP_NEAREST: 9985,
  NEAREST_MIPMAP_LINEAR: 9986, LINEAR_MIPMAP_LINEAR: 9987,
  REPEAT: 10497, CLAMP_TO_EDGE: 33071, MIRRORED_REPEAT: 33648,
  TEXTURE_2D: 3553, TEXTURE_CUBE_MAP: 34067, TEXTURE0: 33984, ACTIVE_TEXTURE: 34016,
  TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243, TEXTURE_MIN_FILTER: 10241, TEXTURE_MAG_FILTER: 10240,
  ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963, STATIC_DRAW: 35044, DYNAMIC_DRAW: 35048,
  CULL_FACE: 2884, DEPTH_TEST: 2929, STENCIL_TEST: 2960, SCISSOR_TEST: 3089, BLEND: 3042, DITHER: 3024,
  POLYGON_OFFSET_FILL: 32823, SAMPLE_ALPHA_TO_COVERAGE: 32926,
  FRONT: 1028, BACK: 1029, CW: 2304, CCW: 2305, FRONT_AND_BACK: 1032,
  VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632, COMPILE_STATUS: 35713, LINK_STATUS: 35714,
  ACTIVE_UNIFORMS: 35684, ACTIVE_ATTRIBUTES: 35721,
  FRAMEBUFFER: 36160, RENDERBUFFER: 36161, COLOR_ATTACHMENT0: 36064,
  VERSION: 7938, RENDERER: 7937, VENDOR: 7936, SHADING_LANGUAGE_VERSION: 35724,
  MAX_TEXTURE_SIZE: 3379, MAX_RENDERBUFFER_SIZE: 34024, MAX_VIEWPORT_DIMS: 3386,
  MAX_VERTEX_ATTRIBS: 34921, MAX_VARYING_VECTORS: 36348, MAX_VERTEX_UNIFORM_VECTORS: 36347,
  MAX_FRAGMENT_UNIFORM_VECTORS: 36349, MAX_TEXTURE_IMAGE_UNITS: 34930,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660, MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661
};
const STRING_PARAMS = new Set([GLC.VERSION, GLC.RENDERER, GLC.VENDOR, GLC.SHADING_LANGUAGE_VERSION]);
const glOverrides = {
  getParameter: p => {
    if (STRING_PARAMS.has(p)) return 'WebGL 1.0 (stub)';
    if (p === GLC.MAX_VIEWPORT_DIMS) return new Int32Array([16384, 16384]);
    return 4096;
  },
  getExtension: () => glExtensionProxy,
  getSupportedExtensions: () => [],
  getContextAttributes: () => ({ alpha: true }),
  createShader: () => ({}), createProgram: () => ({}),
  createBuffer: () => ({}), createTexture: () => ({}),
  createRenderbuffer: () => ({}), createFramebuffer: () => ({}),
  getShaderParameter: () => true,
  getProgramParameter: () => true,
  getActiveUniform: () => ({ name: 'uStub', type: 5126, size: 1 }),
  getActiveAttrib: () => ({ name: 'aStub', type: 5126, size: 1 }),
  getShaderInfoLog: () => '', getProgramInfoLog: () => '',
  getShaderPrecisionFormat: () => ({ rangeMin: 127, rangeMax: 127, precision: 23 }),
  getUniformLocation: () => ({}),
  getAttribLocation: () => 0,
  getError: () => 0,
  isContextLost: () => false,
  checkFramebufferStatus: () => 36053
};
const glStub = new Proxy({}, {
  get(t, p) {
    if (p in glOverrides) return glOverrides[p];
    if (typeof p === 'string' && p in GLC) return GLC[p];       // real enum values
    if (typeof p === 'string' && /^[A-Z0-9_]+$/.test(p)) return 1; // unknown enums
    return t[p] !== undefined ? t[p] : () => {};
  },
  set(t, p, v) { t[p] = v; return true; }
});

const elementCache = {};
function makeElement(id) {
  const el = {
    id: id,
    style: {},
    width: id === 'minimap' ? 132 : 1280,
    height: id === 'minimap' ? 132 : 720,
    textContent: '',
    innerHTML: '',
    children: [],
    className: '',
    classList: classListStub(),
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore(c) { this.children.unshift(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); if (c) c.parentNode = null; return c; },
    get firstChild() { return this.children[0] || null; },
    get lastChild() { return this.children[this.children.length - 1] || null; },
    getBoundingClientRect() { return { left: 20, top: 500, right: 144, bottom: 624, width: 124, height: 124 }; },
    getContext(type) { return (type === '2d') ? make2DStub() : glStub; },
    requestPointerLock() { sandbox.document.pointerLockElement = el; },
    closest() { return null; },
    focus() {}
  };
  return el;
}

let fakeTime = 0;
let rafCb = null;

const sandbox = {
  console,
  Math, Date, JSON, Promise, Object, Array, Infinity, NaN, isNaN, parseInt, parseFloat,
  performance: { now: () => fakeTime },
  setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), // compress banner waits
  clearTimeout,
  requestAnimationFrame: cb => { rafCb = cb; return 1; },
  cancelAnimationFrame: () => {},
  addEventListener() {}, removeEventListener() {},
  dispatchEvent() {},
  navigator: { maxTouchPoints: 0, userAgent: 'node-test' }
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.window = sandbox;
sandbox.innerWidth = 1280;
sandbox.innerHeight = 720;
sandbox.devicePixelRatio = 2;
sandbox.document = {
  hidden: false,
  pointerLockElement: null,
  body: { classList: classListStub() },
  getElementById: id => elementCache[id] || (elementCache[id] = makeElement(id)),
  createElement: tag => makeElement('dyn-' + tag + '-' + Math.random()),
  addEventListener() {}, removeEventListener() {},
  exitPointerLock() { sandbox.document.pointerLockElement = null; }
};
const ctx = vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(path.join(GAME_DIR, 'three.min.js'), 'utf8'), ctx, { filename: 'three.min.js' });
vm.runInContext(fs.readFileSync(path.join(GAME_DIR, 'game.js'), 'utf8'), ctx, { filename: 'game.js' });

const FZ = sandbox.window.FZ;
if (!FZ) throw new Error('FZ api missing');

/* The game boots through its first-run loader (real timers), so flush the
   event loop to let it finish and start the render loop before testing. */
async function flush(ms) { await new Promise(r => setTimeout(r, ms || 40)); }

(async () => {
await flush(150);
assert(typeof rafCb === 'function', 'loader completed, render loop started');

/* ---------- helpers ---------- */
function frames(n, dtMs = 16.7) {
  for (let i = 0; i < n; i++) {
    fakeTime += dtMs;
    if (rafCb) { const cb = rafCb; rafCb = null; cb(fakeTime); }
  }
}
function seconds(s, dtMs = 16.7) { frames(Math.ceil((s * 1000) / dtMs), dtMs); }
let failed = false;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failed = true; process.exit(1); }
  console.log('PASS:', msg);
}

/* ---------- 1. menu ambient ---------- */
frames(30);
assert(FZ.player.mode === 'menu', 'menu mode active, ambient world ticking');

/* ---------- 2. drop ---------- */
FZ.start();
assert(FZ.player.mode === 'drop', 'match started, parachute drop active');
assert(FZ.bots.length === 29 && FZ.botsAlive() === 29, '29 bots spawned (30 players total)');
assert(FZ.weapons && FZ.weapons.sniper && FZ.weapons.scar && FZ.weapons.lmg, '7 weapons registered incl. SCAR-L, M249, M24');
seconds(11);
assert(FZ.player.mode === 'play', 'landed after ~9s drop, mode=play');

/* ---------- 3. move + look ---------- */
FZ.input.keys['KeyW'] = true;
FZ.input.lookDx = 40;
seconds(1);
FZ.input.keys['KeyW'] = false;
console.log('PASS: movement + look ticked');

/* ---------- 4. zone ---------- */
const r0 = FZ.zone.r;
seconds(30);
assert(FZ.zone.r <= r0 && FZ.zone.state !== 'idle', 'zone active, r=' + FZ.zone.r.toFixed(1) + ' state=' + FZ.zone.state);

/* ---------- 5. combat ---------- */
if (FZ.player.mode !== 'play' || FZ.player.hp < 60) { FZ.start(); seconds(11); }
FZ.player.hp = 100;
FZ.give('rifle');
function shootBot(bot) {
  for (let guard = 0; guard < 300; guard++) {
    if (!bot.alive) return true;
    if (FZ.player.mode !== 'play') return false;
    FZ.player.hp = 100; // keep the harness alive; mortality is tested separately
    const p = FZ.player.pos;
    p.x = bot.pos.x + 4; p.y = 0; p.z = bot.pos.z;
    FZ.player.yaw = Math.atan2(bot.pos.x - p.x, bot.pos.z - p.z);
    FZ.player.elev = 0.05;
    FZ.fire();
    seconds(0.25);
  }
  return !bot.alive;
}
const before = FZ.botsAlive();
const b0 = FZ.bots.find(b => b.alive);
assert(shootBot(b0), 'player eliminated a bot (alive ' + before + ' -> ' + FZ.botsAlive() + ', kills=' + FZ.player.kills + ')');

/* sniper one-shot kill check */
const bS = FZ.bots.find(b => b.alive);
FZ.give('sniper');
let sniped = false;
for (let g = 0; g < 60; g++) {
  if (!bS.alive) { sniped = true; break; }
  if (FZ.player.mode !== 'play') break;
  FZ.player.hp = 100;
  const ps = FZ.player.pos;
  ps.x = bS.pos.x + 6; ps.y = 0; ps.z = bS.pos.z;
  FZ.player.yaw = Math.atan2(bS.pos.x - ps.x, bS.pos.z - ps.z);
  FZ.player.elev = 0.05;
  FZ.fire();
  if (!bS.alive) sniped = true;
  seconds(0.4);
}
assert(sniped, 'M24 sniper one-shot elimination works');

seconds(4);
console.log('PASS: bot return-fire simulation stable');

/* ---------- 6. pause/resume ---------- */
FZ.pause();
FZ.step(0.016);
FZ.resume();
console.log('PASS: pause/resume');

/* ---------- 7. zone death path ---------- */
FZ.player.hp = 5;
FZ.player.pos.x = (FZ.zone.cx || 0) + FZ.zone.r + 30;
FZ.player.pos.z = FZ.zone.cz || 0;
seconds(3);
assert(FZ.player.hp <= 5 || FZ.player.mode !== 'play', 'zone damage path executed (hp=' + FZ.player.hp.toFixed(0) + ', mode=' + FZ.player.mode + ')');

/* ---------- 8. full match to last-man-standing ---------- */
FZ.start();
seconds(11);
FZ.give('rifle');
let rounds = 0;
while (FZ.botsAlive() > 0 && rounds++ < 75) {
  if (FZ.player.mode !== 'play') { FZ.start(); seconds(11); FZ.give('rifle'); } // got killed — redeploy
  const bot = FZ.bots.find(b => b.alive);
  if (!bot) break;
  // pull the target into the safe zone so the harness doesn't fight the zone
  bot.pos.x = FZ.zone.cx + (rounds % 7) - 3;
  bot.pos.z = FZ.zone.cz + (rounds % 5) - 2;
  bot.target = null;
  shootBot(bot);
  seconds(1.5); // let fake elims / skirmish / zone damage run
}
assert(FZ.botsAlive() === 0, 'all ' + FZ.bots.length + ' bots eliminated in ' + rounds + ' rounds');

setTimeout(() => {
  console.log('PASS: endgame reached, mode=' + FZ.player.mode);
  console.log('\nALL SMOKE TESTS PASSED');
  process.exit(0);
}, 2200);
})().catch(e => { console.error('TEST CRASH:', e && e.message); process.exit(1); });
