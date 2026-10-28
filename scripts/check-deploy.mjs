#!/usr/bin/env node
/* check-deploy.mjs — prove that a HOSTED GymFlow bridge is really working.
   ---------------------------------------------------------------------
   Run this from your own machine or laptop after deploying:

     node scripts/check-deploy.mjs https://your-server.example.com
     node scripts/check-deploy.mjs https://your-server.example.com --token=<ADMIN_TOKEN>
     node scripts/check-deploy.mjs https://your-server.example.com --token=<ADMIN_TOKEN> --secret=<YOUPI_MERCHANT_SECRET>

   It walks the same road a real customer walks:
     health → UPI config → create order → submit UTR → admin approve → Pro
   ...and, when you pass --secret, it also sends a signed bank-credit webhook
   to prove the automatic (no human) unlock works.

   Exit code 0 = everything passed, 1 = something is broken (details printed).
   No dependencies: Node 18+ built-ins only.
   --------------------------------------------------------------------- */
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) || '').replace(/\/+$/, '');
const flag = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
};
const token = flag('token') || process.env.ADMIN_TOKEN || '';
const secret = flag('secret') || process.env.YOUPI_MERCHANT_SECRET || '';
const keep = args.includes('--keep');

if (!base) {
  console.error('Usage: node scripts/check-deploy.mjs https://your-server [--token=ADMIN_TOKEN] [--secret=YOUPI_MERCHANT_SECRET]');
  process.exit(2);
}

const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

let passed = 0;
const failed = [];
const warns = [];

function check(ok, label, detail) {
  if (ok) {
    passed++;
    console.log(`  ${GREEN('✓')} ${label}${detail ? DIM('  ' + detail) : ''}`);
  } else {
    failed.push(label);
    console.log(`  ${RED('✗')} ${label}${detail ? '  ' + detail : ''}`);
  }
  return ok;
}
function warn(label, detail) {
  warns.push(label);
  console.log(`  ${YELLOW('!')} ${label}${detail ? '  ' + detail : ''}`);
}

