# Connecting GymFlow to YOUPI PG (self-hosted UPI gateway)

This is the exact wiring between this repo and
[youpi-pg/YouPI-PG](https://github.com/youpi-pg/YouPI-PG), based on their
`openapi.yaml`, `@youpi/merchant-sdk` and `docs/MERCHANT_INTEGRATION.md`.

```
GymFlow APK ──► GymFlow backend ──► YOUPI PG payment API ──► UPI page ──► your bank
     ▲                │                                            │
     │                └──◄── signed webhook (HMAC-SHA256) ◄────────┘
     └── polls /api/entitlement ◄── Pro granted for this device
```

---

## 0. Video / written walkthroughs

- YouTube (search): <https://www.youtube.com/results?search_query=YouPI+PG+UPI+payment+gateway+setup>
- Short intro — "Apna UPI Payment Gateway Banao FREE Me": <https://www.youtube.com/shorts/pveuYE5PHA0>
- "Build Your Own UPI Checkout? Meet YouPI-PG": <https://www.youtube.com/shorts/tXdpmQIr0tM>
- "Self-hosted UPI checkout setup": <https://www.youtube.com/shorts/XeGgK0XN6Cs>
- Written install guide: <https://academy.webotapp.com/how-to-install-youpi-pg-free-upi-payment-gateway>
- Official repo docs: <https://github.com/youpi-pg/YouPI-PG>

> The videos cover installing YouPI PG and creating a merchant. Everything after
> that — the UPI VPA, the webhook URL and the server URL you paste into GymFlow —
> is in sections 2–4 below.

## 1. Run YOUPI PG

```bash
git clone https://github.com/youpi-pg/YouPI-PG.git
cd YouPI-PG
npm install
cp .env.example .env
npm run dev          # or npm start
```

Services (their defaults):

| Service | URL |
|---|---|
| Payment REST API | `http://localhost:6100` |
| Customer checkout portal | `http://localhost:7000` |
| Merchant admin panel | `http://localhost:6001` |
| Control center | `http://localhost:8090` |

Requires Node **22.13+** (they use the built-in `node:sqlite`).

## 2. Create a merchant and copy three values

Open the merchant admin (`http://localhost:6001`):

1. Create / open the merchant that will collect the money.
2. Set the **receiving UPI VPA** (the bank account that gets the payment).
3. Copy:
   - **Merchant ID** (UUID) → `YOUPI_MERCHANT_ID`
   - **Webhook / API secret** → `YOUPI_MERCHANT_SECRET`
4. Set the **Webhook URL** to your GymFlow backend:

   ```
   https://<your-public-url>/api/youpi/webhook
   ```

   While developing locally you can point it at an ngrok/cloudflared tunnel of
   port 8787.

## 3. Configure the GymFlow bridge

```bash
cp backend/.env.example backend/.env
```

```ini
PORT=8787
PUBLIC_BASE_URL=https://<your-public-url>   # must be reachable by YOUPI's webhook sender
PAYMENT_PROVIDER=youpi

YOUPI_API_URL=http://localhost:6100
YOUPI_PORTAL_URL=http://localhost:7000
YOUPI_MERCHANT_ID=00000000-0000-0000-0000-000000000001
YOUPI_MERCHANT_SECRET=<the merchant's webhook secret>

# 'observed'  = unlock as soon as a bank alert is matched (instant, default)
# 'reconciled'= only unlock after you import a bank statement CSV in the admin
GRANT_ON=observed

LICENSE_SECRET=<long random string>
```

Start it:

```bash
node backend/server.mjs
curl -s localhost:8787/api/health
# {"ok":true,"provider":"youpi","gateway":"YOUPI PG","gatewayConfigured":true,...}
```

`gatewayConfigured:false` means the merchant id/secret are missing — the checkout
endpoint will answer `503` with a clear message instead of failing silently.

## 4. Point the app at it

Two options:

**A. Hard-code it in the APK** (recommended for a build you hand to users)

```bash
GYMFLOW_API_BASE=https://<your-public-url> bash scripts/build-apk.sh
```

**B. Type it on the phone** — `More → Cloud & payments server → Server URL → Test → Save`.
Stored per device, so one APK works for any deployment (and for offline-only use).

## 5. Buy Pro end to end

1. In the app: **Pro → Pro Lifetime → Pay ₹149**.
2. The app `POST`s `/api/checkout` with `{planId, deviceId}`.
3. Backend calls YOUPI `POST /api/v1/payments`:
   ```json
   { "orderId": "GYM-...", "amount": "149.00", "currency": "INR",
     "returnUrl": ".../paid.html?orderId=GYM-...",
     "description": "GymFlow Pro Lifetime",
     "metadata": { "deviceId": "dev_...", "planId": "pro_lifetime", "app": "GymFlow" } }
   ```
   with headers `X-Merchant-Id`, `X-Merchant-Key`, `Idempotency-Key`.
4. YOUPI returns `paymentId` + `checkoutUrl`; the phone opens that URL in the
   browser/UPI app.
5. The customer pays from GPay / PhonePe / Paytm / CRED.
6. YOUPI's observers match the bank alert and POST a webhook:
   ```
   X-Gateway-Signature: sha256=<hmac>
   X-Gateway-Timestamp: <ms>
   X-Gateway-Event: OBSERVED_SUCCESS
   { "event":"OBSERVED_SUCCESS", "orderId":"GYM-...", "paymentId":"...",
     "amount":"149.00", "amountPaise":14900, "utr":"123456789012",
     "method":"UPI", "timestamp":1699999999999, "metadata":{"deviceId":"dev_..."} }
   ```
   The backend verifies the HMAC (constant-time), then grants Pro to that
   `deviceId`. With `GRANT_ON=reconciled` it waits for the `RECONCILED` event.
7. Meanwhile the app polls `GET /api/entitlement?deviceId=...` every 5 s and
   flips to Pro as soon as it sees `{ "pro": true }`. If the customer kills the
   app mid-payment, **Pro → I already paid** re-checks later.

## 6. Verify the signature handling yourself

```bash
YOUPI_MERCHANT_SECRET=<secret> node scripts/test-webhook.mjs http://localhost:8787
```

It creates an order, sends a **bad** signature (must be rejected with 400), a
correctly signed `OBSERVED_SUCCESS` (must be accepted), re-sends it to prove
idempotency, and asserts the device ends up Pro.

## 7. Going public on a phone

The phone cannot reach `localhost` — that is the sandbox/your laptop, not the
phone. Expose the backend:

```bash
cloudflared tunnel --url http://localhost:8787     # or: ngrok http 8787
```

Put the resulting HTTPS URL in `PUBLIC_BASE_URL`, in the YOUPI merchant webhook
setting, and (optionally) bake it into the APK. UPI deep links and the return URL
then work from any device on mobile data.

## 8. Licence keys instead of (or besides) UPI

Useful for gifts, offline activation, or when the gateway is down.

```bash
# server-verified (recommended) — needs the same LICENSE_SECRET as the backend
node scripts/gen-license.mjs --plan pro_lifetime --count 5

# works with zero internet — signed with the secret baked into the APK
node scripts/gen-license.mjs --offline --plan pro_year --days 365
```

Redeem in the app: **Pro → Redeem key** (also in More). Online keys go through
`POST /api/redeem`; offline keys are validated on the device.

## 9. Where does my UPI ID go?

**Not in the APK.** Your UPI ID (VPA, e.g. `yourname@okhdfcbank`) is entered in
the **YouPI PG merchant admin** (`http://<gateway>:6001`) under the merchant's
receiving account / VPA. That is what the generated QR encodes.

The app only knows your GymFlow bridge URL (`/api/checkout`), which in turn knows
the YouPI merchant id + secret. This is deliberate: putting a VPA in an APK means
anyone who unpacks the app can read it, and it cannot be rotated without a new
build.

So the three values you need are:

| Value | Where it lives | Where it goes |
|---|---|---|
| UPI ID / VPA | YouPI merchant admin | (stays there) |
| Merchant UUID + webhook secret | YouPI merchant admin | `backend/.env` |
| GymFlow bridge URL | your server | app → **Pro → Connect your YouPI UPI gateway** |

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `503 YOUPI PG is not configured` | `YOUPI_MERCHANT_ID` / `YOUPI_MERCHANT_SECRET` empty |
| Webhook `400 signature mismatch` | Secret mismatch with the merchant, or a proxy rewrote the body |
| `400 timestamp missing or outside tolerance` | Your server/phone clock is skewed, or the proxy stripped headers |
| Payment tapped, nothing opens | No UPI app on the device; the app falls back to the browser |
| Pro stays locked after paying | Bank alert not seen by YOUPI yet — check their control center, then **I already paid** |
| Ads still show after unlock | Ads are cached per account: sign out/in or restart the app (`Store.isPro()` re-evaluates) |
