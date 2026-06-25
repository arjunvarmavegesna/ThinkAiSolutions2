# ThinkAiSolutions — WhatsApp Business Platform

> **⚠️ This README is pre-pivot and partly historical.** The platform has moved from a
> Pinnacle/PinBot **reseller** model to a **direct Meta WhatsApp Cloud API Tech Provider**
> (`metaCloud` is the sole provider; the Pinnacle and AiSensy providers have been removed).
> Treat **`CLAUDE.md`** as the source of truth for the current architecture, onboarding
> (Meta Embedded Signup), env vars (`META_*`), and deploy (Cloud Run + Firebase Hosting).
> The reseller/Pinnacle details below remain only as historical context pending a full refresh.

A multi-tenant WhatsApp Business Platform: we connect straight to the Meta WhatsApp Cloud API
and onboard our own clients (clinics, pharmacies, labs, hotels, restaurants) under our own
brand, dashboard, wallet billing, and pricing.

```
Meta WhatsApp Cloud API  ->  ThinkAiSolutions (this platform)  ->  our clients
```

This repository contains **Phase 1 (MVP)**: a real client can log in, connect a
WABA, send approved template messages, receive replies in a team inbox, and have
every billable message charged against a prepaid wallet.

---

## Architecture overview

This is an npm-workspaces monorepo with three packages:

| Package        | Path      | Stack                                   | Deploys to        |
| -------------- | --------- | --------------------------------------- | ----------------- |
| `@thinkai/shared` | `/shared` | TypeScript types, enums, money/GST helpers | (built, consumed) |
| `server`       | `/server` | Node 20 + Express + TypeScript (CommonJS) | Railway           |
| `client`       | `/client` | React + Vite + Tailwind + TypeScript (ESM) | Firebase Hosting  |

Key design rules (enforced across the codebase):

- **Provider isolation.** Every Meta Graph call goes through one module
  (`server/src/services/bsp/metaCloud.ts`) implementing the generic `BspProvider`
  interface. No provider specifics leak anywhere else — adding a future backend is one new file.
- **Secrets stay server-side.** Pinnacle apikeys, the Razorpay key secret, and
  Firebase admin creds never reach the browser. The client talks only to the
  Express API; Firestore docs store an opaque **reference** to each secret, never
  the secret itself (`SecretStore`, AES-256-GCM in the `secrets` collection).
- **Multi-tenant from day one.** Every Firestore path is tenant-scoped via the
  path helpers in `@thinkai/shared`. Tenant users never pass their own `tenantId`
  — it is resolved from their auth token.
- **Verify all webhooks.** Razorpay webhooks are verified by HMAC-SHA256 signature;
  Pinnacle webhooks are verified by a constant-time compare of a custom secret
  header that Pinnacle echoes back.
- **Money is integer paise. Time is epoch milliseconds.** No floats for money,
  ever. GST (18%) is charged **once at recharge, on top of the credit**; per-message
  debits are the bare tenant rate with no GST.

### Request flow at a glance

- **Client (browser)** → authenticates with Firebase Auth, attaches the ID token
  as `Authorization: Bearer <token>` on every call to the Express API.
- **Express API** → verifies the token, resolves role + tenant, runs business
  logic, and is the *only* thing that talks to Firestore (admin SDK), the BSP, and
  Razorpay.
- **Webhooks** → Pinnacle (`/api/webhooks/pinnacle`) delivers inbound messages +
  delivery statuses; Razorpay (`/api/webhooks/razorpay`) delivers `payment.captured`.
  Both are mounted with a raw-body parser **before** JSON parsing so signatures /
  header checks see the exact bytes.

---

## Prerequisites

- **Node.js 20+** and npm 10+ (the repo declares `"engines": { "node": ">=20" }`).
- A **Firebase project** with Firestore (Native mode) and Authentication
  (Email/Password sign-in provider) enabled.
- A **Firebase service account** key (Project Settings → Service accounts →
  Generate new private key) for the server.
- A **Razorpay account** (test mode is fine for development) for wallet recharge.
- A **Pinnacle / PinBot** partner account + apikey, a connected WABA, its
  `wabaid`, and its `phone_number_id`.
