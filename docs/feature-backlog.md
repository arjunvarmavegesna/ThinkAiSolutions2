# Client Feature Backlog — WhatsApp BSP Dashboard

Status: **APPROVED (spec) — NOT STARTED.** This is the reference planning document; nothing here
is implemented yet. Build order: **Phase 1 only, one feature at a time, AFTER WhatsApp is live
(`META_MODE=live`).** Each feature gets its own plan + approval before code (per `CLAUDE.md`).

Locked decisions (owner-approved):
- Phasing, the channel-agnostic plan, and the Phase 1 order (**1.3 → 1.1 → 1.2**) are approved as written.
- The **`channel` field lands as part of the FIRST Phase 1 feature we build (1.3)** — additive, not a standalone task.
- The campaign job runner (1.2) is a **Firestore-backed queue** (no new infra dependency), not Cloud Tasks.
- **Hard gate:** nothing is built until `META_MODE=live`. The only step ahead is getting WhatsApp
  live (dev account → Meta app → App Review → live mode); then resume feature-by-feature.

Goal: bring the tenant console up to a standard WhatsApp BSP feature set (templates, campaigns,
reports, media, quality), modelled on AiSensy/Twilio dashboards — built on our existing data
model + the `metaCloud` provider, multi-tenant and channel-agnostic from the start.

---

## Cross-cutting principles (apply to every item)

1. **Multi-tenant.** Every read/write is tenant-scoped via the `@thinkai/shared` path helpers
   (`templatesPath`, `campaignsPath`, `messagesPath`, …) and gated by `verifyAuth` +
   `requireTenant`. No query may cross tenants. Mirror the existing controllers.
2. **Channel-agnostic (so Instagram / Messenger plug in later).** All new message/template/
   campaign/contact docs carry a `channel: ChannelName` field (`'whatsapp'` default; future
   `'instagram' | 'messenger'`). New code must read the channel rather than hardcode WhatsApp.
   The `BspProvider` interface generalises to a `ChannelProvider` keyed by channel; the `Waba`
   doc generalises to a "channel account" (keep the WABA shape now, add `channel`). See
   **Channel-agnostic plan** at the end.
3. **Provider isolation.** ALL Graph/WhatsApp calls stay inside `server/src/services/bsp/`
   (`metaCloud.ts` + `metaCloud.mapping.ts` + `metaCloud.onboarding.ts`). No Graph endpoint or
   Meta field name leaks into routes/controllers. New Graph calls extend the provider, not the
   route.
4. **Reuse billing + webhook plumbing.** Outbound metering goes through the existing
   debit-before-send pipeline (`services/wallet/*`, `services/messages/sendTemplate.ts`). Inbound
   + status + (new) template/quality events route through the verified Meta webhook
   (`routes/webhooks/meta.ts` → `metaCloud.parseWebhook` → `ingestInbound` / `applyStatusUpdate`),
   with `processedEvents/{key}` idempotency.
5. **Money is integer paise; time is epoch ms.** No floats. Reports compute from `costPaise` and
   `ts` already stored on messages.

---

## Current foundation (what already exists — do NOT rebuild)

| Capability | Where | State |
| --- | --- | --- |
| Send text/template/media | `bsp/metaCloud.ts` (`sendText`/`sendTemplate`/`sendMedia`), `metaCloud.mapping.ts` (`buildMediaBody`) | text+template wired end-to-end; `sendMedia` exists at provider level only |
| Per-message billing | `services/messages/sendTemplate.ts` → `services/wallet/*` (debit-before-send, refund-on-fail) | done |
| Templates: list + pull-from-Meta | `routes/templates.routes.ts` (GET, POST `/sync`), `services/templates/syncTemplates.ts`, `metaCloud.getTemplates` → `GET /{waba_id}/message_templates` | sync-only (no create/submit) |
| Campaigns: list + create+send | `routes/campaigns.routes.ts`, `services/campaigns/sendCampaign.ts` | works, but **synchronous in-request**, **raw recipient list** (no segments/scheduling) |
| Dashboard stats | `routes/dashboard.routes.ts` (`GET /api/dashboard/stats`) → today/last30/14-day from `messages` | submitted/sent/delivered/failed already computed |
| Inbound + status webhook | `routes/webhooks/meta.ts` → `metaCloud.parseWebhook` → `ingestInbound` / `applyStatusUpdate` | handles `messages` + `statuses` only |
| Contacts (with tags + opt-in) | `contacts/{contactId}` (`phone`, `name`, `tags[]`, `optInStatus`) | shape exists; no import/segment UI |

