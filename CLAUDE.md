# ThinkAiSolutions — WhatsApp Business Platform (Direct Meta Tech Provider)

## What we're building
A multi-tenant WhatsApp Business Platform for ThinkAiSolutions (thinkaisolutions.com).
We are a **direct Meta WhatsApp Cloud API Tech Provider** (the AiSensy model): we connect
straight to the Meta WhatsApp Cloud API and onboard our own clients (clinics, pharmacies,
labs, hotels, restaurants) under our own brand, dashboard, wallet billing, and pricing.

Chain:  `Meta WhatsApp Cloud API  ->  ThinkAiSolutions (this platform)  ->  our clients`

There is **no BSP / reseller layer**. We hold the Meta App + a Meta System User access token
and act on each client's WABA (via Embedded Signup onboarding) using OUR token + THAT
client's `phone_number_id` — no per-client Meta key.

> **History / pivot:** v1 was built as a Pinnacle/PinBot **reseller**
> (`Meta -> Pinnacle (BSP) -> us -> clients`), with an AiSensy alternate, both behind the
> `BspProvider` interface. We pivoted to going direct and have since **removed** the
> `pinnacle.*` / `aisensy.*` providers, their webhook routes, and the shared `httpClient`
> transport — **`metaCloud.ts` is the sole provider**. The `BspProvider` interface + factory
> remain, so adding a future backend stays a contained, one-file addition.

## CRITICAL: change discipline
This is an **evolution of a working Phase-1 MVP**, not a greenfield build.
KEEP intact (do not regenerate):
- wallet + billing engine (integer paise, atomic debit-before-send, GST-once-at-recharge,
  refund-on-failure)
- multi-tenant data model, Firebase Auth + custom claims, `firestore.rules`
- inbox + conversation 24h service-window logic
- our own tenant API-key issuance
- the `BspProvider` interface abstraction

Before writing code for a change, produce a short plan (which files are NEW / MODIFIED /
UNCHANGED) and wait for confirmation.

## Tech stack (do not introduce new tools)
- **Console frontend:** React + Vite + Tailwind + TS. Firebase Hosting, `console.` subdomain.
- **Marketing site:** React + Vite + Tailwind + TS, separate `/marketing` workspace.
  Firebase Hosting, apex domain. Static, no backend coupling.
- **Backend:** Node.js + Express + TS. Deployed to **Google Cloud Run (asia-south1)**,
  fronted by the Firebase Hosting `/api/**` rewrite. (`server/railway.json` is legacy.)
- **Database/Auth:** Firebase (Firestore + Firebase Auth + custom claims).
- **Payments:** Razorpay (wallet recharge, verified webhook).
- **Messaging:** **Meta WhatsApp Cloud API** via the Graph API
  (`/{phone_number_id}/messages`, `/{waba_id}/message_templates`), authenticated with our
  **Meta System User access token** (server-side secret). All provider calls go through the
  `BspProvider` interface; `metaCloud.ts` is the sole implementation.

## Non-negotiable architecture rules
1. **Provider isolation:** ALL WhatsApp/Graph calls go through a `BspProvider`
   implementation (`server/src/services/bsp/metaCloud.ts`), the SOLE provider. No Meta/Graph-
   specific code anywhere else. The interface + factory are kept so a future backend is a
   one-file addition; the provider is selected by config + the per-WABA `provider` field.
   (Deliberate exception: Meta webhook signature + `hub.challenge` verification lives in the
   webhook route, not in `BspProvider.verifyWebhook` — a legacy interface method `metaCloud`
   leaves as a no-op. `metaCloud` implements `parseWebhook` + the send/template methods; the
   route owns verification.)
2. **Secrets stay server-side:** Meta App Secret, Meta System User token, Razorpay secret,
   Firebase admin creds NEVER reach the frontend. The browser sees ONLY the public Meta
   **App ID** + **Config ID** (needed to launch the Embedded Signup popup). Frontend talks
   only to our Express API.
3. **Multi-tenant from day one:** every Firestore doc is scoped by `tenantId`; enforce
   tenant isolation in every query and in `firestore.rules`.
4. **Verify all webhooks:**
   - **Meta:** GET — echo `hub.challenge` when `hub.verify_token` matches our env token.
     POST — verify `X-Hub-Signature-256` (HMAC-SHA256 over the RAW body with the Meta App
     Secret) BEFORE parsing; on mismatch reply 401 and persist nothing. Route inbound by
     `metadata.phone_number_id` -> tenant/WABA (existing collection-group lookup).
   - **Razorpay:** verify the HMAC signature over the raw body before trusting it.
5. **Money is integer paise**, never floats. Store all amounts in paise.

## Roles (role keys unchanged)
- **Platform admin (us)** — role key `reseller_admin`, reinterpreted as the **Tech Provider
  operator**: sees all tenants, sets per-tenant pricing, views global usage/revenue/margin,
  manages tenants and onboarding.
- **Tenant admin (our client):** manages their own WABA (via Embedded Signup), templates,
  inbox, wallet, agents — scoped to their tenant only.
- **Agent:** handles one tenant's inbox.

## Data model (Firestore) — shapes UNCHANGED; semantics noted
- `tenants/{tenantId}`: name, plan, status, createdAt, billing (GSTIN, stateCode, address)
- `tenants/{tenantId}/wabas/{wabaId}`: `provider` ('metaCloud'), `phoneNumber`,
  `displayName`, `status`, `wabaId` (Meta WABA id), `phoneNumberId` (Meta `phone_number_id`,
  the inbound-routing key — already collection-group indexed), `providerRef` (= phoneNumberId
  for Meta), `bspApiKeyRef` (legacy/optional — Meta uses the shared System User token, not a
  per-WABA key), `webhookSecretRef` (legacy)
