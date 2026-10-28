#!/usr/bin/env node
/* GymFlow backend — the merchant bridge between the GymFlow app and a
   self-hosted YOUPI PG instance.

   It does three jobs:
     1. Creates UPI payment sessions (YOUPI PG  POST /api/v1/payments).
     2. Receives YOUPI PG webhooks (HMAC-SHA256 signed) and flips a device
        to "Pro" once the money is actually observed/reconciled.
     3. Serves the same web app the APK bundles, so you can test in a browser,
        plus optional cloud backup + house ads.

   Run:  cp backend/.env.example .env  &&  npm --prefix backend start
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, plans, planById, readJSON, BACKEND_DIR } from './lib/config.mjs';
import { orders, entitlements, syncs } from './lib/store.mjs';
import { YoupiClient, mockProvider } from './lib/youpi.mjs';
import { makeLicense, verifyLicense } from './lib/license.mjs';
import { buildUpiUri, newRef, normaliseUtr, matchCredit, merchantUpi, toPaise } from './lib/upi.mjs';

const youpi = new YoupiClient();
const adsConfig = readJSON(path.join(BACKEND_DIR, 'config', 'ads.json'), { ads: [] });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon'
};

function send(res, status, body, headers = {}) {
  const base = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Cache-Control': 'no-store',
    ...headers
  };
  if (body === undefined || body === null) {
    res.writeHead(status, base);
    return res.end();
  }
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    res.writeHead(status, base);
    return res.end(body);
  }
  base['Content-Type'] = 'application/json; charset=utf-8';
  res.writeHead(status, base);
  res.end(JSON.stringify(body));
}

const ok = (res, data) => send(res, 200, data || { ok: true });
const fail = (res, status, error, extra = {}) => send(res, status, { error, ...extra });

function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400 }); }
}

const newOrderId = () =>
  'GYM-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();

function publicBase(req) {
  if (config.publicBaseUrl) return config.publicBaseUrl.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${config.port}`;
  return `${proto}://${host}`;
}

function grantPro(order, { source, status, grant }) {
  const days = planById(order.planId)?.days || null;
  const expires = days ? Date.now() + days * 86400000 : null;
  const ent = entitlements.grant(order.deviceId, {
    plan: order.planId,
    orderId: order.orderId,
    source,
    status,
    grant,
    expires
  });
  orders.update(order.orderId, { status, paidAt: Date.now(), grant });
  return ent;
}

/* ------------------------------------------------------------------ */
/* payment routes                                                     */
/* ------------------------------------------------------------------ */
async function handleCheckout(req, res, reqUrl) {
  const body = await readJson(req);
  const plan = planById(body.planId);
  if (!plan) return fail(res, 400, 'Unknown planId');
  const deviceId = String(body.deviceId || '').slice(0, 80);
  if (!deviceId) return fail(res, 400, 'deviceId is required');

  const existing = entitlements.get(deviceId);
  if (existing && existing.pro && (!existing.expires || existing.expires > Date.now())) {
    return ok(res, { alreadyPro: true, orderId: existing.orderId, plan: existing.plan });
  }

  const orderId = newOrderId();
  const base = publicBase(req);
  const returnUrl = config.youpi.returnUrl || `${base}/paid.html?orderId=${encodeURIComponent(orderId)}`;

  const order = {
    orderId,
    planId: plan.id,
    amount: plan.amount,
    currency: 'INR',
    deviceId,
    user: body.user || null,
    status: 'created',
    provider: config.provider,
    createdAt: Date.now(),
    returnUrl
  };
  orders.create(order);

  try {
    const payload = {
      orderId,
      amount: plan.amount,
      currency: 'INR',
      returnUrl,
      description: `GymFlow ${plan.label}`,
      metadata: { deviceId, planId: plan.id, app: 'GymFlow' },
      idempotencyKey: 'gymflow-' + orderId
    };

    let created;
    if (config.provider === 'youpi') {
      if (!youpi.configured) {
        orders.update(orderId, { status: 'failed', error: 'gateway_not_configured' });
        return fail(res, 503, 'YOUPI PG is not configured on the server (YOUPI_MERCHANT_ID / YOUPI_MERCHANT_SECRET).');
      }
      created = await youpi.createPayment(payload);
      // The public contract returns a checkoutUrl; fall back to the portal route.
      if (!created.checkoutUrl && created.paymentId) {
        created.checkoutUrl = `${config.youpi.portalUrl.replace(/\/+$/, '')}/checkout/${created.paymentId}`;
      }
    } else {
      created = await mockProvider.createPayment(payload);
      created.checkoutUrl = new URL(created.checkoutUrl, base).toString();
    }

    orders.update(orderId, {
      status: 'pending_payment',
      paymentId: created.paymentId,
      checkoutUrl: created.checkoutUrl
    });

    return send(res, 201, {
      orderId,
      paymentId: created.paymentId,
      amount: plan.amount,
      currency: 'INR',
      status: created.status || 'INITIATED',
      checkoutUrl: created.checkoutUrl,
      provider: config.provider
    });
  } catch (err) {
    orders.update(orderId, { status: 'failed', error: err.message });
    return fail(res, 502, 'Could not create the payment session: ' + err.message);
  }
}