Data model reference: `shared/src/types/firestore.ts` (`Template`, `Campaign`, `Message`,
`Contact`, `Waba`, …). Enums: `shared/src/types/enums.ts` (`TEMPLATE_STATUSES`,
`MESSAGE_STATUSES`, `CAMPAIGN_STATUSES`, `WABA_STATUSES`).

---

## PHASE 1 — Core client experience

### 1.1 WhatsApp Templates — create / edit / submit (+ live approval status)
- **Goal:** tenants author a template in-console, submit it to Meta for review, and see its
  approval status update automatically — instead of only pulling already-approved ones.
- **Uses existing:** `templates/{templateName}` collection + `Template` type (`name`, `category`,
  `language`, `body`, `status`, `bspTemplateId`, `components`, `variableCount`); `TEMPLATE_STATUSES`
  enum; `syncTemplates.ts` (reconcile); `metaCloud.getTemplates`.
- **New data:** add to `Template` → `channel` (default `'whatsapp'`), `rejectionReason?`,
  `submittedAt?`, `category` set at create. (Optional `templateDrafts` not needed — reuse the
  `Template` doc with `status: 'draft' | 'pending'`.) New `BspProvider` methods:
  `createTemplate(ctx, def)`, `editTemplate(ctx, id, def)`, `deleteTemplate(ctx, name)` (added to
  the interface; metaCloud impl + a stub/throw for any future channel).
- **New endpoints (ours):** `POST /api/templates` (create→submit), `PUT /api/templates/:name`
  (edit), `DELETE /api/templates/:name`. Webhook: extend `metaCloud.parseWebhook` +
  `routes/webhooks/meta.ts` to handle the `message_template_status_update` change field →
  update the matching `Template.status` (+ `rejectionReason`).
- **Meta Graph:** create `POST /{waba_id}/message_templates`; edit
  `POST /{message_template_id}`; delete `DELETE /{waba_id}/message_templates?name=`; status
  via webhook field `message_template_status_update` (no polling).
- **Channel-agnostic:** template authoring is WA-specific (components/buttons), but persist
  `channel`; the create/edit/delete methods live on the provider so another channel implements
  its own.

### 1.2 Campaigns — approved template + audience segment → queued, metered bulk send
- **Goal:** turn the existing synchronous broadcast into a real campaign tool: pick an approved
  template, choose an **audience segment** (not a pasted list), send as a **queued background
  job**, metered per message against the wallet.
- **Uses existing:** `campaigns/{id}` + `Campaign` type (`status`, `totalRecipients`,
  `submitted/sent/delivered/failed`); `services/campaigns/sendCampaign.ts` (per-recipient
  debit+send pipeline); `contacts/{id}` (`tags[]`, `optInStatus`) for segments; `CAMPAIGN_STATUSES`.
