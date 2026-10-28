import crypto from 'node:crypto';
import { config } from './config.mjs';

/* ---------------------------------------------------------------------------
 * YOUPI PG client — implements exactly the contract documented in
 * https://github.com/youpi-pg/YouPI-PG (openapi.yaml + @youpi/merchant-sdk):
 *
 *   POST /api/v1/payments          X-Merchant-Id, X-Merchant-Key, Idempotency-Key
 *   GET  /api/v1/payments/:id      X-Merchant-Key (for merchant-private fields)
 *   Webhook: HMAC-SHA256(rawBody, merchantSecret) -> "sha256=<hex>"
 *            headers: X-Gateway-Signature, X-Gateway-Timestamp, X-Gateway-Event
 * ------------------------------------------------------------------------- */

export class YoupiClient {
  constructor(opts = {}) {
    this.apiUrl = (opts.apiUrl || config.youpi.apiUrl || '').replace(/\/+$/, '');
    this.merchantId = opts.merchantId ?? config.youpi.merchantId;
    this.secret = opts.merchantSecret ?? config.youpi.merchantSecret;
  }

  get configured() {
    return Boolean(this.apiUrl && this.merchantId && this.secret);
  }

  headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (this.merchantId) h['X-Merchant-Id'] = this.merchantId;
    if (this.secret) h['X-Merchant-Key'] = this.secret;
    return h;
  }

  async createPayment({ orderId, amount, currency = 'INR', returnUrl, metadata, customer, description, idempotencyKey }) {
    const body = { orderId, amount, currency, returnUrl, metadata, customer, description };
    Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

    const res = await fetch(`${this.apiUrl}/api/v1/payments`, {
      method: 'POST',
      headers: this.headers(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      body: JSON.stringify(body)
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error(data.error || data.message || `YOUPI create payment failed (HTTP ${res.status})`);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  }

  async getPayment(paymentId) {
    const res = await fetch(`${this.apiUrl}/api/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: this.headers()
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const err = new Error(data.error || data.message || `YOUPI get payment failed (HTTP ${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /** Verify an incoming webhook. Returns the parsed event or throws. */
  verifyWebhook(rawBody, signatureHeader, timestampHeader) {
    if (!this.secret) throw new Error('YOUPI merchant secret is not configured');
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      throw new Error('Missing or malformed X-Gateway-Signature');
    }
    const provided = signatureHeader.slice('sha256='.length).trim().toLowerCase();
    const expected = crypto.createHmac('sha256', this.secret).update(rawBody).digest('hex');
    const expectedTs = timestampHeader
      ? crypto.createHmac('sha256', this.secret).update(`${timestampHeader}.${rawBody}`).digest('hex')
      : null;

    const a = Buffer.from(provided, 'utf8');
    const matches = (candidate) => {
      if (!candidate) return false;
      const b = Buffer.from(candidate, 'utf8');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    };
    if (!matches(expected) && !matches(expectedTs)) throw new Error('Webhook signature mismatch');

    const event = JSON.parse(rawBody);
    return event;
  }
}

/* Mock provider used for local demos, previews and CI.
   It writes the same order state the real gateway would, so the app flow is
   identical end to end — only the money is fake. */
export const mockProvider = {
  async createPayment({ orderId, amount }) {
    return {
      paymentId: 'mock_' + crypto.randomUUID(),
      orderId,
      amount,
      amountPaise: String(Math.round(Number(amount) * 100)),
      currency: 'INR',
      status: 'INITIATED',
      queuePosition: 0,
      checkoutUrl: `/mock-checkout?orderId=${encodeURIComponent(orderId)}`
    };
  }
};
