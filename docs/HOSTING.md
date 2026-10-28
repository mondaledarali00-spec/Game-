# Host GymFlow and make your UPI ID collect money

**This is the complete setup.** Follow it top to bottom once; afterwards you only
look at one page (`/admin`) when something needs your attention.

- Your receiving UPI ID: **`8089274532@axl`** (already baked into the APK)
- Prices: **₹149 lifetime**, **₹79 / year**
- What you end up with: a phone app that shows a UPI QR, takes the customer's
  12-digit UTR, and unlocks Pro **by itself** once the bank credit is seen.

```
customer's phone            your server (this repo)          your bank
┌───────────────┐   QR    ┌──────────────────────┐          ┌────────────┐
│ GymFlow APK   │────────►│ GymFlow bridge :8787 │          │ 8089274532 │
│ QR + UTR box  │  UTR    │ orders · matching    │          │   @axl     │
└───────┬───────┘         └──────▲───────────────┘          └─────▲──────┘
        │                        │ signed webhook                 │
        │  polls /api/upi/status │                                │
        └────────────────────────┤  YouPI PG + observer ──────────┘
                                 │  (reads the bank SMS / email)
```

**Why a server is needed at all:** no UPI app can ask your bank "did ₹149
arrive?". Only something that *sees the bank alert* can. That is the observer in
YouPI PG, and it needs a server to talk to. Without it you approve payments by
hand on `/admin` — which also works, and is a perfectly fine way to start.

---

## 0. Choose your path (2 minutes)

| Path | Time | Cost | Good for |
|---|---|---|---|
| **A. VPS** (Ubuntu, recommended) | ~45 min | ₹350–500 / month | Real business, everything on one box, always on |
| **B. Render** (free tier) | ~20 min | ₹0 | Trying it out; free instance sleeps and loses saved orders |
| **C. Your PC + Cloudflare Tunnel** | ~15 min | ₹0 | Testing only (PC must stay on, URL changes on restart) |

And two independent decisions inside every path:

1. **Do you run YouPI PG?** Yes → payments confirm themselves. No → you tap
   *Approve* on `/admin`. Both are supported; the app behaves correctly in both.
2. **Domain name?** Not required, but `https://` **is** required (UPI apps and
   webhooks reject plain `http://`). Render and Cloudflare give you free HTTPS.
   On a VPS you need a domain (~₹800/year) for free HTTPS via Caddy.

> **Fastest route to real money today:** Path A or B, skip YouPI at first, use
> `/admin` to approve. Add YouPI + observer later — nothing in the app changes.

---

## 1. What you need before starting

- [ ] This repo on your GitHub (already done: `mondaledarali00-spec/Game-`)
- [ ] A server (VPS / Render account) — section 2
- [ ] Your UPI ID and its **bank app** on your phone (to see credits arrive)
- [ ] An Android phone that **receives the bank SMS** — this will run the YouPI
      observer app. It can be your main phone; a cheap spare is calmer.