- **New data:** `Campaign` → `channel`, `segment` (e.g. `{ tags?: string[], optInOnly?: boolean }`),
  `scheduledAt?`, `templateVariablesMode` (static vs per-contact); a `campaignRecipients`
  subcollection (`campaigns/{id}/recipients/{contactId}` → `phone`, `status`, `messageId`,
  `error?`) for per-recipient tracking (feeds 2.2). A lightweight **job runner** backed by a
  **Firestore queue** (a queue doc/collection the worker drains — NO new infra; not Cloud Tasks)
  to move sends off the request thread (today's code runs them synchronously and flags this).
- **New endpoints (ours):** keep `POST /api/campaigns` but accept a `segment` + optional
  `scheduledAt`; add `GET /api/campaigns/:id` (detail + per-recipient progress);
  resolve segment → recipients server-side from `contacts` (respect `optInStatus`).
- **Meta Graph:** none new — reuses `POST /{phone_number_id}/messages` (template) per recipient
  through `sendTemplateMessage`. (Phase 3 may swap marketing sends to MM Lite — see 3.3.)
- **Channel-agnostic:** segment resolution + queue are channel-neutral; the send step dispatches
  via the channel's provider.

### 1.3 Dashboard stat cards (submitted / sent / delivered / failed)
- **Goal:** surface the BSP-standard stat cards + trend on the tenant home.
- **Uses existing:** `GET /api/dashboard/stats` **already returns** `today`, `last30`, and a
  14-day `daily` series of submitted/sent/delivered/failed from `messages` (outbound only).
- **New data:** none required for the cards. Optional: add `read` to the returned shape and a
  per-channel breakdown (`groupBy channel`) once `channel` exists on messages.
- **New endpoints (ours):** none (backend exists). Work is **client wiring** in `pages/Dashboard.tsx`
  (cards + line chart) + optional date-range param on the stats route.
- **Meta Graph:** none (derived from stored `messages` statuses).
- **Channel-agnostic:** add an optional `?channel=` filter when `channel` lands on messages.

---

## PHASE 2 — Reporting + media

### 2.1 Manage Media (media library)
- **Goal:** upload/manage reusable media (images, docs, video) for templates + sends.
- **Uses existing:** `metaCloud.sendMedia` + `buildMediaBody` (send by `mediaId`/`link`) already
  exist; `SendMediaInput` type.
- **New data:** `media/{mediaId}` subcollection per tenant (`fileName`, `mimeType`, `sizeBytes`,
  `metaMediaId`, `handle`, `uploadedBy`, `channel`, `createdAt`); storage of the binary (Firebase
  Storage or direct Meta upload returning a media handle). New `BspProvider` methods
  `uploadMedia(ctx, file)` / `getMediaUrl(ctx, id)` / `deleteMedia(ctx, id)`.
- **New endpoints (ours):** `POST /api/media` (upload), `GET /api/media` (list),
  `DELETE /api/media/:id`.
- **Meta Graph:** upload `POST /{phone_number_id}/media` (multipart) → media id; fetch
  `GET /{media-id}`; delete `DELETE /{media-id}`. (Resumable upload API for templates:
  `POST /{app_id}/uploads` → file handle for `message_templates` headers.)
- **Channel-agnostic:** media records carry `channel`; upload routes through the channel provider.

### 2.2 Campaign Tracking Report
- **Goal:** per-campaign delivery funnel + per-recipient outcomes.
- **Uses existing:** `Campaign` counters (`submitted/sent/delivered/failed`); status webhooks
  (`applyStatusUpdate`) already update message status.
- **New data:** the `campaigns/{id}/recipients` subcollection from 1.2 (status per recipient,
  updated by the status webhook keyed on `bspMessageId`). Link `Message` ↔ campaign via a new
  `Message.campaignId?` field so status updates fan back to the campaign.
- **New endpoints (ours):** `GET /api/campaigns/:id/report` (funnel + recipient rows, paginated).
- **Meta Graph:** none (derived from status webhooks already received).
- **Channel-agnostic:** report aggregates by `channel` + campaign.

### 2.3 Daily Report
- **Goal:** day-by-day volume + outcome + spend, exportable (CSV).
- **Uses existing:** `messages` (`ts`, `status`, `category`, `costPaise`, `direction`); the
  dashboard stats aggregation pattern.
- **New data:** none required (compute on read). Optional: a `dailyRollups/{yyyy-mm-dd}` doc per
  tenant for fast/historical reads if message volume grows (precomputed by a scheduled job).
- **New endpoints (ours):** `GET /api/reports/daily?from=&to=&channel=` (+ CSV export).
- **Meta Graph:** none.
- **Channel-agnostic:** `channel` filter; rollups keyed by channel.

### 2.4 API / Message Report
- **Goal:** searchable per-message log (recipient, template, status, category, cost, error, ts).
- **Uses existing:** `messages` collection already stores every field needed (`bspMessageId`,
  `templateName`, `status`, `category`, `costPaise`, `error`, `ts`).
- **New data:** none (may add Firestore composite indexes for filter combos: `status`+`ts`,
  `category`+`ts`).
- **New endpoints (ours):** `GET /api/reports/messages?status=&category=&from=&to=&q=` (paginated,
  CSV export).
- **Meta Graph:** none.
- **Channel-agnostic:** `channel` column + filter.

---

## PHASE 3 — Compliance + health

### 3.1 Quality Signal Report (Meta quality rating + messaging tier)
- **Goal:** show each number's **quality rating** (green/yellow/red), **messaging limit tier**
  (250 / 1K / 10K / 100K / unlimited), and account/review status — the BSP health panel.
- **Uses existing:** `wabas/{id}` doc (per-number); the verified Meta webhook pipeline.
- **New data:** add to `Waba` → `qualityRating?`, `messagingTier?`, `qualityUpdatedAt?`; a
  `wabas/{id}/qualityHistory/{ts}` subcollection for the trend. Extend `metaCloud.parseWebhook`
  to handle quality/account change fields.
- **New endpoints (ours):** `GET /api/quality` (current rating + tier + history); a webhook
  branch that persists quality/tier changes.
- **Meta Graph:** webhook fields `phone_number_quality_update` (rating + `current_limit`),
  `account_update` / `account_review_update` (verification/restriction), and
  `message_template_quality_update`; on-demand `GET /{phone_number_id}?fields=quality_rating,
  messaging_limit_tier` for a manual refresh.
- **Channel-agnostic:** WhatsApp-specific signal; gate behind `channel === 'whatsapp'`.

### 3.2 Unsubscribe Report
- **Goal:** track marketing opt-outs and keep them out of campaigns (compliance).
- **Uses existing:** `Contact.optInStatus` (`opted_in | opted_out | unknown`) already exists;
  campaign segment resolution (1.2) already respects opt-in.
- **New data:** `unsubscribes/{id}` log per tenant (`contactPhone`, `reason`, `source`,
  `channel`, `ts`); set `Contact.optInStatus = 'opted_out'` when a stop/opt-out arrives.
- **New endpoints (ours):** `GET /api/reports/unsubscribes`; a webhook/inbound branch that
  detects WhatsApp marketing opt-out (Stop-promotions signal / keyword) → logs + flips opt-in.
- **Meta Graph:** none to send; opt-outs arrive via the inbound `messages` webhook (marketing
  opt-out signal / user keyword). Honour automatically in campaign sends.
- **Channel-agnostic:** opt-out log + suppression apply per `channel`.

### 3.3 MM Lite (Marketing Messages Lite API)
- **Goal:** route marketing template sends through Meta's lower-cost **MM Lite** path where
  eligible, falling back to the standard send.
- **Uses existing:** the campaign send pipeline (1.2) + per-message billing; `pricingCost` for
  margin.
- **New data:** `Message.sendPath?` (`'cloud' | 'mmlite'`) for reporting; per-number MM Lite
  eligibility flag on `Waba`. New `BspProvider.sendMarketingLite(ctx, input)`.
- **New endpoints (ours):** none new — campaigns choose the send path internally based on
  category (`marketing`) + eligibility.
- **Meta Graph:** `POST /{phone_number_id}/marketing_messages` (MM Lite). Pricing differs →
  revisit `pricing`/`pricingCost` rate handling.
- **Channel-agnostic:** WhatsApp-only optimisation; isolated in the WhatsApp provider.

---

## Channel-agnostic plan (Instagram / Messenger later)

- Add `ChannelName = 'whatsapp' | 'instagram' | 'messenger'` to `shared/src/types/enums.ts`;
  stamp `channel` on `Message`, `Template`, `Campaign`, `Conversation`, `Contact`, `Waba`
  (default `'whatsapp'` for back-compat).
- Generalise `BspProvider` → `ChannelProvider` (same interface; `name` becomes the channel) and
  the factory in `bsp/index.ts` selects by channel. metaCloud stays the WhatsApp implementation.
- Generalise the per-number `Waba` doc into a "channel account" (keep current fields; new
  channels add their own id fields). Inbound webhook routing already keys on a stored id
  (`phoneNumberId` / `providerRef`) — extend per channel.
- Reports/segments/billing are already channel-neutral once `channel` is a column.

---

## Build sequencing (rules)

1. Do **nothing** until `META_MODE=live` (Embedded Signup + real sends working end-to-end).
2. Build **Phase 1 only**, **one feature at a time**, each with its own NEW/MODIFIED/UNCHANGED
   plan + approval before code (per `CLAUDE.md`).
3. Suggested Phase 1 order: **1.3 Dashboard cards** (backend exists → fastest visible win) →
   **1.1 Templates create/submit** (unlocks real content) → **1.2 Campaigns segments+queue**
   (depends on approved templates + contacts).
4. Land the `channel` field **as part of the first Phase 1 feature built (1.3)** — additive, not a
   standalone task — so Phase 2/3 reporting is channel-ready.
5. Keep wallet/billing, `firestore.rules`, and the metaCloud provider boundary intact.