- **Firebase CLI** for client hosting: `npm i -g firebase-tools` then `firebase login`.
- **Railway CLI** (optional) for server deploys: `npm i -g @railway/cli` then `railway login`.

---

## Environment setup

Each runtime package has its own `.env`. Copy the examples and fill in real values.
**Never commit a real `.env`** — only the `.env.example` files are tracked.

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### Server (`/server/.env`)

Documented in full in `server/.env.example`. Summary of what each var controls:

| Variable                       | Required (prod) | Purpose |
| ------------------------------ | :-------------: | ------- |
| `PORT`                         |                 | HTTP port (default `8080`; Railway injects its own). |
| `NODE_ENV`                     |                 | `development` \| `production` \| `test`. |
| `CORS_ORIGIN`                  |                 | Allowed browser origin (the deployed client URL). |
| `PUBLIC_BASE_URL`              |       ✅*       | Internet-reachable URL of this server; used to build the Pinnacle webhook callback URL. |
| `FIREBASE_PROJECT_ID`          |       ✅        | Firebase/GCP project id. |
| `FIREBASE_CLIENT_EMAIL`        |       ✅        | Service-account client email. |
| `FIREBASE_PRIVATE_KEY`         |       ✅        | Service-account private key (keep the literal `\n` escapes; converted at boot). |
| `BSP_PROVIDER`                 |                 | Active provider (default `metaCloud`). |
| `BSP_HTTP_TIMEOUT_MS`          |                 | Graph request timeout (default `15000`). |
| `SECRET_STORE_DRIVER`          |                 | `firestore` (encrypted) \| `env`. |
| `SECRETS_ENCRYPTION_KEY`       |       ✅        | 32-byte key (hex/base64) for AES-256-GCM secret storage. |
| `META_*`                       |       ✅        | Meta Cloud API config — see `server/.env.example` / `CLAUDE.md` (`META_MODE`, `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`, `META_CONFIG_ID`, `META_WEBHOOK_VERIFY_TOKEN`). |
| `RAZORPAY_KEY_ID`              |       ✅        | Razorpay key id (public; mirror to client). |
| `RAZORPAY_KEY_SECRET`          |       ✅        | Razorpay key secret (server-only). |
| `RAZORPAY_WEBHOOK_SECRET`      |       ✅        | Razorpay webhook signing secret. |
| `SELLER_GSTIN`                 |                 | Our GSTIN (for invoices). |
| `SELLER_STATE`                 |                 | Our GST state code (drives CGST+SGST vs IGST). |
| `LOG_LEVEL`                    |                 | pino level (default `info`). |
| `BOOTSTRAP_ADMIN_EMAIL`        |                 | Optional input for `npm run bootstrap:admin`. |

> *In development the required vars may be left empty — the server boots with a
> warning so you can iterate. In **production** missing required vars throw at boot.

Generate the two random secrets like so:

```bash
# SECRETS_ENCRYPTION_KEY (32 bytes, base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# META_WEBHOOK_VERIFY_TOKEN (random hex — any value you also set in the Meta App webhook config)
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

### Client (`/client/.env`)

Documented in full in `client/.env.example`. Everything here is **public** (it
ships in the browser bundle), so put no secrets in it.

| Variable                            | Purpose |
| ----------------------------------- | ------- |
| `VITE_API_BASE_URL`                 | API base (default `/api`; dev proxy forwards to the server). |
| `VITE_FIREBASE_API_KEY`             | Firebase web API key. |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Firebase auth domain. |
| `VITE_FIREBASE_PROJECT_ID`          | Must match server `FIREBASE_PROJECT_ID`. |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Firebase storage bucket. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Cloud Messaging sender id. |
| `VITE_FIREBASE_APP_ID`              | Firebase app id. |
| `VITE_RAZORPAY_KEY_ID`              | Public Razorpay key id (must equal server `RAZORPAY_KEY_ID`). |

---

## Install & build

From the **repo root** (workspaces install all three packages at once):

```bash
npm install
```

The `@thinkai/shared` package compiles to `shared/dist` and is consumed by both
`server` and `client` as `@thinkai/shared`. **You must build it before (or
alongside) the apps.** The root scripts handle this automatically — `dev`,
`build`, and `typecheck` all run `build:shared` first — but if you ever import
shared types and TypeScript can't find them, run:

```bash
npm run build:shared
```

---

## Run locally (development)

From the repo root, start all three packages together (shared in watch mode,
server with `tsx watch`, client with Vite):

```bash
npm run dev
```

- Client: <http://localhost:5173>
- Server: <http://localhost:8080> (health check at `/health` and `/api/health`)
- The Vite dev proxy forwards `/api` → `http://localhost:8080`, so the client's
  default `VITE_API_BASE_URL=/api` works with no extra config.