- `users/{uid}`: role, tenantId, name, email
- `tenants/{tenantId}/contacts/{contactId}`; `.../templates/{templateId}` (Meta template id
  in `bspTemplateId`); `.../conversations/{conversationId}` (24h `windowExpiresAt`);
  `.../messages/{messageId}` (direction, type, body, status, category, `costPaise`,
  `bspMessageId` = Meta `wamid`, ts)
- `tenants/{tenantId}/wallet/current`: balancePaise
- `tenants/{tenantId}/walletTransactions/{txnId}`, `.../walletOrders/{orderId}`
- `pricing/{tenantId}`: per-category rates we **charge** the tenant
- `pricingCost/{tenantId}`: **our Meta raw cost** rates (margin reporting; platform-admin
  only). NOTE: formerly "BSP wholesale cost" — repopulate with Meta rate-card numbers.
- `invoices/{invoiceId}`: GST record per recharge
- `processedEvents/{key}`: webhook idempotency (`source` now includes `'metaCloud'`)

## Billing logic (engine UNCHANGED — provider-agnostic)
- Meta charges by category (its current per-message pricing for marketing / utility /
  authentication; service inside an open window is free).
- Per outbound billable message: `chargePaise = tenantRate[category]` (BARE rate, NO GST on
  the debit), atomic Firestore-transaction debit-before-send, write a walletTransaction,
  block the send if balance insufficient, refund on send failure.
- Wallet recharge via Razorpay: create order -> client pays -> verify webhook signature ->
  credit wallet + GST-ONCE-on-top + write transaction + GST invoice record (dedup by
  Razorpay payment id).
- Platform admin sets each tenant's per-category **charge** rate; margin = charge − Meta raw
  cost (`pricingCost`).
- **Pricing review at the pivot (data, not engine code):** (a) repopulate `pricingCost` with
  Meta raw rates — going direct removes the BSP markup we used to pay; (b) decide whether to
  re-price `pricing/{tenantId}` charge rates now that our cost dropped; (c) Meta prices
  **authentication by destination country** — a single flat `authPaise` cost can't represent
  per-country auth, a real gap for cross-border auth senders; (d) per-message vs
  per-24h-conversation billing is a separate product decision, not a swap blocker.

## Onboarding — Meta Embedded Signup (replaces manual WABA connect)
- Frontend "Connect WhatsApp" button launches the Facebook Login / Embedded Signup popup
  with our public **App ID** + **Config ID**; captures the returned auth `code` + `waba_id`
  + `phone_number_id`.
- Server completes onboarding: exchange the `code` server-side, subscribe our app
  (`POST /{waba_id}/subscribed_apps`), register the number
  (`POST /{phone_number_id}/register`), persist BOTH `wabaId` and `phoneNumberId` on the
  WABA doc (`providerRef` = phoneNumberId). The shared System User token (server-side, via
  SecretStore/env) is used for all subsequent sends; nothing secret is stored on the client.
- The old manual `POST /api/admin/wabas` connect stays as a legacy/manual fallback.

## Public marketing website (`/marketing`)
Separate Vite+React+Tailwind+TS workspace (`/marketing`) for the apex domain (the console
moves to the `console.` subdomain). Pages: Home, Features, Pricing, About, Contact, + "Login /
Go to Console". SEO-friendly (meta tags, sitemap). No backend coupling. Two Firebase Hosting
targets: `marketing` (apex) -> `marketing/dist`; `console` (`console.` subdomain) ->
`client/dist` (keeps the `/api` rewrite + cache headers).

## Environment variables
- **Server** (`server/.env.example`): `META_APP_ID`, `META_APP_SECRET`,
  `META_SYSTEM_USER_TOKEN`, `META_CONFIG_ID`, `META_WEBHOOK_VERIFY_TOKEN`,
  `META_GRAPH_VERSION` (alongside existing Firebase, Razorpay, GST). The Pinnacle/AiSensy
  env vars have been removed.
- **Client**: NO Meta env vars. The browser fetches the public App ID / Config ID / Graph
  version from the server (`GET /api/admin/onboarding/config`) when launching Embedded Signup
  — a single server-side source of truth, so server + client can never drift. (`META_GRAPH_VERSION`
  itself defaults to the shared `META_GRAPH_VERSION` constant in `shared/src/constants.ts`.)

## Conventions
- TypeScript everywhere, strict mode. Small functions; comment the non-obvious (billing,
  webhook verification, onboarding).
- `.env.example` documents every required var; never commit real secrets.
- README explains local setup, env vars, and deploy (Firebase Hosting for marketing +
  console; Cloud Run for server).

## Later phases (DO NOT build yet — context only)
- Template builder + submit-for-approval flow
- Broadcast / campaign sending with scheduling and audience segments
- No-code chatbot / flow builder
- Contacts import, tags, segments, analytics dashboards
- **Vertical packs** (our moat): pre-built "WhatsApp for Clinics" (appointment reminders,
  report/lab delivery, refill alerts) and "WhatsApp for Restaurants" (booking, ordering,
  reminders), Telugu/local-language templates
- AI chatbot (LLM-powered conversations) and AI voice receptionist add-on
- White-label per-tenant branding/domains

(Meta Embedded Signup onboarding has moved OUT of later phases into the current pivot.)
