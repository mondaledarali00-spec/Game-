#!/usr/bin/env node
/* Copy webapp/ into android/assets/www so the APK ships the same UI that the
   browser preview uses.

   Optional: bake a default backend URL into the APK
     GYMFLOW_API_BASE=https://gym.yourapp.com node scripts/sync-webapp.mjs
   Without it the app starts in pure offline mode and the URL can be typed in
   Settings -> Cloud server (stored per device, so no rebuild needed). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'webapp');
const DEST = path.join(ROOT, 'android', 'assets', 'www');
const apiBase = (process.env.GYMFLOW_API_BASE || '').replace(/\/+$/, '');

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

rmrf(DEST);
copyDir(SRC, DEST);

const configPath = path.join(DEST, 'js', 'config.js');
let config = fs.readFileSync(configPath, 'utf8');
if (apiBase) {
  config = config.replace(/apiBase:\s*'[^']*'/, `apiBase: '${apiBase}'`);
  // real builds are not demos
  config = config.replace(/demoMode:\s*true/, 'demoMode: false');
  fs.writeFileSync(configPath, config);
}

const bytes = fs.readdirSync(DEST).length;
console.log(`webapp -> android/assets/www (${bytes} top-level entries)`);
console.log(`apiBase baked in: ${apiBase || '(none — offline mode, configurable in Settings)'}`);
