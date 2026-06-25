# Feature: Per-recipient template variable personalization (merge tags)

## Goal
Let a campaign's template variables carry **merge tags** that resolve to each recipient's
contact fields at send time, instead of one static value blasted to everyone.

Supported tags (Phase 1):

| Tag                 | Resolves to              |
| ------------------- | ------------------------ |
| `{{contact.name}}`  | the contact's `name`     |
| `{{contact.phone}}` | the contact's `phone`    |

Any other text is a **literal** and is sent verbatim (current behaviour preserved).

> Scope note: only `contact.name` / `contact.phone` are wired now. Custom attributes
> (`{{contact.attributes.*}}`) are intentionally out of scope but the resolver is shaped so
> they can be added in one place later. `resolveSegment` already carries `attributes`.

## Current behaviour (before)
- Create-campaign modal: one **"Template variables (same for all recipients)"** input set.
- `createCampaign` stores `variables` on the campaign doc; `templateVariablesMode: 'static'`.
- `processCampaign` passes the **same** `variables` array to `sendTemplateMessage` for every
  recipient, so every recipient gets identical body params.

## Desired behaviour (after)
- Variable inputs accept merge tags; the modal offers insert chips + a live preview.
- `createCampaign` stores the **raw** variable strings (tags unresolved) — resolution now
  happens per recipient at send time.
- `processCampaign` resolves the campaign's raw variables **against each recipient's contact
  fields inside the send loop**, then hands the resolved array to `sendTemplateMessage`.

## Resolver rules (the contract)
Implemented in a single pure module **`shared/src/campaigns/mergeTags.ts`** (exported from
`@thinkai/shared`). It lives in `shared` so the **server send loop and the client live-preview
import the SAME module** — there is no client-side reimplementation to drift from when
`{{contact.attributes.*}}` is added later:

1. **Tag match.** A variable equal to `{{contact.name}}` / `{{contact.phone}}` (whitespace- and
   case-tolerant) resolves to that contact field. Anything else is a literal.
2. **Name fallback.** Missing/empty `name` → `"there"` (reads fine in "Hi there").
3. **Never empty.** Meta returns HTTP 400 on an empty body param, so any resolved value that
   ends up empty after sanitisation is replaced with the fallback `"there"`. (The only realistic
   empty case is a missing name; a blank literal is a degenerate input we keep non-empty.)
4. **Sanitisation** (WhatsApp Cloud API body-param hygiene), applied to every resolved value:
   `value.replace(/\s+/g, ' ').trim()` (strips newlines/tabs, collapses whitespace runs incl.
   the "4+ spaces" case) then **truncate to 60 chars** (`.slice(0, 60)`, trailing space trimmed).
5. **Unresolved-tag guard (send time).** After resolution, if any value still matches
   `/\{\{.*\}\}/` (e.g. an unknown tag like `{{contact.email}}` that fell through as a literal),
   **skip that recipient**: mark its recipient row `failed` with detail `"unresolved merge tag"`
   (code `unresolved_merge_tag`), do **not** create a message doc, do **not** debit, and continue
   the campaign. We never deliver literal `{{...}}` text to a customer.
6. **Pasted-numbers guard (create time).** "Paste numbers" audiences have no contact records, so
   merge tags can never resolve. If an explicit `recipients` list is provided and any variable
   contains a merge tag, **reject at creation** (HTTP 400, code `merge_tag_requires_segment`).

### Module surface (`mergeTags.ts`)
```ts
export interface MergeContact { name?: string; phone: string; }
export const MERGE_FALLBACK = 'there';

export function containsMergeTag(value: string): boolean;            // {{contact.<word>}} present?
export function sanitizeParam(value: string): string;               // rule #4
export function resolveVariable(raw: string, c: MergeContact): string; // rules #1–#4
export function hasUnresolvedTag(value: string): boolean;           // rule #5 predicate
export function resolveRecipientVariables(                          // used by processCampaign
  rawVars: string[], c: MergeContact,
): { variables: string[]; unresolved: boolean };
```
`mergeTags.ts` is dependency-free (no Firestore, no Meta, no AppError) so it unit-tests cleanly
and stays out of the provider-isolation boundary — **no merge logic enters `metaCloud*`.**

### Scheduled campaigns: name is snapshotted at creation (Phase 1)
The recipient's `name` is written onto the recipient row **at campaign-creation time** (from
`resolveSegment`). For a scheduled campaign, a contact renamed between scheduling and the actual
send therefore goes out with the **stale name as of creation**, not the latest value. This is
**accepted for Phase 1** (re-resolving names at send time would mean a second contacts read per
recipient and is out of scope). A short comment marks the snapshot site in `createCampaign.ts`.

## Where the data comes from
- `resolveSegment` already returns each recipient's `name` + `phone` (+ `attributes`).
- `createCampaign` currently **drops** `name` when writing recipient rows. We persist it;
  add optional `name?: string` to `CampaignRecipient` and write it for segment-derived rows.
  `phone` is already on the row. The send loop then resolves with **no extra Firestore reads**
  and stays resumable — exactly what the existing `resolveSegment` comment anticipated.
- No contacts-table schema change; we read the existing `name`/`phone` fields only.