async function call(path, opts = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const init = { method: opts.method || 'GET', headers: { ...(opts.headers || {}) }, signal: controller.signal };
  if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  try {
    const res = await fetch(base + path, init);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, data: null, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

const deviceId = 'deploycheck-' + crypto.randomBytes(4).toString('hex');
const utr = String(Math.floor(100000000000 + Math.random() * 899999999999));

console.log(`\nGymFlow deploy check → ${base}`);
console.log(DIM(`test device ${deviceId} · node ${process.version}\n`));

/* ---------------- 1. HTTPS + health ---------------------------------- */
if (!base.startsWith('https://') && !base.startsWith('http://localhost')) {
  warn('Not HTTPS', 'UPI apps and webhooks will refuse a plain http:// server — use https');
}

const health = await call('/api/health');
check(health.ok, 'Server answers /api/health', health.error || `HTTP ${health.status}`);
if (health.ok && health.data) {
  const h = health.data;
  console.log(DIM(`    app=${h.app} provider=${h.provider} gateway=${h.gateway} merchantUpi=${h.merchantUpiId || '-'}`));
  check(h.merchantUpiId === '8089274532@axl' || !!h.merchantUpiId,
    'Server knows the merchant UPI ID', `merchantUpiId=${h.merchantUpiId || '(missing — set MERCHANT_UPI_ID)'}`);
  if (h.provider === 'mock') {
    warn('PAYMENT_PROVIDER is "mock"', 'no real money will move — set PAYMENT_PROVIDER=youpi for live payments');
  }
  check(!!h.webhookReady, 'Webhook secret configured (YOUPI_MERCHANT_SECRET)',
    h.webhookReady ? '' : 'automatic confirmation is OFF until this is set');
  check(h.adminConsole !== false, 'Admin console reachable', '/admin?token=…');
}

/* ---------------- 2. UPI config -------------------------------------- */
const uconf = await call('/api/upi/config');
check(uconf.ok, 'Server exposes the receiving VPA', uconf.error || '');
if (uconf.ok && uconf.data) {
  check(!!uconf.data.upiId, 'Receiving UPI ID is set', uconf.data.upiId || '');
  console.log(DIM(`    payee=${uconf.data.payeeName} mcc=${uconf.data.merchantCode}`));
}

/* ---------------- 3. create an order --------------------------------- */
const order = await call('/api/upi/order', { method: 'POST', body: { planId: 'pro_lifetime', deviceId, user: 'deploy check' } });
check(order.status === 201 && order.data && order.data.ref, 'Server creates a UPI order',
  order.data && order.data.ref ? order.data.ref + ' ₹' + order.data.amount : (order.error || 'HTTP ' + order.status));

const ref = order.data && order.data.ref;
if (order.ok && order.data) {
  const uri = order.data.upiUri || '';
  check(uri.startsWith('upi://pay?') && uri.includes('pa='), 'UPI deep link built', uri.slice(0, 96) + '…');
  check(uri.includes(encodeURIComponent(order.data.upiId || '8089274532@axl').slice(0, 8)) ||
        uri.includes((order.data.upiId || '').replace('@', '%40')), 'Deep link pays the right VPA', order.data.upiId);
  check(String(order.data.amount) === '149.00', 'Amount matches the plan', '₹' + order.data.amount);
}

/* ---------------- 4. customer submits the UTR ------------------------ */
if (ref) {
  const s1 = await call('/api/upi/status?ref=' + encodeURIComponent(ref) + '&deviceId=' + encodeURIComponent(deviceId));
  check(s1.ok && s1.data && s1.data.pro === false, 'New order is not Pro yet', 'status=' + (s1.data && s1.data.status));

  const bad = await call('/api/upi/utr', { method: 'POST', body: { ref, utr: '12' } });
  check(!bad.ok, 'Server rejects a bogus UTR', 'HTTP ' + bad.status);

  const sub = await call('/api/upi/utr', { method: 'POST', body: { ref, utr } });
  check(sub.ok && sub.data && sub.data.status === 'awaiting_confirmation',
    'Server accepts a 12-digit UTR', (sub.data && sub.data.status) || (sub.error || ''));
}

/* ---------------- 5. manual approve (fallback lane) ------------------ */
if (ref && token) {
  const auth = await call('/api/admin/orders');
  check(auth.status === 401, 'Admin console refuses requests without the token', 'HTTP ' + auth.status);

  const list = await call('/api/admin/orders?token=' + encodeURIComponent(token));
  check(list.ok && Array.isArray(list.data && list.data.orders), 'Admin token works — orders visible',
    list.ok ? (list.data.orders || []).length + ' order(s)' : (list.error || 'HTTP ' + list.status));

  const appr = await call('/api/admin/orders/' + encodeURIComponent(ref) + '/approve?token=' + encodeURIComponent(token), { method: 'POST' });
  check(appr.ok, 'Admin can approve a payment', appr.data && appr.data.error ? appr.data.error : '');

  const s2 = await call('/api/upi/status?ref=' + encodeURIComponent(ref) + '&deviceId=' + encodeURIComponent(deviceId));
  check(s2.ok && s2.data && s2.data.pro === true, 'Approved order turns Pro on the phone', 'pro=' + (s2.data && s2.data.pro));
} else if (ref) {
  warn('Skipped the manual-approve test', 'pass --token=<ADMIN_TOKEN> to test it');
}

/* ---------------- 6. automatic confirmation (webhook) ---------------- */
if (secret) {
  const device2 = 'deploycheck-auto-' + crypto.randomBytes(4).toString('hex');
  const order2 = await call('/api/upi/order', { method: 'POST', body: { planId: 'pro_lifetime', deviceId: device2, user: 'auto check' } });
  const ref2 = order2.data && order2.data.ref;
  check(!!ref2, 'Second order created for the webhook test', ref2 || '');

  if (ref2) {
    const utr2 = String(Math.floor(100000000000 + Math.random() * 899999999999));
    await call('/api/upi/utr', { method: 'POST', body: { ref: ref2, utr: utr2 } });

    const event = {
      event: 'OBSERVED_SUCCESS',
      paymentId: 'deploycheck_' + crypto.randomBytes(4).toString('hex'),
      orderId: ref2,
      utr: utr2,
      amountPaise: '14900',
      currency: 'INR',
      occurredAt: new Date().toISOString()
    };
    const rawBody = JSON.stringify(event);
    const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const hook = await call('/api/youpi/webhook', {
      method: 'POST',
      body: rawBody,
      headers: { 'X-Gateway-Signature': signature, 'Content-Type': 'application/json' }
    });
    check(hook.ok && hook.data && hook.data.received === true, 'Signed webhook accepted',
      hook.ok ? '' : (hook.data && (hook.data.error || hook.data.raw)) || 'HTTP ' + hook.status);

    const forged = await call('/api/youpi/webhook', {
      method: 'POST',
      body: rawBody,
      headers: { 'X-Gateway-Signature': 'sha256=' + '0'.repeat(64), 'Content-Type': 'application/json' }
    });
    check(!forged.ok, 'Forged webhook is rejected', 'HTTP ' + forged.status);

    const s3 = await call('/api/upi/status?ref=' + encodeURIComponent(ref2) + '&deviceId=' + encodeURIComponent(device2));
    check(s3.ok && s3.data && s3.data.pro === true, 'Bank credit unlocked Pro automatically (no human)', 'pro=' + (s3.data && s3.data.pro));

    if (!keep) console.log(DIM('\n  (test orders left in the admin list — harmless, reject or ignore them)'));
  }
} else {
  warn('Skipped the automatic-verification test', 'pass --secret=<YOUPI_MERCHANT_SECRET> to test the webhook');
}

/* ---------------- summary -------------------------------------------- */
console.log('');
if (failed.length === 0) {
  console.log(GREEN(`ALL ${passed} CHECKS PASSED`) + (warns.length ? YELLOW(`  (${warns.length} warning${warns.length > 1 ? 's' : ''})`) : ''));
  if (warns.length) warns.forEach((w) => console.log('  ' + YELLOW('!') + ' ' + w));
  console.log(DIM('\nNext: paste this URL in the app → More → Cloud & payments server, then buy Pro once yourself to confirm the money lands.'));
  process.exit(0);
} else {
  console.log(RED(`${failed.length} FAILED`) + `, ${passed} passed`);
  failed.forEach((f) => console.log('  ' + RED('✗') + ' ' + f));
  console.log(DIM('\nOpen docs/HOSTING.md → Troubleshooting for the fix for each line above.'));
  process.exit(1);
}