async function handleYoupiWebhook(req, res) {
  const raw = await readBody(req);
  const signature = req.headers['x-gateway-signature'];
  const timestamp = req.headers['x-gateway-timestamp'];
  let event;
  try {
    event = youpi.verifyWebhook(raw.toString('utf8'), signature, timestamp);
  } catch (err) {
    console.warn('[webhook] rejected:', err.message);
    return fail(res, 400, 'Invalid webhook: ' + err.message);
  }

  let order = orders.findByPayment(event.paymentId) || orders.get(event.orderId);
  if (!order && event.metadata && event.metadata.ref) order = orders.get(String(event.metadata.ref));
  if (!order && ['OBSERVED_SUCCESS', 'RECONCILED', 'SUCCESS'].includes(event.event)) {
    // A credit arrived that belongs to a direct-to-VPA order: match by UTR, then
    // by exact amount. This is what makes payment confirmation automatic.
    const matched = matchCredit(orders.list(), {
      utr: event.utr || null,
      amountPaise: event.amountPaise || null,
      at: Date.now()
    });
    if (matched) {
      order = matched;
      console.log(`[webhook] matched direct-UPI order ${order.orderId} by ${event.utr ? 'UTR ' + event.utr : 'amount'}`);
    }
  }
  if (!order) {
    console.warn('[webhook] unknown order/payment', event.orderId, event.paymentId);
    return ok(res, { received: true, ignored: 'unknown-order' });
  }

  const grant = {
    event: event.event,
    utr: event.utr || null,
    verificationLevel: event.verificationLevel ?? null,
    at: Date.now(),
    amountPaise: event.amountPaise ?? null
  };

  const moneySeen = ['OBSERVED_SUCCESS', 'RECONCILED', 'SUCCESS'].includes(event.event);
  const reconciled = event.event === 'RECONCILED';

  if (moneySeen) {
    if (reconciled || event.event === 'SUCCESS') {
      grantPro(order, { source: order.flow === 'direct-upi' ? 'upi-auto-verified' : (reconciled ? 'gateway-reconciled' : 'gateway-observed'), status: 'paid', grant });
    } else if (config.grantOn === 'observed') {
      grantPro(order, { source: order.flow === 'direct-upi' ? 'upi-auto-verified' : 'gateway-observed', status: 'observed_pending_reconciliation', grant });
    } else {
      orders.update(order.orderId, { status: 'observed_pending_reconciliation', observedAt: Date.now(), grant });
    }
  } else if (['FAILED', 'EXPIRED', 'CANCELLED', 'MANUAL_REVIEW'].includes(event.event)) {
    orders.update(order.orderId, { status: event.event.toLowerCase(), lastEvent: event.event, grant });
  }

  console.log(`[webhook] ${event.event} order=${order.orderId} utr=${event.utr || '-'}`);
  return ok(res, { received: true });
}