## Live preview (modal)
- Extend `AudiencePreviewResponse` with `sample?: { name?: string; phone: string }`
  (the first resolved recipient). The `preview-audience` route returns `resolved[0]`.
- Modal renders the template BODY with `{{1}}…{{n}}` substituted by the **shared resolver**
  (`resolveVariable` from `@thinkai/shared` — the exact module the server uses, no mirror) against
  the sample contact, e.g. `Preview for Bhagavan Pasala: "Hi Bhagavan, your report is ready"`.
- Body text source: `template.body` if present, else the `BODY` component text parsed out of the
  JSON-encoded `template.components` (synced Meta templates store `components`, not `body`).
- **Paste-numbers mode**: no contact → preview substitutes the **literal** variable text; the
  insert chips are disabled with a hint that personalisation needs a contact segment.

## Files

### NEW
- `shared/src/campaigns/mergeTags.ts` — pure resolver + guards (the contract above), exported
  from `@thinkai/shared` for both server and client.
- `server/src/services/campaigns/mergeTags.test.ts` — resolver unit tests (imports the resolver
  from `@thinkai/shared`).
- `server/src/services/campaigns/payload.test.ts` — executor-level: two contacts with different
  names produce two different `buildTemplateBody` payloads.
- `server/src/validation/campaigns.schema.test.ts` — pasted-numbers + merge-tag variable rejected
  at parse; segment + merge tag accepted.

### MODIFIED
- `server/src/services/campaigns/processCampaign.ts` — resolve per recipient inside the loop;
  unresolved-tag skip → recipient `failed`; read `name` from the recipient row.
- `server/src/services/campaigns/createCampaign.ts` — persist `name` on segment recipient rows
  (snapshotted at creation — see scheduled-campaign note; marked with a comment at the write
  site); set `templateVariablesMode` to `per_contact` when any variable is a merge tag; reject
  merge tags for an explicit-list audience. (Variables are already stored raw — kept.)
- `server/src/validation/campaigns.schema.ts` — `superRefine`: explicit `recipients` + a
  merge-tag variable → fail with path `['variables']` (rejection right at the API boundary).
- `shared/src/types/firestore.ts` — `CampaignRecipient.name?: string`.
- `shared/src/types/dto.ts` — `AudiencePreviewResponse.sample?`.
- `server/src/routes/campaigns.routes.ts` — `preview-audience` returns the sample contact.
- `client/src/pages/Campaigns.tsx` — relabel; per-input insert chips (Contact name / Contact
  phone) that splice the tag at the caret; live preview block (uses the shared `resolveVariable`);
  paste-numbers disable + hint.
- `server/package.json` — add a `test` script.

### UNCHANGED (deliberately)
- `services/bsp/metaCloud.ts` + `metaCloud.mapping.ts` — provider isolation; `buildTemplateBody`
  still takes a final `variables[]` and is unaware of merge tags.
- `services/messages/sendTemplate.ts` — billing/refund path untouched; it just receives the
  already-resolved per-recipient `variables`.
- `services/campaigns/resolveSegment.ts` — already returns `name`/`phone`.
- `shared/src/index.ts` — adds one `export * from './campaigns/mergeTags'` line (not a behaviour
  change, listed for completeness).
- `services/campaigns/campaignWorker.ts`, `wallet/*`.
- `features/campaigns/CampaignDetailModal.tsx`, `features/reports/CampaignReport.tsx` — neither
  renders stored campaign variables, so storing raw values needs no display change (verified).

## Tests (runner)
No test runner exists in the repo. To honour "do not introduce new tools" we use Node's built-in
`node:test` + `node:assert/strict` executed through the already-installed `tsx` — **zero new
dependencies**. `server/package.json` gets a **glob** script (Node 24 + tsx 4.22 expand
`src/**/*.test.ts`, so new test files run automatically — no hardcoded file list). A `pretest`
rebuilds `@thinkai/shared` so the resolver tests resolve the latest `@thinkai/shared` from dist:
```json
"pretest": "tsc -p ../shared/tsconfig.json",
"test": "tsx --test \"src/**/*.test.ts\""
```
> Verified the glob expands on this toolchain (Node v24, tsx v4.22). If a future downgrade to
> Node ≤ 20 breaks glob expansion in `--test`, fall back to an explicit file list and note it here.

Coverage:
- **Resolver** (`mergeTags.test.ts`): literal passthrough; `{{contact.name}}` / `{{contact.phone}}`
  resolution; missing-name → `"there"`; sanitisation (newlines, tabs, 4+ spaces, >60 chars);
  unresolved-tag detection; `containsMergeTag`.
- **Executor/payload** (`payload.test.ts`): two contacts (Asha, Bhagavan) through
  `resolveRecipientVariables` → `buildTemplateBody` yield **different** `components` payloads;
  unresolved tag flips `unresolved: true`.
- **Validation** (`campaigns.schema.test.ts`): `recipients:[...] + variables:['{{contact.name}}']`
  → `safeParse` fails; same variables with a `segment` → succeeds.

Full Firestore-backed `processCampaign` integration isn't unit-tested (no DB-mock infra in the
repo); the per-recipient divergence it relies on is covered by `payload.test.ts`.s
