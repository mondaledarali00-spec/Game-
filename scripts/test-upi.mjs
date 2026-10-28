#!/usr/bin/env node
/* End-to-end test of direct-to-VPA UPI collection, both verification lanes.

   Usage:
     ADMIN_TOKEN=admin123 YOUPI_MERCHANT_SECRET=devsecret node scripts/test-upi.mjs [baseUrl]

   Lane 1 (automatic): the customer pays, enters the 12-digit UTR, and a signed
   bank-credit webhook from YouPI PG matches that UTR -> Pro unlocks with no human.
   Lane 2 (manual):    the customer pays, enters the UTR, the merchant approves in
   /admin -> Pro unlocks on the next poll.
*/
import crypto from 'node:crypto';

const base = (process.argv[2] || 'http://localhost:8787').replace(/\/+$/, '');
const adminToken = process.env.ADMIN_TOKEN || '';
const youpiSecret = process.env.YOUPI_MERCHANT_SECRET || '';

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

const post = (path, body, headers = {}) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

const get = (path) => fetch(base + path).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

function signWebhook(payload) {
  const raw = JSON.stringify(payload);
  return 'sha256=' + crypto.createHmac('sha256', youpiSecret).update(raw).digest('hex');
}

async function sendWebhook(payload) {
  const raw = JSON.stringify(payload);
  const res = await fetch(base + '/api/youpi/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gateway-Signature': signWebhook(payload) },
    body: raw
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const health = await get('/api/health');
console.log(`gateway: ${health.body.gateway} · collecting to UPI: ${health.body.merchantUpiId}`);
if (!youpiSecret) console.log('  (no YOUPI_MERCHANT_SECRET — the automatic lane will be skipped)');
if (!adminToken) console.log('  (no ADMIN_TOKEN — the manual lane will be skipped)');

/* ---------------- order creation ---------------- */
console.log('\n1. create a direct-UPI order');
const deviceA = 'dev_upi_auto_' + crypto.randomBytes(3).toString('hex');
const created = await post('/api/upi/order', { planId: 'pro_lifetime', deviceId: deviceA, user: 'Auto Test' });
check(created.status === 201 && !!created.body.ref, 'order created', created.body.ref);
check(created.body.upiId === health.body.merchantUpiId, 'order pays the merchant VPA', created.body.upiId);
check(/^upi:\/\/pay\?pa=/.test(created.body.upiUri || ''), 'UPI intent URI built');
check((created.body.upiUri || '').includes('am=149.00'), 'amount embedded in the URI');
check((created.body.upiUri || '').includes('tr=' + created.body.ref), 'unique reference embedded (tr=)');

const refA = created.body.ref;

/* ---------------- bad input ---------------- */
console.log('\n2. input validation');
const badUtr = await post('/api/upi/utr', { ref: refA, utr: '1234' });
check(badUtr.status === 400, 'short UTR rejected', badUtr.body.error);
const unknown = await post('/api/upi/utr', { ref: 'NOPE', utr: '412345678901' });
check(unknown.status === 404, 'unknown reference rejected');

/* ---------------- lane 1: automatic ---------------- */
if (youpiSecret) {
  console.log('\n3. automatic lane — customer submits UTR, bank credit webhook matches it');
  const utr = '4' + String(Date.now()).slice(-11);
  const sub = await post('/api/upi/utr', { ref: refA, utr });
  check(sub.body.status === 'awaiting_confirmation', 'UTR stored, awaiting confirmation');

  const hook = await sendWebhook({
    event: 'OBSERVED_SUCCESS',
    paymentId: 'direct-' + refA,
    orderId: '',            // no gateway-side order: we match by UTR
    amount: '149.00',
    amountPaise: 14900,
    currency: 'INR',
    method: 'UPI',
    utr,
    timestamp: Date.now(),
    metadata: { direct: true }
  });
  check(hook.status === 200, 'signed credit webhook accepted');

  const status = await get('/api/upi/status?ref=' + refA);
  check(status.body.pro === true, 'Pro granted automatically (no human involved)');
  check(status.body.status === 'paid', 'order marked paid', status.body.status);

  const ent = await get('/api/entitlement?deviceId=' + deviceA);
  check(ent.body.pro === true, 'entitlement visible to the app', ent.body.source || '');
}

/* ---------------- lane 2: manual approve ---------------- */
if (adminToken) {
  console.log('\n4. manual lane — approve from the /admin console');
  const deviceB = 'dev_upi_manual_' + crypto.randomBytes(3).toString('hex');
  const order = await post('/api/upi/order', { planId: 'pro_year', deviceId: deviceB });
  const refB = order.body.ref;
  const utrB = '5' + String(Date.now()).slice(-11);
  await post('/api/upi/utr', { ref: refB, utr: utrB });

  const noToken = await get('/api/admin/orders');
  check(noToken.status === 401, 'admin list requires the token');

  const list = await get('/api/admin/orders?token=' + encodeURIComponent(adminToken));
  check((list.body.orders || []).some((o) => o.ref === refB && o.utr === utrB), 'pending order + UTR visible to the merchant');

  const approve = await post('/api/admin/orders/' + refB + '/approve?token=' + encodeURIComponent(adminToken));
  check(approve.body.status === 'paid', 'merchant approved');

  const statusB = await get('/api/upi/status?ref=' + refB);
  check(statusB.body.pro === true, 'phone sees Pro on its next poll');
  check(statusB.body.plan === 'pro_year', 'correct plan granted', statusB.body.plan);

  const rejectable = await post('/api/upi/order', { planId: 'pro_lifetime', deviceId: deviceB + 'x' });
  const rej = await post(`/api/admin/orders/${rejectable.body.ref}/reject?token=${encodeURIComponent(adminToken)}`);
  check(rej.body.status === 'rejected', 'merchant can reject a bogus payment');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall direct-UPI checks passed');
process.exit(failures ? 1 : 0);
