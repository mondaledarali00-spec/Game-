import crypto from 'node:crypto';
import { config, planById } from './config.mjs';

/* ---------------------------------------------------------------------------
 * Direct-VPA UPI collection.
 *
 * The app shows a QR / deep link that pays the merchant's own UPI ID straight
 * into their bank account. No aggregator sits in the middle.
 *
 * Verification has two lanes:
 *
 *   1. AUTOMATIC (recommended): you run YouPI PG with an observer (their Android
 *      app on the bank-SIM phone, or the Gmail observer). The bank alert reaches
 *      YouPI, YouPI calls our webhook with the 12-digit UTR + amount, and we match
 *      it to the order here — by UTR first, then by reference, then by amount.
 *      Nothing is tapped by hand.
 *
 *   2. MANUAL FALLBACK: if you have no observer running yet, the customer's UTR
 *      lands in this book and you approve it from /admin with one tap. The phone
 *      unlocks Pro within 5 seconds of the tap.
 *
 * UPI deliberately provides no "did I receive money" API for a personal VPA, so
 * lane 2 exists for honesty: an app alone cannot confirm a bank credit.
 * ------------------------------------------------------------------------- */

export const merchantUpi = {
  get upiId() { return config.upi.upiId; },
  get payeeName() { return config.upi.payeeName; },
  get merchantCode() { return config.upi.merchantCode; }
};

export function buildUpiUri({ amount, note, ref }) {
  const params = [
    'pa=' + encodeURIComponent(merchantUpi.upiId),
    'pn=' + encodeURIComponent(merchantUpi.payeeName),
    'am=' + encodeURIComponent(Number(amount).toFixed(2)),
    'cu=INR',
    'tn=' + encodeURIComponent(note || 'GymFlow Pro'),
    'tr=' + encodeURIComponent(ref)
  ];
  if (merchantUpi.merchantCode) params.push('mc=' + encodeURIComponent(merchantUpi.merchantCode));
  return 'upi://pay?' + params.join('&');
}

export function newRef(planId) {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  const plan = (planId || 'pro').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase();
  return `GYM${plan}${stamp}${rand}`;
}

export function normaliseUtr(input) {
  const digits = String(input || '').replace(/\D/g, '');
  return digits.length === 12 ? digits : null;
}

/** Rupees string -> paise integer */
export function toPaise(amount) {
  return Math.round(Number(amount) * 100);
}

export function planAmount(planId) {
  const plan = planById(planId);
  return plan ? plan.amount : null;
}

/**
 * Try to match an incoming bank credit to a pending direct-UPI order.
 * Returns the matched order id or null.
 */
export function matchCredit(orders, { utr, amountPaise, at }) {
  const pending = orders.filter((o) => o.flow === 'direct-upi' && o.status !== 'paid' && o.status !== 'rejected');
  if (!pending.length) return null;

  if (utr) {
    const byUtr = pending.find((o) => o.utr && o.utr === utr);
    if (byUtr) return byUtr;
  }
  if (amountPaise) {
    const exact = pending.filter((o) => toPaise(o.amount) === Number(amountPaise));
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) {
      // pick the one whose UTR was submitted, else the one closest to the credit
      const withUtr = exact.find((o) => o.utr);
      if (withUtr) return withUtr;
      const when = at || Date.now();
      exact.sort((a, b) => Math.abs((a.createdAt || 0) - when) - Math.abs((b.createdAt || 0) - when));
      return exact[0];
    }
  }
  return null;
}
