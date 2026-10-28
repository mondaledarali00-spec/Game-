#!/usr/bin/env node
/* Issue GymFlow Pro licence keys.

   Server keys (default) — verified by the backend at /api/redeem:
     node scripts/gen-license.mjs --plan pro_lifetime --count 5
       -> needs LICENSE_SECRET, same value the backend runs with.

   Offline keys — verified inside the APK, no network required:
     node scripts/gen-license.mjs --offline --days 365
       -> signed with the key baked into webapp/js/pay.js. Handy for
          gifting Pro, but anyone can extract that secret from the APK.

   Options: --plan <id>  --days <n>  --count <n>  --offline  --secret <s>
*/
import crypto from 'node:crypto';
import { b32encode } from '../backend/lib/license.mjs';

const OFFLINE_SECRET = 'gymflow-offline-license-v1'; // must match webapp/js/pay.js

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const has = (name) => args.includes(name);

const plan = getArg('--plan', 'pro_lifetime');
const days = getArg('--days', null);
const count = Number(getArg('--count', '1'));
const offline = has('--offline');
const secret = getArg('--secret', process.env.LICENSE_SECRET || 'change-me-gymflow-license-secret');

function offlineSignature(payload) {
  // mirrors webapp/js/pay.js
  return crypto.createHash('sha256').update('GF1|' + payload + '|' + OFFLINE_SECRET).digest('hex').slice(0, 24).toUpperCase();
}
function serverSignature(payload) {
  return crypto.createHmac('sha256', secret).update('GF1|' + payload).digest('hex').slice(0, 24).toUpperCase();
}

const expiry = days ? Date.now() + Number(days) * 86400000 : null;
console.log(`# GymFlow Pro keys — plan=${plan} days=${days || 'never expires'} mode=${offline ? 'OFFLINE' : 'SERVER'}`);
for (let i = 0; i < Math.max(1, count); i++) {
  const payload = b32encode(JSON.stringify({ p: plan, e: expiry, n: crypto.randomBytes(4).toString('hex') }));
  const sig = offline ? offlineSignature(payload) : serverSignature(payload);
  console.log(`GF-${payload}-${sig}`);
}
if (!offline) {
  console.log('\nRedeem these inside the app (Pro → Redeem key) while the device is online.');
} else {
  console.log('\nThese work entirely offline — the app validates the signature itself.');
}
