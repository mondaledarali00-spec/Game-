#!/usr/bin/env node
/* Headless UI smoke test: boots webapp/index.html in jsdom, then drives the UI
   through signup -> onboarding -> every tab -> a full workout -> paywall flows,
   including the UPI sheet and the merchant-card / setup-check additions.

   Run:   npm i -D jsdom && node scripts/test-ui.mjs
   or:    NODE_PATH=/path/with/jsdom node scripts/test-ui.mjs            */
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = fileURLToPath(new URL('../webapp/', import.meta.url));
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + (e && e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  resources: undefined,
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    // every canvas call "works" and returns another chainable stub
    const any = () => new Proxy(function () {}, {
      get: (t, k) => (k === 'width' || k === 'height' ? 20 : any()),
      apply: () => any(),
      set: () => true,
      has: () => true
    });
    window.HTMLCanvasElement.prototype.getContext = function () { return any(); };
    window.HTMLElement.prototype.getBoundingClientRect = function () {
      return { width: 340, height: 150, top: 0, left: 0, right: 340, bottom: 150 };
    };
    window.navigator.vibrate = () => true;
    window.fetch = () => Promise.reject(new Error('offline test'));
  }
});

// jsdom does not execute <script src> for local relative files by default with
// resources undefined, so load them manually in order.
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
for (const src of scripts) {
  const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
  dom.window.eval(code);
}

const { window } = dom;
const { document } = window;

// jsdom fires DOMContentLoaded asynchronously; give scripts a tick to boot
await new Promise((resolve) => setTimeout(resolve, 50));
if (!document.getElementById('app').innerHTML) {
  // fall back to calling boot directly
  try { window.GymApp.render(); } catch (e) { errors.push('boot: ' + e.message); }
}

function click(sel) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) throw new Error('missing element: ' + sel);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}
function setInput(id, value) {
  const el = document.getElementById(id);
  if (!el) throw new Error('missing input #' + id);
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}
function text() { return document.getElementById('app').textContent; }
function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
  console.log('  ok  ' + msg);
}

