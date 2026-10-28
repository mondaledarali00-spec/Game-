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

  const order = orders.findByPayment(event.paymentId) || orders.get(event.orderId);
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
      grantPro(order, { source: reconciled ? 'gateway-reconciled' : 'gateway-observed', status: 'paid', grant });
    } else if (config.grantOn === 'observed') {
      grantPro(order, { source: 'gateway-observed', status: 'observed_pending_reconciliation', grant });
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
  console.log('──────────────────────────────────────────────');
});

export { server };