function handleEntitlement(res, reqUrl) {
  const deviceId = reqUrl.searchParams.get('deviceId') || '';
  const orderId = reqUrl.searchParams.get('orderId') || '';
  if (!deviceId && !orderId) return fail(res, 400, 'deviceId or orderId required');

  const ent = deviceId ? entitlements.get(deviceId) : null;
  if (ent && ent.pro && (!ent.expires || ent.expires > Date.now())) {
    return ok(res, {
      pro: true,
      plan: ent.plan,
      orderId: ent.orderId,
      source: ent.source === 'gateway-observed' ? 'gateway-observed' : ent.source,
      status: ent.status,
      expires: ent.expires,
      note: ent.status === 'observed_pending_reconciliation'
        ? 'Payment seen in a bank alert. It is not yet matched to a bank statement.'
        : undefined,
      since: ent.since
    });
  }

  if (orderId) {
    const order = orders.get(orderId);
    if (order) {
      if (['paid', 'observed_pending_reconciliation'].includes(order.status) && (!deviceId || order.deviceId === deviceId)) {
        const granted = grantPro(order, {
          source: 'gateway-observed',
          status: order.status,
          grant: order.grant || null
        });
        return ok(res, { pro: true, plan: granted.plan, orderId, status: granted.status, source: granted.source });
      }
      return ok(res, { pro: false, status: order.status, orderId });
    }
  }
  return ok(res, { pro: false, status: 'none' });
}

async function handleRedeem(req, res) {
  const body = await readJson(req);
  const code = String(body.code || '').trim();
  const deviceId = String(body.deviceId || '').slice(0, 80);
  if (!code) return fail(res, 400, 'code is required');
  if (!deviceId) return fail(res, 400, 'deviceId is required');

  const result = verifyLicense(code, config.licenseSecret);
  if (!result.ok) return fail(res, 400, result.error);

  const days = result.info.e ? Math.max(1, Math.round((result.info.e - Date.now()) / 86400000)) : null;
  const ent = entitlements.grant(deviceId, {
    plan: result.info.p || 'lifetime',
    orderId: 'LICENSE-' + (result.info.n || crypto.randomBytes(3).toString('hex')),
    source: 'licence',
    status: 'paid',
    expires: result.info.e || null
  });
  console.log(`[redeem] device=${deviceId} plan=${ent.plan} days=${days ?? 'lifetime'}`);
  return ok(res, { pro: true, plan: ent.plan, status: ent.status, expires: ent.expires });
}

async function handleMockPay(res, orderId) {
  if (config.provider !== 'mock') return fail(res, 404, 'Mock provider is disabled');
  const order = orders.get(orderId);
  if (!order) return fail(res, 404, 'Order not found');
  grantPro(order, {
    source: 'gateway-observed',
    status: 'paid',
    grant: { event: 'RECONCILED', utr: 'MOCK' + Date.now().toString().slice(-9), at: Date.now(), mock: true }
  });
  return ok(res, { orderId, status: 'paid', mock: true });
}