try {
  assert(text().includes('GymFlow'), 'login screen renders');
  click('[data-action="auth-mode"][data-mode="signup"]');
  setInput('auth-name', 'Arjun Mehta');
  setInput('auth-pass', 'gym1234');
  click('[data-action="auth-submit"]');
  assert(text().includes('set up your training'), 'onboarding shows after signup');

  setInput('ob-age', '27');
  setInput('ob-height', '178');
  setInput('ob-weight', '76');
  click('[data-action="ob-finish"]');
  assert(text().includes('Hey Arjun'), 'home greets the user');
  assert(text().includes('Start workout'), 'home shows the recommended session');
  assert(text().includes('Sponsored'), 'free tier shows an ad');

  // ---- full workout -------------------------------------------------------
  click('[data-action="start-program-day"]');
  assert(text().includes('sets logged'), 'session player opened');
  const firstCheck = document.querySelector('[data-action="toggle-set"]');
  click(firstCheck);
  assert(document.querySelectorAll('[data-action="toggle-set"].on').length === 1, 'set logged');
  document.querySelectorAll('.set-input')[0].value = '40';
  document.querySelectorAll('.set-input')[0].dispatchEvent(new window.Event('input', { bubbles: true }));
  document.querySelector('[data-action="finish-session"]').click();
  assert(text().includes('Hey Arjun'), 'back on home after finishing');
  const data = window.Store.data();
  assert(data.workouts.length === 1, 'workout persisted');
  assert(data.workouts[0].volume > 0, 'volume computed (' + data.workouts[0].volume + ' kg)');

  // ---- tabs ---------------------------------------------------------------
  click('[data-action="tab"][data-tab="train"]');
  assert(text().includes('Full Body Foundation'), 'programs listed');
  click('[data-action="open-program"][data-program="ppl"]');
  assert(text().includes('Push'), 'program detail opens');
  click('[data-action="close-program"]');

  click('[data-action="tab"][data-tab="progress"]');
  assert(text().includes('Personal records'), 'progress tab renders charts + PRs');
  assert(text().includes('kcal'), 'nutrition target computed');

  click('[data-action="tab"][data-tab="pro"]');
  assert(text().includes('Go Pro'), 'pro tab renders');
  assert(text().includes('149'), 'price shown');
  assert(text().includes('Money goes to this UPI ID'), 'pro tab shows the receiving-account card');
  assert(text().includes('8089274532@axl'), 'pro tab shows the merchant UPI ID without opening a sheet');
  assert(text().includes('auto-verify OFF'), 'unconfigured server is labelled honestly');

  click('[data-action="buy"][data-plan="pro_lifetime"]');
  await new Promise((r) => setTimeout(r, 20));
  var sheetText = document.getElementById('overlay').textContent;
  assert(sheetText.includes('Pay ₹149 by UPI'), 'UPI payment sheet opens');
  assert(sheetText.includes('8089274532@axl'), 'sheet shows the merchant UPI ID');
  assert(sheetText.includes('12-digit UTR'), 'sheet asks for the UTR');
  assert(window.Pay.currentUpiOrder() && window.Pay.currentUpiOrder().uri.indexOf('upi://pay?pa=') === 0, 'UPI deep link built');
  click('[data-action="close-sheet"]');
  click('[data-action="tab"][data-tab="more"]');
  setInput('set-server', 'http://localhost:8787');
  click('[data-action="save-server"]');
  await new Promise((r) => setTimeout(r, 10));

  // redeem an offline licence key
  const code = window.Pay.makeOfflineCode('pro_lifetime', null, 'test');
  document.querySelector('[data-action="sheet-redeem"]').click();
  setInput('redeem-input', code);
  click('[data-action="redeem-submit"]');
  await new Promise((r) => setTimeout(r, 30));
  assert(window.Store.isPro(), 'offline licence key unlocks Pro');

  click('[data-action="tab"][data-tab="home"]');
  assert(!text().includes('Sponsored'), 'ads disappear for Pro users');
  click('[data-action="tab"][data-tab="pro"]');
  assert(text().includes('ad-free'), 'pro screen shows active membership');

  click('[data-action="tab"][data-tab="more"]');
  assert(text().includes('Cloud & payments server'), 'settings render');
  setInput('set-server', 'https://example.com');
  click('[data-action="save-server"]');
  await new Promise((r) => setTimeout(r, 10));
  assert(window.Api.apiBase() === 'https://example.com', 'server URL saved');

  // water + weight
  click('[data-action="tab"][data-tab="home"]');
  click('[data-action="sheet-water"]');
  click('[data-action="water-add"][data-ml="250"]');
  assert(window.Store.waterToday() === 250, 'water logged');

  // logout / login round-trip
  click('[data-action="close-sheet"]');
  click('[data-action="tab"][data-tab="more"]');
  click('[data-action="sign-out"]');
  assert(text().includes('Sign in'), 'signed out to login screen');
  setInput('auth-name', 'Arjun Mehta');
  setInput('auth-pass', 'gym1234');
  click('[data-action="auth-submit"]');
  assert(text().includes('Hey Arjun'), 'signed back in');
  assert(window.Store.isPro(), 'pro entitlement survived re-login');

  const exported = window.Store.exportJSON();
  assert(exported.includes('"app": "GymFlow"'), 'backup export works');

  console.log('\nALL UI CHECKS PASSED');
  if (errors.length) {
    console.log('\nConsole errors seen during the run:');
    errors.forEach((e) => console.log('  ! ' + e));
    process.exit(2);
  }
  process.exit(0);
} catch (err) {
  console.error('\nFAILED: ' + err.message);
  if (errors.length) errors.forEach((e) => console.error('  ! ' + e));
  process.exit(1);
}
