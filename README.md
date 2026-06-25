# ThinkAiSolutions — WhatsApp Business Platform

![ThinkAiSolutions](./ThinkAiSolutions.png)

A multi-tenant WhatsApp Business Platform. We connect **directly to the Meta WhatsApp Cloud API** as a Tech Provider (the AiSensy model) and onboard our own clients — clinics, pharmacies, labs, hotels, restaurants — under our own brand, dashboard, wallet billing, and pricing.

```
Meta WhatsApp Cloud API  →  ThinkAiSolutions (this platform)  →  our clients
```

There is no BSP or reseller layer. We hold the Meta App + System User token and act on each client's WABA via Embedded Signup.

---

## Architecture

npm-workspaces monorepo with three packages:

| Package | Path | Stack |
|---|---|---|
| `@thinkai/shared` | `/shared` | TypeScript types, enums, constants |
| `server` | `/server` | Node 20 + Express + TypeScript + Prisma |
| `client` | `/client` | React + Vite + Tailwind + TypeScript |

Marketing site lives in `/marketing` (separate Vite workspace, static).

### Key design rules

- **Provider isolation.** All Meta Graph calls go through `server/src/services/bsp/metaCloud.ts` — the sole `BspProvider` implementation. No Graph-specific code anywhere else.
- **Secrets stay server-side.** Meta System User token, Razorpay secret, Firebase admin key never reach the browser.
- **Multi-tenant.** Every DB row is scoped by `tenantId` resolved from the Firebase Auth token — never from the request body.
- **Verify all webhooks.** Meta: HMAC-SHA256 over raw body with the Meta App Secret. Razorpay: HMAC-SHA256 signature verification before any trust.
- **Money is integer paise.** No floats, ever. GST charged once at wallet recharge; per-message debits are the bare tenant rate.

---

## Tech stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL (via Prisma ORM) |
| Auth | Firebase Auth (token verification + custom claims only — no Firestore data) |
| Messaging | Meta WhatsApp Cloud API (direct, Graph API) |
| Payments | Razorpay (wallet recharge) |
| Server deploy | VPS — pm2 (`thinkai-server`, port 8080) + nginx reverse proxy |
| Client deploy | nginx → `client/dist` at `console.thinkaisolutions.com` |
| Marketing deploy | nginx → `marketing/dist` at `thinkaisolutions.com` |

---

## Prerequisites

- Node.js 20+ and npm 10+
- PostgreSQL instance
- Firebase project (Auth only — Email/Password enabled)
- Firebase service account key
- Meta App with WhatsApp product, System User token, and Embedded Signup config
- Razorpay account

---

## Environment setup

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### Server (`server/.env`) — key variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `FIREBASE_PROJECT_ID` | Firebase project id |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account private key |
| `META_APP_ID` | Meta App ID (public — used for Embedded Signup popup) |
| `META_APP_SECRET` | Meta App Secret (webhook signature verification) |
| `META_SYSTEM_USER_TOKEN` | Meta System User access token (all Graph API calls) |
| `META_CONFIG_ID` | Meta Embedded Signup config id |
| `META_WEBHOOK_VERIFY_TOKEN` | Token echoed back on webhook GET handshake |
| `RAZORPAY_KEY_ID` | Razorpay key id |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook signing secret |
| `SELLER_GSTIN` | Our GSTIN (for GST invoices) |
| `SELLER_STATE` | Our GST state code |

### Client (`client/.env`) — all public, safe in bundle

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | API base (default `/api`) |
| `VITE_FIREBASE_*` | Firebase web SDK config |
| `VITE_RAZORPAY_KEY_ID` | Public Razorpay key id |

---

## Install & run locally

```bash
# Install all workspaces
npm install

# Build shared types first
npm run build:shared

# Start everything (shared watch + server tsx watch + Vite dev)
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:8080

For webhooks locally, tunnel port 8080 (e.g. `ngrok http 8080`) and configure the Meta webhook URL in the Meta App dashboard.

---

## Database setup

```bash
cd server
npx prisma migrate deploy   # run all migrations
npx prisma generate          # regenerate client
```

---

## Deploy (VPS)

### Server

```bash
cd server
npm run build
pm2 restart thinkai-server --update-env && pm2 save
```

> **Important:** any `.env` change requires `--update-env` on restart — dotenv loads at startup, not on file change.

### Client

```bash
cd client
npm run build
# nginx serves client/dist at console.thinkaisolutions.com
```

### Marketing

```bash
cd marketing
npm run build
# nginx serves marketing/dist at thinkaisolutions.com
```

---

## Bootstrap platform admin

```bash
npm -w server run bootstrap:admin -- admin@thinkaisolutions.com
```

Creates the Firebase Auth user, grants `reseller_admin` custom claim, and writes the users row. Platform admins land on `/admin`.

---

## Onboarding a client

1. **Create tenant** — name + billing details (admin panel)
2. **Create tenant-admin user** — email + password (admin panel)
3. **Connect WABA** — tenant clicks "Connect WhatsApp" → Meta Embedded Signup popup → server exchanges code, subscribes app, registers number, persists WABA
4. **Sync templates** — pulls approved templates from Meta Graph API
5. **Set pricing** — per-category rates (marketing / utility / authentication)
6. **Recharge wallet** — tenant pays via Razorpay → verified webhook credits wallet

---

## Repository layout

```
.
├── shared/       @thinkai/shared — types, enums (build first)
├── server/       Express API + Prisma (pm2 on VPS)
│   ├── prisma/   schema + migrations
│   └── src/
├── client/       React SPA (nginx → console.thinkaisolutions.com)
├── marketing/    Static marketing site (nginx → thinkaisolutions.com)
└── BRAND.md      Brand guidelines (colors, logo, typography)
```
