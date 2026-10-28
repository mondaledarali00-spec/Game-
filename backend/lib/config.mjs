import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_DIR = path.resolve(__dirname, '..');
export const REPO_DIR = path.resolve(BACKEND_DIR, '..');

/** Minimal .env loader (no dependencies). Existing env vars always win. */
export function loadEnv() {
  const candidates = [path.join(REPO_DIR, '.env'), path.join(BACKEND_DIR, '.env')];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

loadEnv();

const env = (key, fallback = '') => (process.env[key] === undefined || process.env[key] === '' ? fallback : process.env[key]);

export const config = {
  port: Number(env('PORT', '8787')),
  publicBaseUrl: env('PUBLIC_BASE_URL', ''),
  provider: env('PAYMENT_PROVIDER', 'mock').toLowerCase(), // 'youpi' | 'mock'
  youpi: {
    apiUrl: env('YOUPI_API_URL', 'http://localhost:6100'),
    portalUrl: env('YOUPI_PORTAL_URL', 'http://localhost:7000'),
    merchantId: env('YOUPI_MERCHANT_ID', ''),
    merchantSecret: env('YOUPI_MERCHANT_SECRET', ''), // X-Merchant-Key + webhook HMAC secret
    returnUrl: env('YOUPI_RETURN_URL', '')
  },
  licenseSecret: env('LICENSE_SECRET', 'change-me-gymflow-license-secret'),
  // Direct-to-VPA collection (customer pays the merchant's UPI ID itself).
  upi: {
    upiId: env('MERCHANT_UPI_ID', '8089274532@axl'),
    payeeName: env('MERCHANT_NAME', 'GymFlow'),
    merchantCode: env('MERCHANT_MCC', '7994')
  },
  // Token for the small /admin order console (approve manual UTRs).
  adminToken: env('ADMIN_TOKEN', ''),
  // How long a direct-UPI order stays open before it is marked expired.
  upiOrderTtlMs: Number(env('UPI_ORDER_TTL_MINUTES', '180')) * 60 * 1000,
  // "observed" unlocks as soon as the bank alert is matched by YOUPI's observers.
  // "reconciled" waits for the merchant to import a bank statement (strict).
  grantOn: env('GRANT_ON', 'observed').toLowerCase(),
  dataDir: path.resolve(env('DATA_DIR', path.join(BACKEND_DIR, 'data'))),
  webRoot: path.join(REPO_DIR, 'webapp')
};

export const plans = readJSON(path.join(BACKEND_DIR, 'config', 'plans.json'), { plans: [] }).plans || [];
export const planById = (id) => plans.find((p) => p.id === id) || null;
