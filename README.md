# GymFlow — offline-first gym app (APK) with a paid ad-free tier

GymFlow is a complete Android gym/training app that works **100% offline** and gets
better when online. The free tier shows unobtrusive house ads; **GymFlow Pro**
removes them and unlocks every training program. Pro is sold through a
self-hosted **YOUPI PG** UPI gateway ([youpi-pg/YouPI-PG](https://github.com/youpi-pg/YouPI-PG)).

| | |
|---|---|
| **APK** | [`release/GymFlow-1.1.0.apk`](release/GymFlow-1.1.0.apk) — signed (v1+v2+v3), 84 KB |
| **Payments** | money → `8089274532@axl` via a self-drawn UPI QR; verified automatically or with one tap ([docs/PAYMENTS.md](docs/PAYMENTS.md)) |
| **Package** | `com.gymflow.app` · minSdk 21 (Android 5.0+) · targetSdk 34 |
| **Web app** | `webapp/` — plain HTML/CSS/JS, no build step, bundled inside the APK |
| **Backend** | `backend/server.mjs` — Node 20+, zero dependencies, merchant bridge to YOUPI PG |
| **Native shell** | `android/` — manifest, icons, smali (`android/src-java` has the readable Java) |

---

## 1. What the app actually does

**Offline (no internet at all)**
- Local accounts: sign up / sign in, hashed password, stored on the device only
- 45-exercise library with coaching cues, 4 built-in programs (Full Body, PPL, Home, Cut & Condition)
- Live workout player: per-set weight/reps, ✓ to log, rest timer with vibration, auto-advance
- Streaks, weekly volume, bodyweight chart, estimated 1RM personal records
- Water tracker, calorie/protein/carb/fat targets (Mifflin–St Jeor)
- Works from airplane mode forever; the APK contains the whole UI and content

**Online (when you add your server URL)**
- UPI payments for Pro through YOUPI PG, verified by webhook, auto-unlocked in-app
- Pro licence keys (server-side or fully offline)
- Cloud backup / restore of your training log to your own server
- Remote ad inventory (falls back to the built-in ad cards when offline)

**Payments (v1.1.0)**
- Tapping a plan opens a **UPI payment sheet**: a QR code drawn on the device
  (no internet needed), deep links for GPay / PhonePe / Paytm, the merchant UPI ID
  with copy, and a 12-digit UTR field
- Money goes **straight to the merchant's own VPA** — no aggregator, 0% cut
- Verification: automatically from a YouPI PG bank-credit webhook (matched by UTR,
  then by exact amount), or one tap in `/admin` when no observer is running
- The phone polls every 5 s and unlocks Pro the moment the credit is confirmed

**The ad-free business model**
- Free tier: one "Sponsored" card on Home and Progress + a **Remove ads** button
- Pro: `Store.isPro()` gates every ad slot and the premium program, unlocks persist per account
- No third-party SDKs, no trackers, no Play-billing dependency — you keep 100% of the money
  (YOUPI PG is a direct-to-bank UPI gateway with 0% aggregator fees)

---

## 2. Run it right now (browser preview)

```bash
node backend/server.mjs          # http://localhost:8787
```

The backend serves `webapp/` *and* the API, so the preview is the exact same UI the
APK ships. Default provider is `mock`: the Pro purchase opens a fake UPI checkout
page so you can walk the whole payment → webhook → unlock flow with no money.

Open <http://localhost:8787>, sign up, start a workout, then go to **Pro → Pro Lifetime**
→ *Pay (simulated)* → come back → Pro unlocks and the ads disappear.

---

## 3. Connect the real payment gateway (YOUPI PG)

Full walkthrough: **[docs/SETUP_YOUPI.md](docs/SETUP_YOUPI.md)**. Short version:

```bash
# 1. run the gateway (their repo, Node 22+)
git clone https://github.com/youpi-pg/YouPI-PG.git && cd YouPI-PG
npm install && cp .env.example .env && npm run dev
#    -> merchant admin: http://localhost:6001  (create a merchant, copy its UUID + secret)

# 2. run the GymFlow bridge pointed at it
cd /path/to/this/repo
cp backend/.env.example backend/.env
#   PAYMENT_PROVIDER=youpi
#   YOUPI_API_URL=http://localhost:6100
#   YOUPI_MERCHANT_ID=<merchant uuid>
#   YOUPI_MERCHANT_SECRET=<merchant webhook secret>
#   PUBLIC_BASE_URL=https://your-public-url      (needed while testing on a phone)
node backend/server.mjs
```

Then set the merchant's webhook URL inside YOUPI's merchant admin to:

```
https://<your-public-url>/api/youpi/webhook
```

The app calls `POST /api/checkout` → the backend calls
`POST /api/v1/payments` on YOUPI with `X-Merchant-Id` / `X-Merchant-Key` →
YOUPI returns a `checkoutUrl` → the phone opens the UPI page → the bank alert is
observed by YOUPI → YOUPI sends a signed webhook → the backend flips that device to
Pro → the app polls `/api/entitlement` and unlocks.

Signature verification is the real thing: `sha256=HMAC_SHA256(rawBody, merchantSecret)`
with a constant-time compare, exactly as documented in their `openapi.yaml`.

> **Reconciliation note (their contract, not ours):** an observer match is
> `OBSERVED_SUCCESS`, not a bank settlement. Set `GRANT_ON=observed` (default) to
> unlock the instant a bank alert matches, or `GRANT_ON=reconciled` to wait until
> you import a bank statement CSV in the merchant admin.

---

## 4. Build the APK

```bash
bash scripts/setup-toolchain.sh          # downloads JDK-less fallback + apktool/apksigner jars
export JAVA_HOME=... APKTOOL_JAR=... APKSIGNER_JAR=...
bash scripts/build-apk.sh                # -> release/GymFlow-1.1.0.apk
```

Details, signing keys and versioning: **[docs/BUILD_APK.md](docs/BUILD_APK.md)**.
To bake your server URL into the build:

```bash
GYMFLOW_API_BASE=https://gym.example.com bash scripts/build-apk.sh
```

Otherwise the app starts fully offline and the URL can be pasted in
**More → Cloud & payments server** (saved per device, no rebuild needed).

### Install on the phone
1. Copy `release/GymFlow-1.1.0.apk` to the phone (Drive / USB / `adb install -r`).
2. Open it → Android asks to allow "install unknown apps" for that app → allow.
3. GymFlow appears in the launcher. No Google Play, no account, no permissions
   beyond internet + vibration.

---

## 5. Changing prices and keys

| What | Where |
|---|---|
| Prices shown in app | `webapp/js/config.js` → `plans[]` |
| Prices charged by server | `backend/config/plans.json` (keep both in sync) |
| Ads shown | `backend/config/ads.json` + `webapp/js/data.js` → `HOUSE_ADS` |
| Pro licence keys | `node scripts/gen-license.mjs --plan pro_lifetime --count 5` |
| Offline keys (no server) | `node scripts/gen-license.mjs --offline --days 365` |
| Free/paid gating | `Store.isPro()` in `webapp/js/store.js` |

⚠️ Offline keys are validated *inside the APK*, so the secret in
`webapp/js/pay.js` can be extracted from the APK. Use server keys
(`/api/redeem`) when you care about people minting free Pro. Server keys are
HMAC-signed with `LICENSE_SECRET`, which never leaves the backend.

---

## 6. Repository map

```
webapp/                 the app (offline-first SPA)
  index.html            shell
  css/styles.css
  js/config.js          plans, API base, feature flags
  js/data.js            exercise library, programs, fallback ads
  js/store.js           localStorage accounts, workouts, entitlement
  js/pay.js             YOUPI checkout, entitlement polling, licence keys
  js/api.js             backend client (all calls degrade to offline)
  js/ads.js             ad slots + Pro gating
  js/charts.js          canvas charts
  js/app.js             router + every screen
backend/
  server.mjs            HTTP server: payments, webhook, entitlement, sync, static
  lib/youpi.mjs         YOUPI PG client + HMAC webhook verification
  lib/store.mjs         JSON persistence (orders, entitlements, sync)
  lib/license.mjs       licence key sign/verify
  lib/upi.mjs           direct-to-VPA orders, UPI intent URIs, credit matching
  config/*.json         plans + ads
android/
  AndroidManifest.xml   package com.gymflow.app
  apktool.yml           build metadata (minSdk 21 / target 34)
  res/                  theme colours, strings, 5 launcher icon densities
  smali/                the compiled native shell (MainActivity, WebViewClient, JS bridge)
  src-java/             readable Java reference of the same three classes
scripts/
  build-apk.sh          icons → assets → apktool build → zipalign → apksigner
  sync-webapp.mjs       webapp/ → android/assets/www (optional API base baking)
  zipalign.py           dependency-free zipalign (4-byte + 4096 for .so)
  make-icons.py         generates every launcher density from one design
  gen-license.mjs       issue Pro keys
  test-webhook.mjs      end-to-end signed-webhook test
docs/
  SETUP_YOUPI.md        gateway setup, merchant webhook, going public
  BUILD_APK.md          toolchain, signing, releasing updates
release/
  GymFlow-1.1.0.apk     the signed APK
  keystore/             your release key — back it up, never commit the password
```

## 7. Tests

```bash
node backend/server.mjs &                             # start the bridge
ADMIN_TOKEN=admin123 YOUPI_MERCHANT_SECRET=devsecret \
  node scripts/test-upi.mjs                          # direct UPI, both lanes
YOUPI_MERCHANT_SECRET=devsecret node scripts/test-webhook.mjs   # YOUPI webhook contract
node scripts/test-qr.mjs /tmp/qrcheck && python3 scripts/test-qr-verify.py /tmp/qrcheck
python3 scripts/verify_apk.py release/GymFlow-1.1.0.apk
```

The UI was validated headlessly (signup → onboarding → workout → Pro unlock →
re-login persistence) before packaging.

## 8. Payments: where the money and the proof come from

See **[docs/PAYMENTS.md](docs/PAYMENTS.md)** for the full picture. Short version:

| Step | What happens |
|---|---|
| Customer taps a plan | app builds `upi://pay?pa=8089274532@axl&am=149.00&tr=<unique>` and draws it as a QR |
| Customer pays | any UPI app; money lands in your bank account |
| Verification | YouPI PG bank-alert webhook → `matchCredit()` (UTR, then amount) → Pro granted |
| No observer yet? | customer's UTR appears in `/admin?token=...`; you tap Approve |
| Customer's phone | polls `/api/upi/status` every 5 s, unlocks Pro, ads vanish |

## 9. If the app says "keeps stopping"

The 1.0.1 build is hardened against the two things that normally cause that:

1. **No exotic WebView plumbing.** The app now loads `file:///android_asset/www/index.html`
   directly — no virtual-origin interception, no `shouldInterceptRequest`, no
   `setDatabaseEnabled`.
2. **A native error screen instead of a crash.** `MainActivity.onCreate` is wrapped
   in a `Throwable` guard, so if the WebView cannot start the app shows the error
   text on a dark screen instead of dying.

Every build is also machine-checked before it ships:

```bash
python3 scripts/verify_apk.py release/GymFlow-1.1.0.apk
#  package / launcher activity / label / icon / dex classes / native shell methods
#  bundled assets / resources.arsc alignment / v2+v3 signature
```

Install checklist:
- The app is called **GymFlow** and its icon is a **lime dumbbell on a dark green
  rounded square**. A crash dialog naming some other app is not this APK.
- Uninstall any older GymFlow (1.0.0) first — or just install 1.0.1 over it, same key.
- If MIUI/HyperOS still kills it: Settings → Apps → GymFlow → Battery → **No restrictions**,
  and make sure **Android System WebView** is updated/enabled in the Play Store.

## 10. Honest limitations

- The UI layer is a WebView app, not native Compose/Flutter: fast and tiny (76 KB),
  but no native gestures/widgets. The native shell only hosts the web app.
- The backend stores orders in a JSON file — perfect for one merchant, not for
  thousands of concurrent buyers. Swap `backend/lib/store.mjs` for SQLite/Postgres.
- Pro is tied to a **device id** (plus the account inside the app). It does not roam
  across devices unless you add real accounts server-side.
- YOUPI PG is a research/experimental gateway per its own README — verify every
  payment against your bank records, and check the legal/compliance side before
  charging strangers.