- [ ] Node **22** on the server (YouPI PG uses Node's built-in SQLite)

---

## 2. Put the bridge on a server

### Path A — VPS (recommended)

Buy any Ubuntu 22.04/24.04 VPS (Hetzner ~€4, DigitalOcean $6, Contabo, or an
Indian provider like E2E/Linode Mumbai for lower latency). You get an IP and a
root password.

```bash
# 1. log in
ssh root@YOUR_SERVER_IP

# 2. Node 22 + git + Caddy (Caddy gives free HTTPS)
apt update && apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v            # must print v22.x

# 3. get the code
mkdir -p /opt && cd /opt
git clone https://github.com/mondaledarali00-spec/Game-.git gymflow
cd gymflow

# 4. configure
cp backend/.env.example backend/.env
nano backend/.env      # edit the values from the table in section 3

# 5. run it forever
npm install -g pm2
pm2 start backend/server.mjs --name gymflow --update-env
pm2 save
pm2 startup            # run the one command it prints
pm2 logs gymflow       # Ctrl+C to leave the log view
```

The bridge is now on `http://127.0.0.1:8787` (not public yet — good).

**Point a domain at it.** In your domain's DNS add an `A` record:
`gym` → `YOUR_SERVER_IP`. Then:

```bash
apt install -y caddy
nano /etc/caddy/Caddyfile
```

```
gym.yourdomain.com {
    reverse_proxy 127.0.0.1:8787
}
```

```bash
systemctl reload caddy
curl https://gym.yourdomain.com/api/health      # {"ok":true,...}
```

Finally close every port you do not need:

```bash
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable
```

`8787`, `6100`, `7000`, `6001` stay unreachable from the internet. Only 443 is.

### Path B — Render (free, no server admin)

1. <https://render.com> → **New → Web Service** → connect your GitHub repo.
2. Runtime **Docker** (a `Dockerfile` is included) — or Node, start command
   `node backend/server.mjs`.
3. Instance type **Free**.
4. **Environment** → add the variables from section 3 (at minimum
   `MERCHANT_UPI_ID`, `ADMIN_TOKEN`, `PUBLIC_BASE_URL`).
5. Deploy, wait for the green "Live", open `https://<name>.onrender.com/api/health`.

Two free-tier facts: it **sleeps after ~15 min** of no traffic (first hit takes
30 s — the app copes, it just waits), and the disk is **ephemeral**, so pending
orders disappear on redeploy. Fine for testing, not for a busy shop.

### Path C — Your own PC + Cloudflare Tunnel (test only)

```bash
cd /path/to/Game-
cp backend/.env.example backend/.env      # then edit it
node backend/server.mjs                    # terminal 1
```

```bash
# terminal 2 — install once: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cloudflared tunnel --url http://localhost:8787
```

It prints an `https://random-words.trycloudflare.com` URL. That URL **changes
every restart**, so re-paste it in the app and in YouPI's webhook setting each
time. Use a *named* tunnel if you want it permanent.

---

## 3. `backend/.env` — every line explained

Generate the two secrets first:

```bash
node -e "console.log('ADMIN_TOKEN='+require('crypto').randomBytes(24).toString('hex'))"
node -e "console.log('LICENSE_SECRET='+require('crypto').randomBytes(24).toString('hex'))"
```

| Key | Value to use | Why |
|---|---|---|
| `PORT` | `8787` | Bridge port |
| `PUBLIC_BASE_URL` | `https://gym.yourdomain.com` | Used in links/return URLs |
| `PAYMENT_PROVIDER` | `youpi` (or `mock` for testing) | `mock` = no real money |
| `MERCHANT_UPI_ID` | **`8089274532@axl`** | ⚠️ the money destination |
| `MERCHANT_NAME` | `GymFlow` | Name shown in the customer's UPI app |
| `MERCHANT_MCC` | `7994` | Fitness/gym category |
| `UPI_ORDER_TTL_MINUTES` | `180` | How long an order waits for payment |
| `ADMIN_TOKEN` | the random hex above | Password for `/admin` — **keep secret** |
| `YOUPI_API_URL` | `http://127.0.0.1:6100` | YouPI payment API |
| `YOUPI_PORTAL_URL` | `http://127.0.0.1:7000` | YouPI hosted checkout (optional lane) |
| `YOUPI_MERCHANT_ID` | from YouPI admin | Identifies you to YouPI |
| `YOUPI_MERCHANT_SECRET` | from YouPI admin | Verifies the webhook signature |
| `GRANT_ON` | `observed` | Unlock the moment the bank alert is seen |
| `LICENSE_SECRET` | the random hex above | Signs offline licence keys |
| `DATA_DIR` | `/data` (Docker) or `./backend/data` | Where orders are stored |

Restart after any change: `pm2 restart gymflow` (VPS) or *Manual Deploy* (Render).

Quick sanity check, no money involved:

```bash
curl https://gym.yourdomain.com/api/upi/config
# {"upiId":"8089274532@axl","payeeName":"GymFlow","merchantCode":"7994","manualApproval":true}
```

**You are already sellable at this point.** The app shows the QR, takes the UTR,
and you approve on `/admin`. Sections 4–6 add automation.

---

## 4. YouPI PG — the pieces that read your bank alerts

Repo: <https://github.com/youpi-pg/YouPI-PG> · install walkthrough:
<https://academy.webotapp.com/how-to-install-youpi-pg-free-upi-payment-gateway> ·
videos: [Hindi intro](https://www.youtube.com/shorts/pveuYE5PHA0) ·
[setup](https://www.youtube.com/shorts/XeGgK0XN6Cs) ·
[checkout](https://www.youtube.com/shorts/tXdpmQIr0tM)

```bash
cd /opt
git clone https://github.com/youpi-pg/YouPI-PG.git
cd YouPI-PG
npm install
cp .env.example .env
```

Set these in its `.env` (upstream sample values):

```ini
PAYMENT_API_PORT=6100
CHECKOUT_PORTAL_PORT=7000
MERCHANT_ADMIN_PORT=6001
SMS_OBSERVER_PORT=6002
GMAIL_OBSERVER_PORT=6003
USE_SQLITE_FALLBACK=true
ENCRYPTION_MASTER_KEY=<32-byte hex>   # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
npm start            # keep it alive too: pm2 start npm --name youpi -- start
```

Then open the merchant admin **through an SSH tunnel** (it must not face the
internet — it can move money):

```bash
# on your laptop:
ssh -L 6001:127.0.0.1:6001 root@YOUR_SERVER_IP
# then browse http://localhost:6001
```

In the merchant admin:

1. Create merchant → set the **receiving VPA** to `8089274532@axl`.
2. Copy **Merchant ID** and **Merchant/Webhook secret** into the bridge `.env`
   (`YOUPI_MERCHANT_ID`, `YOUPI_MERCHANT_SECRET`), set `PAYMENT_PROVIDER=youpi`,
   then `pm2 restart gymflow`.
3. Set the **Webhook URL**:
   `https://gym.yourdomain.com/api/youpi/webhook`
4. Leave *test mode* off when you go live.

---

## 5. Making confirmation automatic (the observer)

The observer is what turns "money arrived" into "Pro unlocked, no human".

1. Install the YouPI observer APK on the phone that **receives your bank SMS**
   (or use the Gmail observer if your bank emails you, or the Google Messages
   one). Build/APK instructions live in
   <https://github.com/youpi-pg/YouPI-PG/blob/main/docs/ANDROID_MOBILE_APP.md>.
2. On that phone: **Settings → Apps → YouPI Observer → Notifications → allow
   notification access**, and **Battery → Unrestricted** (MIUI/Redmi: also
   *Autostart on* and *lock the app in Recents* — otherwise Android kills it and
   you silently lose auto-verification).
3. In the merchant admin → **Observers & Pairing** → **+ Pair Android Device** →
   copy the enrollment token into the observer app.
4. Send yourself **₹1** from another UPI app to `8089274532@axl`. It should show
   up in the merchant admin as an observed credit within ~10 seconds.
5. Watch the bridge log while you do it:
   `pm2 logs gymflow` → you should see
   `[webhook] matched direct-UPI order … by UTR …`.

If step 4 never fires: the SMS is not reaching the observer (wrong SIM, battery
optimisation, notification access off) or the bank sends no SMS at all. Check
that first — it is almost always one of those two.

**No observer? No problem.** Every payment sits in `/admin` with its UTR, amount
and time; tap **Approve** and the phone unlocks within 5 seconds (it polls).

---

## 6. Connect the app to the server

**On the phone (no rebuild needed):**
More → **Cloud & payments server** → paste `https://gym.yourdomain.com` →
**Test connection** → *Connected*. Then Pro tab → **Test my setup** shows a
green checklist:
`server reachable ✓ · receiving UPI matches ✓ · real gateway wired ✓ · webhook secret ✓ · admin page ✓`.

**Baked in (nicer for customers):**

```bash
GYMFLOW_API_BASE=https://gym.yourdomain.com bash scripts/build-apk.sh
```

Everyone who installs that APK is already connected and never sees the setting.
The receiving VPA itself is compiled in (`webapp/js/config.js → merchant`); the
server's `MERCHANT_UPI_ID` overrides it at order time, and the app warns you if
the two disagree.

---

## 7. Prove it works — one command

Run this from your laptop (Node 18+):

```bash
node scripts/check-deploy.mjs https://gym.yourdomain.com \
     --token=<ADMIN_TOKEN> --secret=<YOUPI_MERCHANT_SECRET>
```

It walks the exact customer road and prints 21 checks:

```
✓ Server answers /api/health
✓ Server knows the merchant UPI ID        merchantUpiId=8089274532@axl
✓ Webhook secret configured
✓ Server creates a UPI order              GYMPROLIFMVS7GG8ZD0F5 ₹149.00
✓ UPI deep link built                     upi://pay?pa=8089274532%40axl&pn=GymFlow&am=149.00…
✓ Server rejects a bogus UTR
✓ Admin token works — orders visible
✓ Approved order turns Pro on the phone   pro=true
✓ Signed webhook accepted
✓ Forged webhook is rejected
✓ Bank credit unlocked Pro automatically (no human)   pro=true
ALL 21 CHECKS PASSED
```

Red lines tell you exactly what to fix (see Troubleshooting). The test orders it
creates are harmless — they show up in `/admin` once and can be ignored.

**Then do one real round trip:** install the APK, buy the ₹149 plan, pay from
another UPI app, and confirm Pro unlocks. Your own money simply moves between
your two accounts, so the test costs nothing.

---

## 8. Running it day to day

| Task | How |
|---|---|
| See today's payments | `https://gym.yourdomain.com/admin?token=<ADMIN_TOKEN>` |
| Approve a stuck payment | Find the UTR → **Approve** (phone unlocks ≤5 s) |
| Reject a fake one | **Reject** — nothing is granted |
| Change a price | `webapp/js/config.js` **and** `backend/config/plans.json`, then rebuild + restart |
| See what happened | `pm2 logs gymflow` (webhooks, matches, errors) |
| Back up orders | copy `backend/data/*.json` (or the Docker volume) nightly |
| Refund someone | send them money back from your bank app; then **Reject** their order |
| Update the app | bump the version in `scripts/build-apk.sh`, rebuild, re-upload |

Security musts: `ADMIN_TOKEN` long and secret; `/admin` only over HTTPS; YouPI
admin (6001) never exposed; check the server firewall once a month.

---

## 9. Money, banks and rules — read this once

- **Personal VPA vs current account.** `8089274532@axl` looks like a personal
  handle. Personal accounts have no merchant limit protection and banks can ask
  questions when many unrelated credits arrive. For steady business, open a
  **current account** with a **merchant VPA** and swap it in `.env` + rebuild.
- **No gateway fee, but not free of rules.** YouPI PG charges 0%, but UPI/NPCI
  rules, GST on your sales, and bank monitoring still apply to you. Keep an
  invoice trail (order id + UTR is a decent start).
- **No chargebacks.** UPI transfers are final; refunds are manual. Rejecting a
  fake UTR is your only defence — the app never unlocks on a typed number alone.
- **YouPI PG is experimental** (its own README says so). Reconcile weekly against
  your bank statement; treat `/admin` as the source of truth.
- **The app never stores a card or a PIN.** It only builds a `upi://` link and
  draws a QR.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| App says *auto-verify OFF* | No server URL saved | More → Cloud & payments server → paste URL |
| **Test my setup** shows ✗ *Server reachable* | Wrong URL, server asleep, or firewall | `curl https://your-url/api/health`; Render free sleeps 15 min — hit it once to wake |
| ✗ *Receiving UPI matches* | `MERCHANT_UPI_ID` differs from the APK | set it to `8089274532@axl`, restart, `pm2 restart gymflow` |
| ✗ *Real gateway wired* | `PAYMENT_PROVIDER=mock` | set `PAYMENT_PROVIDER=youpi`, restart |
| ✗ *Webhook secret accepted* | `YOUPI_MERCHANT_SECRET` empty/wrong | copy it again from YouPI merchant admin |
| Customer pays, Pro never unlocks | Observer not seeing the SMS | check notification access + battery; `pm2 logs gymflow` for `[webhook]` |
| Webhook log says `signature mismatch` | Different secrets in YouPI and bridge | make both identical, restart both |
| Webhook log says `unknown-order` | Amount differs (someone paid ₹1) or order expired | match by UTR, or raise `UPI_ORDER_TTL_MINUTES` |
| QR will not scan | Screen dim / camera too close | raise brightness, or tap **Copy** and paste the UPI ID |
| UPI app opens but shows "invalid VPA" | VPA typed/pasted with a space | use the QR, or re-copy the ID |
| `/admin` says *Token rejected* | wrong `ADMIN_TOKEN` | read it from `backend/.env` on the server |
| Orders vanished after redeploy | Render free disk is ephemeral | move to a VPS, or mount a persistent disk |
| `npm start` on YouPI errors about `node:sqlite` | Node too old | install Node 22 (`node -v`) |

---

## 11. Command cheat-sheet

```bash
# bridge
cd /opt/gymflow && git pull && pm2 restart gymflow --update-env
pm2 logs gymflow
curl -s https://gym.yourdomain.com/api/health | python3 -m json.tool

# YouPI
cd /opt/YouPI-PG && pm2 restart youpi && pm2 logs youpi

# prove the whole chain
node scripts/check-deploy.mjs https://gym.yourdomain.com --token=… --secret=…

# rebuild the APK with the server baked in
GYMFLOW_API_BASE=https://gym.yourdomain.com bash scripts/build-apk.sh
```

Related docs: [`PAYMENTS.md`](PAYMENTS.md) (money flow in detail),
[`SETUP_YOUPI.md`](SETUP_YOUPI.md) (YouPI wiring), [`BUILD_APK.md`](BUILD_APK.md)
(building the app).
