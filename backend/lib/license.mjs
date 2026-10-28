import crypto from 'node:crypto';

/* Pro licence keys. Same textual shape the app understands:
        GF-<BASE32 payload>-<SIGNATURE>
   payload = {"p": plan, "e": expiry ms|null, "n": nonce}

   Two flavours:
   - SERVER keys  : HMAC-SHA256 with LICENSE_SECRET, verified by /api/redeem.
   - OFFLINE keys : SHA-256 with the key baked into the APK (scripts/gen-license.mjs
                    --offline). Convenient, but forgeable by anyone who unpacks the
                    APK — use server keys when you care.
*/
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function b32encode(str) {
  const bytes = Buffer.from(str, 'utf8');
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function b32decode(str) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

const sign = (payload, secret) =>
  crypto.createHmac('sha256', secret).update('GF1|' + payload).digest('hex').slice(0, 24).toUpperCase();

export function makeLicense({ plan = 'lifetime', days = null, nonce, secret }) {
  const expiry = days ? Date.now() + days * 86400000 : null;
  const payload = b32encode(JSON.stringify({ p: plan, e: expiry, n: nonce || crypto.randomBytes(4).toString('hex') }));
  return `GF-${payload}-${sign(payload, secret)}`;
}

export function verifyLicense(code, secret) {
  const raw = String(code || '').trim().toUpperCase();
  const parts = raw.split('-');
  if (parts.length < 3 || parts[0] !== 'GF') return { ok: false, error: 'Malformed key' };
  const sig = parts.pop();
  const payload = parts.slice(1).join('-');
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: 'Invalid key' };
  let info;
  try { info = JSON.parse(b32decode(payload)); } catch { return { ok: false, error: 'Corrupt key' }; }
  if (info.e && Date.now() > info.e) return { ok: false, error: 'Key expired' };
  return { ok: true, info };
}
