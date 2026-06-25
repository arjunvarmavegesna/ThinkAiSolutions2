# BSP / provider layer (`services/bsp/`)

This directory is the **single isolation boundary** between ThinkAiSolutions and the WhatsApp
backend. We are a **direct Meta WhatsApp Cloud API Tech Provider**, so the sole provider is
**`metaCloud`**. The backend is selected per WABA (`WABA.provider`; default from `BSP_PROVIDER`,
`metaCloud`). The generic `BspProvider` interface is kept so a future backend would be a
one-file addition.

> **Architecture rule #1 (non-negotiable):** ALL provider calls go through an
> implementation of the generic `BspProvider` interface. **No provider-specific field
> name, endpoint, or header may appear anywhere outside this folder.** Adding a provider
> = one new `*Provider` file + one `case` in the `index.ts` factory.
>
> **metaCloud exception (by design):** Meta webhook authenticity (X-Hub-Signature-256 HMAC +
> the `hub.challenge` GET) lives in `routes/webhooks/meta.ts`, NOT in `BspProvider.verifyWebhook`
> (a legacy interface method `metaCloud` leaves as a no-op). `metaCloud` implements
> `parseWebhook` + the send/template methods; the route owns verification.

## Files

| File | Responsibility |
| --- | --- |
| `BspProvider.ts` | Generic provider interface (sendText/sendTemplate/getTemplates/createTemplate/editTemplate/deleteTemplate/setWebhook/verifyWebhook/parseWebhook/healthCheck). *(on-disk contract — not owned here)* |
| `types.ts` | Server-internal `Normalized*` DTOs + `BspContext`. *(on-disk contract)* |
| `errors.ts` | `BspError` + `BspAuthError` / `BspWindowClosedError` / `BspRateLimitError`, and `mapBspError(status, body)`. |
| `metaCloud.ts` | **The provider.** `MetaCloudProvider implements BspProvider` over the Graph API. Owns its own Bearer/`graph.facebook.com` fetch (`graphFetch`). `name = 'metaCloud'`. Adds `sendMedia`. |
| `metaCloud.mapping.ts` | **Pure** Meta Cloud API translators (vocab, text/template/media send bodies, parse the canonical Meta webhook envelope). Self-contained. No IO. |
| `metaCloud.onboarding.ts` | Embedded Signup Graph calls (code exchange, `subscribed_apps`, number `register`, phone profile). Run once at onboarding; not part of the `BspProvider` interface. |
| `resolveBspContext.ts` | Bridges Firestore WABA docs → `{ ctx, provider }`. metaCloud uses the shared System User token (`config.meta`) — **no per-WABA key**. `resolveWabaByPhoneNumberId` + `resolveWabaByProviderRef` + `resolveWabaByWabaId` (template-status events route by `waba_id`) are the collection-group lookups for webhook routing. |
| `index.ts` | `getBspProvider(name?)` per-name factory (default `config.bsp.provider`, `metaCloud`) + re-exports of resolvers and error types. |

## How callers use it

```ts
import { getBspProvider, resolveTenantBspContext } from '../bsp';

const { ctx, provider: name } = await resolveTenantBspContext(tenantId); // token + provider
const provider = getBspProvider(name); // the backend that serves THIS WABA
const { bspMessageId } = await provider.sendTemplate(ctx, {
  toPhone: '+9198XXXXXXXX',
  templateName: 'appointment_reminder',
  languageCode: 'en_US',
  variables: ['Asha', '5 PM'], // positional BODY params, in order
});
```

## Meta Cloud API facts baked in (`metaCloud`)

- **Auth:** `Authorization: Bearer <Meta System User token>` (live) or the test number's
  temporary token (test mode). We act on each client's WABA with OUR shared token
  (`config.meta`) + the client's `phone_number_id` — there is **no per-client Meta key**.
  Base `https://graph.facebook.com/{META_GRAPH_VERSION}`.
