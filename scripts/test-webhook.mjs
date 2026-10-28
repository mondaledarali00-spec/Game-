/* End-to-end check of the YOUPI PG webhook contract against a running backend.
   Usage: node scripts/test-webhook.mjs [baseUrl] */
import crypto from 'node:crypto';

const base = (process.argv[2] || 'http://localhost:8787').replace(/\/+$/, '');
const secret = process.env.YOUPI_MERCHANT_SECRET || 'testsecret123';
const deviceId = 'dev_whtest_' + crypto.randomBytes(3).toString('hex');

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json() }));

const health = await fetch(base + '/api/health').then((r) => r.json());
if (!health.webhookReady) {
  console.log('NOTE: this server has no YOUPI merchant secret configured, so webhooks');
  console.log('      cannot be verified. Start it with YOUPI_MERCHANT_SECRET=testsecret123');
  console.log('      (and the same value in this script\'s env) to run the full check.\n');
}

const checkout = await post('/api/checkout', { planId: 'pro_lifetime', deviceId, user: 'Webhook Test' });
console.log('checkout:', checkout.status, checkout.body.orderId);
const { orderId, paymentId } = checkout.body;

const event = {
  event: 'OBSERVED_SUCCESS',
  paymentId,
  orderId,
  amount: '149.00',
  amountPaise: 14900,
  currency: 'INR',
  method: 'UPI',
  utr: '123456789012',
  timestamp: Date.now(),
  metadata: { deviceId }
};
const raw = JSON.stringify(event);
const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');

const bad = await fetch(base + '/api/youpi/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Gateway-Signature': 'sha256=' + '0'.repeat(64) },
  body: raw
});
console.log('bad signature rejected:', bad.status === 400 ? 'YES' : 'NO (' + bad.status + ')');

const good = await post('/api/youpi/webhook', event, { 'X-Gateway-Signature': sig });
console.log('signed webhook accepted:', good.status, JSON.stringify(good.body));

const ent = await fetch(`${base}/api/entitlement?deviceId=${encodeURIComponent(deviceId)}`).then((r) => r.json());
console.log('entitlement:', JSON.stringify(ent));

const passthrough = await post('/api/youpi/webhook', event, { 'X-Gateway-Signature': sig });
console.log('idempotent replay ok:', passthrough.status === 200 ? 'YES' : 'NO');

process.exit(ent.pro ? 0 : 1);