/* ------------------------------------------------------------------ */
/* direct-to-VPA UPI collection                                        */
/* ------------------------------------------------------------------ */
function adminTokenFrom(req, reqUrl) {
  return req.headers['x-admin-token'] || reqUrl.searchParams.get('token') || '';
}
function isAdmin(req, reqUrl) {
  if (!config.adminToken) return false;
  const given = String(adminTokenFrom(req, reqUrl));
  const a = Buffer.from(given);
  const b = Buffer.from(config.adminToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handleUpiOrder(req, res) {
  const body = await readJson(req);
  const plan = planById(body.planId);
  if (!plan) return fail(res, 400, 'Unknown planId');
  const deviceId = String(body.deviceId || '').slice(0, 80);
  if (!deviceId) return fail(res, 400, 'deviceId is required');

  const existing = entitlements.get(deviceId);
  if (existing && existing.pro && (!existing.expires || existing.expires > Date.now())) {
    return ok(res, { alreadyPro: true, plan: existing.plan });
  }

  const ref = newRef(plan.id);
  const note = `GymFlow ${plan.label} ${ref}`;
  const order = {
    orderId: ref,
    ref,
    flow: 'direct-upi',
    planId: plan.id,
    amount: plan.amount,
    currency: 'INR',
    deviceId,
    user: body.user || null,
    status: 'awaiting_payment',
    upiId: merchantUpi.upiId,
    createdAt: Date.now(),
    expiresAt: Date.now() + config.upiOrderTtlMs
  };
  orders.create(order);
  console.log(`[upi] order ${ref} ₹${plan.amount} device=${deviceId}`);

  return send(res, 201, {
    ok: true,
    ref,
    orderId: ref,
    planId: plan.id,
    amount: plan.amount,
    currency: 'INR',
    upiId: merchantUpi.upiId,
    payeeName: merchantUpi.payeeName,
    note,
    upiUri: buildUpiUri({ amount: plan.amount, note, ref }),
    expiresAt: order.expiresAt,
    status: order.status
  });
}

async function handleUpiUtr(req, res) {
  const body = await readJson(req);
  const ref = String(body.ref || '').slice(0, 64);
  const utr = normaliseUtr(body.utr);
  if (!ref) return fail(res, 400, 'ref is required');
  if (!utr) return fail(res, 400, 'That is not a 12-digit UPI reference number (UTR).');

  const order = orders.get(ref);
  if (!order) return fail(res, 404, 'Unknown order reference');
  if (order.status === 'paid') return ok(res, { status: 'paid', pro: true });

  orders.update(ref, { utr, utrSubmittedAt: Date.now(), status: 'awaiting_confirmation' });
  console.log(`[upi] UTR submitted ${ref} utr=${utr}`);

  // If the merchant already confirmed this UTR by hand, or an auto-match landed
  // while the customer was typing, the entitlement is already there.
  const ent = entitlements.get(order.deviceId);
  if (ent && ent.pro && (!ent.expires || ent.expires > Date.now())) {
    return ok(res, { status: 'paid', pro: true });
  }
  return ok(res, {
    status: 'awaiting_confirmation',
    pro: false,
    message: 'Payment reference received. We will unlock Pro as soon as the credit is confirmed.'
  });
}

function handleUpiStatus(res, reqUrl) {
  const ref = String(reqUrl.searchParams.get('ref') || '').slice(0, 64);
  const deviceId = String(reqUrl.searchParams.get('deviceId') || '').slice(0, 80);
  if (!ref && !deviceId) return fail(res, 400, 'ref or deviceId required');

  const order = ref ? orders.get(ref) : null;
  const ent = entitlements.get(order ? order.deviceId : deviceId);
  const pro = Boolean(ent && ent.pro && (!ent.expires || ent.expires > Date.now()));

  if (!order) {
    if (pro) return ok(res, { pro: true, status: 'paid', plan: ent.plan });
    return ok(res, { pro: false, status: 'none' });
  }
  return ok(res, {
    pro,
    status: pro ? 'paid' : order.status,
    ref: order.orderId,
    plan: order.planId,
    amount: order.amount,
    utr: order.utr || null,
    createdAt: order.createdAt,
    message: pro
      ? 'Payment confirmed — Pro unlocked.'
      : order.status === 'awaiting_confirmation'
        ? 'Reference received, waiting for the bank confirmation.'
        : 'Waiting for your payment.'
  });
}

function listPending() {
  return orders.list().filter((o) => o.flow === 'direct-upi');
}

function handleAdminOrders(req, res, reqUrl) {
  if (!isAdmin(req, reqUrl)) return fail(res, 401, 'Bad or missing admin token');
  const list = listPending().slice(0, 200).map((o) => ({
    ref: o.orderId,
    plan: o.planId,
    amount: o.amount,
    status: o.status,
    utr: o.utr || null,
    device: o.deviceId,
    user: o.user,
    createdAt: o.createdAt,
    utrSubmittedAt: o.utrSubmittedAt || null
  }));
  return ok(res, { orders: list, upiId: merchantUpi.upiId });
}

async function handleAdminDecision(req, res, reqUrl, ref, decision) {
  if (!isAdmin(req, reqUrl)) return fail(res, 401, 'Bad or missing admin token');
  const order = orders.get(ref);
  if (!order) return fail(res, 404, 'Unknown order');

  if (decision === 'approve') {
    const ent = grantPro(order, {
      source: 'upi-verified',
      status: 'paid',
      grant: { event: 'MANUAL_VERIFIED', utr: order.utr || null, at: Date.now() }
    });
    console.log(`[admin] approved ${ref} -> device ${order.deviceId}`);
    return ok(res, { ok: true, status: 'paid', plan: ent.plan, deviceId: order.deviceId });
  }

  orders.update(ref, { status: 'rejected', rejectedAt: Date.now() });
  console.log(`[admin] rejected ${ref}`);
  return ok(res, { ok: true, status: 'rejected' });
}

function adminPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GymFlow payments</title>
<style>
:root{color-scheme:dark}
body{margin:0;background:#070a08;color:#e9f2ea;font-family:system-ui,-apple-system,sans-serif;padding:18px}
h1{font-size:20px;margin:0 0 4px}p.sub{color:#8f9c92;font-size:13px;margin:0 0 16px}
.card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:14px;margin-bottom:10px}
.row{display:flex;justify-content:space-between;gap:10px;align-items:center}
.ref{font-family:ui-monospace,monospace;font-size:12px;color:#a3e635}
.amt{font-size:20px;font-weight:800}
.meta{font-size:12px;color:#8f9c92;margin-top:6px;line-height:1.5}
button{border:0;border-radius:11px;padding:10px 14px;font-weight:700;font-size:13px;cursor:pointer}
.ok{background:linear-gradient(180deg,#b6ef4d,#8fd11f);color:#0a1206}
.no{background:rgba(248,113,113,.16);color:#fca5a5;border:1px solid rgba(248,113,113,.35)}
.pill{display:inline-block;font-size:10px;letter-spacing:.1em;text-transform:uppercase;padding:4px 8px;border-radius:6px;background:rgba(56,189,248,.16);color:#7dd3fc}
.pill.paid{background:rgba(163,230,53,.18);color:#a3e635}
input{width:100%;box-sizing:border-box;padding:11px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#0b120d;color:#e9f2ea;margin-bottom:10px}
</style></head><body>
<h1>GymFlow payment console</h1>
<p class="sub">Money going to <strong id="upi">…</strong> · approve a payment only after you see the credit in your bank app.</p>
<div id="login" class="card" style="display:none">
  <input id="tok" type="password" placeholder="admin token (ADMIN_TOKEN in backend/.env)">
  <button class="ok" onclick="saveToken()">Open console</button>
</div>
<div id="list"></div>
<div id="msg" class="sub"></div>
<script>
const token = new URLSearchParams(location.search).get('token') || localStorage.getItem('gf_admin') || '';
if (!token) { document.getElementById('login').style.display='block'; }
function saveToken(){
  const v = document.getElementById('tok').value.trim();
  localStorage.setItem('gf_admin', v);
  location.search = '?token=' + encodeURIComponent(v);
}
const fmt = ts => new Date(ts).toLocaleString();
async function load(){
  if(!token) return;
  const r = await fetch('/api/admin/orders?token=' + encodeURIComponent(token));
  if(r.status === 401){ document.getElementById('login').style.display='block'; document.getElementById('msg').textContent='Token rejected.'; return; }
  const j = await r.json();
  document.getElementById('upi').textContent = j.upiId || '';
  const box = document.getElementById('list');
  if(!j.orders.length){ box.innerHTML = '<div class="card">No orders yet.</div>'; return; }
  box.innerHTML = j.orders.map(o => \`
    <div class="card">
      <div class="row"><div><span class="pill \${o.status==='paid'?'paid':''}">\${o.status}</span>
        <div class="ref">\${o.ref}</div></div><div class="amt">₹\${o.amount}</div></div>
      <div class="meta">\${o.plan} · device \${o.device.replace(/&/g,'&amp;')}\${o.user?' · '+String(o.user).replace(/&/g,'&amp;'):''}<br>
      UTR: <strong>\${o.utr || 'not entered yet'}</strong><br>
      created \${fmt(o.createdAt)}\${o.utrSubmittedAt?' · ref submitted '+fmt(o.utrSubmittedAt):''}</div>
      \${o.status==='paid'?'':\`<div class="row" style="margin-top:10px">
        <button class="ok" onclick="decide('\${o.ref}','approve')">Approve</button>
        <button class="no" onclick="decide('\${o.ref}','reject')">Reject</button></div>\`}
    </div>\`).join('');
}
async function decide(ref, action){
  const r = await fetch('/api/admin/orders/' + ref + '/' + action + '?token=' + encodeURIComponent(token), {method:'POST'});
  const j = await r.json();
  document.getElementById('msg').textContent = j.error ? j.error : (action==='approve' ? 'Approved — the phone unlocks within 5s.' : 'Rejected.');
  load();
}
load(); setInterval(load, 8000);
</script></body></html>`;
}

/* ------------------------------------------------------------------ */
/* static files                                                       */
/* ------------------------------------------------------------------ */
function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.join(config.webRoot, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(config.webRoot)) return fail(res, 403, 'Forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA-ish fallback so deep links still boot the app
      fs.readFile(path.join(config.webRoot, 'index.html'), (err2, html) => {
        if (err2) return fail(res, 404, 'Not found');
        send(res, 200, html, { 'Content-Type': MIME['.html'] });
      });
      return;
    }
    send(res, 200, data, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=60'
    });
  });
}

function mockCheckoutPage(req, res, reqUrl) {
  const orderId = reqUrl.searchParams.get('orderId') || '';
  const order = orders.get(orderId);
  if (!order) return send(res, 404, '<h1>Unknown order</h1>', { 'Content-Type': MIME['.html'] });
  const plan = planById(order.planId);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GymFlow — mock UPI checkout</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070a08;color:#e9f2ea;font-family:system-ui,sans-serif}
.card{max-width:380px;width:92%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:24px}
h1{font-size:19px;margin:0 0 4px}p{color:rgba(233,242,234,.6);font-size:13px;line-height:1.6}
.amt{font-size:34px;font-weight:800;color:#a3e635;margin:14px 0}
button{width:100%;padding:14px;border-radius:14px;border:0;background:linear-gradient(180deg,#b6ef4d,#8fd11f);color:#0a1206;font-weight:800;font-size:15px;margin-top:10px}
.pill{display:inline-block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;background:rgba(56,189,248,.18);color:#7dd3fc;padding:4px 8px;border-radius:6px}
</style></head><body><div class="card">
<span class="pill">Mock gateway</span>
<h1>${plan ? plan.label : order.planId}</h1>
<p>Order ${order.orderId} · this page replaces the YOUPI PG UPI checkout while PAYMENT_PROVIDER=mock.</p>
<div class="amt">₹${order.amount}</div>
<button onclick="pay()">Pay ₹${order.amount} (simulated UPI)</button>
<p id="st" style="text-align:center;margin-top:14px"></p>
<script>
async function pay(){
  document.getElementById('st').textContent='Contacting gateway…';
  const r = await fetch('/api/mock/pay/${order.orderId}',{method:'POST'});
  const j = await r.json();
  document.getElementById('st').textContent = j.error ? j.error : 'Payment captured. Returning to the app…';
  if(!j.error){ setTimeout(()=>{ location.href='/paid.html?orderId=${order.orderId}'; }, 800); }
}
</script>
</div></body></html>`;
  send(res, 200, html, { 'Content-Type': MIME['.html'] });
}

/* ------------------------------------------------------------------ */
/* router                                                             */
/* ------------------------------------------------------------------ */
const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = reqUrl;

  if (req.method === 'OPTIONS') return send(res, 204);

  try {
    if (pathname === '/api/health') {
      return ok(res, {
        ok: true,
        app: 'GymFlow backend',
        provider: config.provider,
        gateway: config.provider === 'youpi' ? 'YOUPI PG' : 'mock',
        gatewayConfigured: config.provider === 'youpi' ? youpi.configured : true,
        webhookReady: Boolean(config.youpi.merchantSecret),
        merchantUpiId: merchantUpi.upiId,
        adminConsole: Boolean(config.adminToken),
        youpiApiUrl: config.provider === 'youpi' ? config.youpi.apiUrl : null,
        grantOn: config.grantOn,
        time: new Date().toISOString()
      });
    }

    if (pathname === '/api/config') {
      return ok(res, {
        appName: 'GymFlow',
        currency: 'INR',
        plans,
        provider: config.provider,
        demoMode: config.provider === 'mock',
        gateway: config.provider === 'youpi' ? 'YOUPI PG' : 'mock'
      });
    }

    if (pathname === '/api/ads') return ok(res, { ads: adsConfig.ads || [] });

    if (pathname === '/api/checkout' && req.method === 'POST') return handleCheckout(req, res, reqUrl);
    if ((pathname === '/api/youpi/webhook' || pathname === '/api/webhook') && req.method === 'POST') {
      return handleYoupiWebhook(req, res);
    }
    if (pathname === '/api/entitlement' && req.method === 'GET') return handleEntitlement(res, reqUrl);
    if (pathname === '/api/redeem' && req.method === 'POST') return handleRedeem(req, res);

    if (pathname === '/api/upi/order' && req.method === 'POST') return handleUpiOrder(req, res);
    if (pathname === '/api/upi/utr' && req.method === 'POST') return handleUpiUtr(req, res);
    if (pathname === '/api/upi/status' && req.method === 'GET') return handleUpiStatus(res, reqUrl);
    if (pathname === '/api/admin/orders' && req.method === 'GET') return handleAdminOrders(req, res, reqUrl);
    const adminDecision = pathname.match(/^\/api\/admin\/orders\/([A-Za-z0-9-]+)\/(approve|reject)$/);
    if (adminDecision && req.method === 'POST') {
      return handleAdminDecision(req, res, reqUrl, adminDecision[1], adminDecision[2]);
    }
    if (pathname === '/admin') {
      return send(res, 200, adminPage(), { 'Content-Type': MIME['.html'] });
    }
    if (pathname === '/api/upi/config') {
      return ok(res, {
        upiId: merchantUpi.upiId,
        payeeName: merchantUpi.payeeName,
        merchantCode: merchantUpi.merchantCode,
        manualApproval: !config.provider || config.provider !== 'youpi' || !youpi.configured
      });
    }

    const mockMatch = pathname.match(/^\/api\/mock\/pay\/([A-Za-z0-9-]+)$/);
    if (mockMatch && req.method === 'POST') return handleMockPay(res, mockMatch[1]);

    const syncMatch = pathname.match(/^\/api\/sync\/([A-Za-z0-9_-]{4,64})$/);
    if (syncMatch) {
      const code = syncMatch[1].toLowerCase();
      if (req.method === 'PUT' || req.method === 'POST') {
        const body = await readJson(req);
        if (!body || !body.data) return fail(res, 400, 'data is required');
        syncs.put(code, { data: body.data, savedAt: Date.now() });
        return ok(res, { savedAt: Date.now() });
      }
      const found = syncs.get(code);
      if (!found) return fail(res, 404, 'Nothing backed up under that code');
      return ok(res, { data: found.data, savedAt: found.savedAt });
    }

    if (pathname === '/mock-checkout') return mockCheckoutPage(req, res, reqUrl);

    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(res, pathname);
    return fail(res, 404, 'Not found');
  } catch (err) {
    console.error('[error]', err);
    return fail(res, err.status || 500, err.message || 'Internal error');
  }
});

server.listen(config.port, '0.0.0.0', () => {
  console.log('──────────────────────────────────────────────');
  console.log(' GymFlow backend listening on 0.0.0.0:' + config.port);
  console.log(' Payment provider : ' + config.provider + (config.provider === 'youpi' ? ` (${config.youpi.apiUrl})` : ''));
  console.log(' Grant Pro on     : ' + config.grantOn);
  console.log(' Web app root     : ' + config.webRoot);
  console.log(' Webhook URL      : <public-base>/api/youpi/webhook');
  console.log(' Collecting to UPI: ' + merchantUpi.upiId);
  console.log(' Admin console    : /admin' + (config.adminToken ? ' (token configured)' : ' (set ADMIN_TOKEN to enable)'));
  console.log('──────────────────────────────────────────────');
});

export { server };