- **Two ids per WABA:** `phone_number_id` (→ `/messages`, webhook routing, `/register`) and
  `waba_id` (→ `/message_templates`, `/subscribed_apps`). Both persisted on the WABA doc;
  `providerRef = phone_number_id` (the collection-group-indexed inbound-routing key).
- **Send:** `POST /{phone_number_id}/messages` (text/template/media). Success →
  `{ messages: [{ id: 'wamid...' }] }` → `bspMessageId`.
- **Media library:** upload `POST /{phone_number_id}/media` (multipart, via `graphUpload`) →
  `{ id }` (the media id stored + referenced on sends); look up `GET /{media-id}` → short-lived
  `url`; download bytes from that url with the Bearer (`downloadMedia`, used by the preview
  proxy); delete `DELETE /{media-id}`. We store the media id + metadata, not the binary.
- **Templates:** `GET /{waba_id}/message_templates` → Meta `{ data: [...] }`. Authoring:
  create `POST /{waba_id}/message_templates`, edit `POST /{message_template_id}`, delete
  `DELETE /{waba_id}/message_templates?name=`. Approval verdicts arrive via the
  `message_template_status_update` webhook field (parsed into `ParsedWebhook.templateStatuses`,
  routed by `waba_id`), not by polling.
- **Webhook verification (in `routes/webhooks/meta.ts`, not the provider):** GET echoes
  `hub.challenge` when `hub.verify_token === META_WEBHOOK_VERIFY_TOKEN`; POST verifies
  `X-Hub-Signature-256 = 'sha256='+HMAC-SHA256(rawBody, META_APP_SECRET)` before parsing.
- **Webhook payload:** canonical Meta envelope `entry[].changes[].value.{metadata,messages,statuses}`.
  Timestamps in SECONDS → ms. Routed by `metadata.phone_number_id` via `resolveWabaByPhoneNumberId`.
  `parseWebhook` also extracts `templateStatuses` (`message_template_status_update`) and
  `qualityUpdates` (`phone_number_quality_update` → rating/tier, feature 3.1).
- **Quality:** on-demand `getPhoneNumberQuality` = `GET /{phone_number_id}?fields=quality_rating`;
  pushed updates arrive via the `phone_number_quality_update` webhook field (rating color comes from
  the GET; tier + flag events from the webhook).
- **Onboarding (Embedded Signup, `metaCloud.onboarding.ts`):** exchange the ES `code`
  (`GET /oauth/access_token`), `POST /{waba_id}/subscribed_apps`, `POST /{phone_number_id}/register`
  (needs a 6-digit PIN), and fetch `display_phone_number`/`verified_name` to complete the doc.
- **Health:** `GET /{phone_number_id}` (2xx when the token + number are valid).
- **`TODO(meta)`:** number `register` PIN/two-step handling may need a set-PIN step first;
  confirm against your ES + System User setup.

## Security invariants

- metaCloud authenticates with the shared Meta token (`config.meta`), carried in-memory on the
  `BspContext` for the duration of one call. It is **never** persisted and **never** logged —
  `graphFetch` redacts the Bearer to `****<last4>`.
- `verifyWebhook` is a no-op for metaCloud; Meta authenticity is enforced in
  `routes/webhooks/meta.ts` (HMAC + `hub.challenge`) against the raw bytes, before parsing.
- `graphFetch` does **not** auto-retry POSTs: sends are non-idempotent (no provider idempotency
  key in Phase 1), so a blind retry could double-send and double-bill.

## History

This layer began as a Pinnacle/PinBot **reseller** integration with an AiSensy alternate, both
behind `BspProvider`. After the pivot to a **direct Meta Tech Provider**, the `pinnacle.*` /
`aisensy.*` providers, their webhook routes, and the shared `httpClient` transport were removed;
`metaCloud` is the only provider. The interface + factory remain so a future backend stays a
contained addition.