Run a single side if you prefer (each builds shared first):

```bash
npm run dev:server   # server + shared(watch)
npm run dev:client   # client + shared(watch)
```

Type-check the whole repo:

```bash
npm run typecheck
```

### Receiving webhooks locally

Pinnacle and Razorpay must reach your server over the public internet. In dev,
tunnel `localhost:8080` (e.g. with `ngrok http 8080`) and set
`PUBLIC_BASE_URL` to the tunnel URL **before** connecting a WABA, so the
callback we register with Pinnacle (`PUBLIC_BASE_URL/api/webhooks/pinnacle`) is
reachable. Point your Razorpay test webhook at
`<tunnel>/api/webhooks/razorpay` (event: `payment.captured`).

---

## Step 0 — Bootstrap the reseller admin (runbook)

There is no public sign-up. The first **reseller admin** (us) is seeded with a
one-time script that creates/finds a Firebase Auth user, grants the
`reseller_admin` custom claim (`tenantId = null`), and writes the `users/{uid}` doc.

1. Ensure `server/.env` has valid Firebase admin credentials.
2. In the Firebase console, create the admin user under **Authentication** (or let
   the script create it), and note the email.
3. Run the bootstrap script from the repo root:

   ```bash
   # email via env (set BOOTSTRAP_ADMIN_EMAIL in server/.env)…
   npm run bootstrap:admin

   # …or pass it explicitly
   npm -w server run bootstrap:admin -- you@thinkaisolutions.com
   ```

4. The script prints the resulting `uid` and confirms the `reseller_admin` claim.
   Set/reset that user's password in the Firebase console if needed, then log in
   at `/login`. Reseller admins land on `/admin`.

---

## Onboarding a client (end-to-end flow)

Performed by the reseller admin in the dashboard (the **Create Tenant** wizard is
a 4-step flow; each step hits its own endpoint). The full happy path:

1. **Create the tenant** (`POST /api/admin/tenants`) — name + billing details
   (legal name, GSTIN, state code, address). This also initializes the wallet doc
   at `balancePaise = 0`. GSTIN is validated client-side with `isValidGstin` before submit.
2. **Create the tenant-admin user** (`POST /api/admin/users`) — name, email,
   password, role `tenant_admin`. They will log in and land on `/inbox` (and `/wallet`).
3. **Connect the WABA** (`POST /api/admin/wabas`) — phone number, display name,
   Pinnacle `wabaId` and `phone_number_id`, and the raw BSP **apikey**. The server
   stores the apikey via `SecretStore` (only a reference is persisted), registers
   our webhook with Pinnacle (`PUBLIC_BASE_URL/api/webhooks/pinnacle` + the secret
   header), runs a health check, and marks the WABA `connected`. The apikey field
   is write-only and never echoed back.
4. **Sync templates** (`POST /api/admin/tenants/:tenantId/templates/sync`) — pulls
   the WABA's templates from Pinnacle and upserts them into Firestore. Only
   **approved** templates become sendable.
5. **Set pricing** (`PUT /api/admin/pricing/:tenantId`) — per-category rates we
   charge this tenant (marketing/utility/auth) plus optional cost rates for margin
   reporting. The form edits rupees and converts to paise at the edge.
