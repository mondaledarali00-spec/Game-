# How money reaches you, and how the app knows it did

Your UPI ID: **`8089274532@axl`** (payee name shown to customers: **GymFlow**).
It is wired into three places so it is consistent everywhere:

| Place | Value |
|---|---|
| `webapp/js/config.js` → `merchant.upiId` | baked into the APK (the QR the phone draws) |
| `backend/.env` → `MERCHANT_UPI_ID` | used by the server when it builds orders |
| YouPI PG merchant admin | your VPA, if you also use their hosted checkout |

A UPI ID is public information — it is printed on every QR code — so shipping it
inside the APK is fine. Your UPI **PIN** never leaves your phone, and nobody can
debit you with just the VPA.

---

## 1. What the customer sees

**Pro** tab → tap a plan → the payment sheet opens:

- a **QR code** that encodes
  `upi://pay?pa=8089274532@axl&pn=GymFlow&am=149.00&cu=INR&tn=GymFlow Pro Lifetime GYMPROLIFMVS76...&tr=GYMPROLIFMVS76...&mc=7994`
- buttons that open **Google Pay / PhonePe / Paytm / any UPI app** pre-filled with
  the payee, the amount and the reference
- the **UPI ID** with a copy button
- a **UTR field** ("Already paid? Enter the reference")

`tr=` is a unique reference per order. it is what lets a payment be matched to a
phone/account without any guessing.

## 2. How it gets verified (the honest part)

UPI gives **no API** that lets an app ask "did this personal VPA receive ₹149?".
Anybody who tells you otherwise is doing it by reading your bank SMS/email. There
are exactly two ways to verify, and this project supports both:

### Lane A — automatic (recommended, no human)

```
customer pays your VPA
      ↓  bank SMS / alert on the phone holding the bank SIM
YouPI PG observer (Android APK or Gmail observer)
      ↓  HMAC-signed webhook: {event: OBSERVED_SUCCESS, utr: "412345678901", amountPaise: 14900}
your GymFlow backend  →  matchCredit(): UTR first, then exact amount
      ↓  grants Pro to that device
app polls /api/upi/status every 5 s  →  unlocks within seconds
```

Setup (see `SETUP_YOUPI.md`): run YouPI PG, create a merchant with your VPA, pair
the observer phone / Gmail account, set the webhook to
`https://<your-server>/api/youpi/webhook`, start this backend with
`YOUPI_MERCHANT_SECRET=...`. Then nobody ever taps "approve".

The match logic lives in `backend/lib/upi.mjs → matchCredit()`:
1. exact **UTR** match against a pending order,
2. else a **single** pending order with the exact amount → match,
3. else the pending order with that amount whose UTR was submitted and whose
   creation time is closest to the credit, so two simultaneous ₹149 rows do not
   cross-credit.

### Lane B — manual (works today, one tap)

If no observer is running yet, the customer's UTR lands in a small console:

```
https://<your-server>/admin?token=<ADMIN_TOKEN>
```

You see amount, plan, reference, device and UTR for every pending order, and tap
**Approve** (only after the credit shows in your bank app). The customer's phone
unlocks on its next 5-second poll. **Reject** marks a bogus claim.

> Without one of these two lanes, an app cannot honestly know the money arrived.
> The APK alone (no server) can show the QR and take the UTR, but it cannot verify
> it — the app tells the customer that explicitly instead of pretending.

## 3. Server setup in one screen

```ini
# backend/.env
MERCHANT_UPI_ID=8089274532@axl
MERCHANT_NAME=GymFlow
MERCHANT_MCC=7994
ADMIN_TOKEN=<long random string>          # enables /admin
YOUPI_MERCHANT_SECRET=<from YouPI admin>  # enables automatic verification
PUBLIC_BASE_URL=https://your-server
```

```bash
node backend/server.mjs
#  Collecting to UPI: 8089274532@axl
#  Admin console    : /admin (token configured)
```

Then in the app: **Pro → Pay ₹149** works offline as a QR; to have it verified
automatically, set the server URL in **More → Cloud & payments server** (or bake
it in with `GYMFLOW_API_BASE=... bash scripts/build-apk.sh`).

## 4. Test it end to end

```bash
ADMIN_TOKEN=admin123 YOUPI_MERCHANT_SECRET=devsecret node backend/server.mjs &
ADMIN_TOKEN=admin123 YOUPI_MERCHANT_SECRET=devsecret node scripts/test-upi.mjs
```

Covers: order creation, VPA + amount + reference inside the UPI URI, bad UTR
rejection, automatic grant from a signed bank-credit webhook, admin auth, manual
approve, plan correctness and rejection.

## 5. Pricing

| Where | File |
|---|---|
| In-app price display | `webapp/js/config.js` → `plans[].amount` |
| Server-side price (authoritative) | `backend/config/plans.json` |

Keep the two in sync — the server decides what is actually charged; the app only
shows it. Current: Pro Lifetime ₹149, Pro 1 Year ₹79.

## 6. The QR code itself

The APK has no internet at runtime, so a hosted QR image service is not an
option. `webapp/js/qr.js` is a self-contained QR encoder (byte mode, ECC level M,
versions 1–20, all 8 masks with the standard penalty scoring).

It is verified against the reference `qrcode` implementation, module for module:

```bash
node scripts/test-qr.mjs /tmp/qrcheck
python3 scripts/test-qr-verify.py /tmp/qrcheck
# 8/8 identical to the reference encoder
```

Regenerate the sample PNG in `docs/assets/upi-qr-149.png` with
`node scripts/test-qr.mjs` + the OpenCV decode snippet if you want a fresh one.

## 7. Things to be careful about

- **Price spoofing:** a customer can edit `am=` in their UPI app. Verification
  therefore matches the *amount you asked for* in your own database
  (`toPaise(order.amount)`), not whatever the UPI app sent.
- **Duplicate UTRs:** once an order is `paid` it is skipped by `matchCredit`, and
  one UTR cannot unlock a second device.
- **Refunds** are manual: send money back from your bank app, then revoke Pro with
  `entitlements.revoke(deviceId)` (or delete the record in
  `backend/data/gymflow.json`).
- **YouPI PG is experimental** by its own README: reconcile against your bank
  statement, keep volumes small, and check the legal/compliance side before
  charging the public at scale.
- A personal VPA receiving business payments can attract your bank's scrutiny.
  A current account with a merchant VPA is the safer long-term setup.