6. **Recharge the wallet** — the tenant admin opens the recharge modal, enters
   rupees, and pays via Razorpay Checkout. We add 18% GST on top, create the order,
   and credit the **net** wallet balance only after the verified
   `payment.captured` webhook (balance truth comes from the webhook, not the
   browser). A GST invoice record is generated.
7. **Send** — from the inbox, send an approved **template** to a contact
   (`POST /api/inbox/send-template`). This opens a conversation, debits the bare
   tenant rate (no GST), and dispatches via Pinnacle. When the contact replies,
   the inbound webhook stores the message and opens the 24h service window; the
   agent can then reply with **free text** while the window is open.

---

## Deploy

### Client → Firebase Hosting

The client is a static SPA built by Vite into `client/dist`.

1. Set production values in `client/.env` (point `VITE_API_BASE_URL` at the
   deployed server, e.g. `https://api.thinkaisolutions.com/api`).
2. Build:
   ```bash
   npm run build:shared
   npm -w client run build
   ```
3. From the `client` directory, initialize hosting once (`firebase init hosting`
   → public dir `dist`, single-page app **Yes**) and deploy:
   ```bash
   firebase deploy --only hosting
   ```

### Server → Railway

The server compiles to `server/dist` and runs with `node dist/index.js`.

1. Create a Railway service from this repo (or `railway init`).
2. Add **all** server env vars from `server/.env.example` in the Railway dashboard.
   In production the required ones (Firebase, Razorpay, secrets key, Pinnacle
   webhook secret, `PUBLIC_BASE_URL`) must be present or the app refuses to boot.
   Set `NODE_ENV=production` and `CORS_ORIGIN` to the deployed client URL. Paste
   `FIREBASE_PRIVATE_KEY` with its literal `\n` escapes intact.
3. Build and start commands:
   - Build: `npm install && npm run build:shared && npm -w server run build`
   - Start: `npm -w server run start`  (i.e. `node dist/index.js`)
4. Railway provides the public URL — set `PUBLIC_BASE_URL` to it (or your custom
   domain). Redeploy if you changed it after the first boot.

### Webhook URLs (configure after the server is live)

| Provider | URL                                            | How it's set |
| -------- | ---------------------------------------------- | ------------ |
| Pinnacle | `PUBLIC_BASE_URL/api/webhooks/pinnacle`        | Registered automatically when you connect a WABA (carries the `PINNACLE_WEBHOOK_SECRET` header). |
| Razorpay | `PUBLIC_BASE_URL/api/webhooks/razorpay`        | Set manually in the Razorpay Dashboard; subscribe to `payment.captured`; use `RAZORPAY_WEBHOOK_SECRET` as the signing secret. |

---

## Security notes

- **Secrets are server-only.** Pinnacle apikeys, the Razorpay key secret, the
  Razorpay/Pinnacle webhook secrets, the AES secrets-encryption key, and the
  Firebase admin private key live exclusively in `server/.env` (or your prod
  secret manager). They never appear in the client bundle or in Firestore docs.
- **The client bundle is public.** Everything in `client/.env` (Firebase web
  config, Razorpay key id) is safe to expose; access is gated by Firebase Auth +
  Firestore security rules, and the client never reads Firestore directly.
- **Webhooks are verified before trust** — Razorpay by HMAC signature, Pinnacle by
  a constant-time secret-header compare — and recharge/debit operations are
  idempotent (deterministic transaction doc ids) so retried webhooks can't
  double-credit or double-charge.

---

## Repository layout

```
.
├── shared/   @thinkai/shared — types, enums, money/GST + path helpers (build first)
├── server/   Express + TypeScript API (Railway)
│   └── .env.example
├── client/   React + Vite + Tailwind SPA (Firebase Hosting)
│   └── .env.example
├── package.json   npm workspaces + root scripts (dev / build / typecheck / bootstrap:admin)
└── README.md
```

---

## Scope

This is **Phase 1 (MVP)** only — login, WABA connect, template send, inbox with
24h-window free-text replies, and prepaid wallet billing. Template builders,
broadcasts/campaigns, chatbots, contact import/segments, embedded signup,
vertical packs, and white-labeling are **later phases** and intentionally not
built yet.
# ThinkAiSolutions2
