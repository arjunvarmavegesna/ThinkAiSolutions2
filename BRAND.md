# ThinkAiSolutions — Brand & Visual Identity System

> The official mark is the **hexagonal node symbol** in a blue→violet gradient with the
> "Think **Ai** Solutions" wordmark and the tagline **AUTOMATE · ENGAGE · GROW**.
> This document builds the full identity *around* that mark. The symbol is fixed — do not
> redraw, recolor, or restyle it.

ThinkAiSolutions is a **premium WhatsApp Business Solution Provider (BSP)** — AI-driven
messaging infrastructure for enterprises. The identity must read like a modern **AI
infrastructure company** (Stripe · Linear · Vercel · OpenAI · Notion), **not** a generic
green WhatsApp tool, a marketing agency, or hospital software.

**Brand personality:** Intelligent · Automated · Reliable · Enterprise-grade · Calm.

**Anti-patterns (never do):** WhatsApp green as the brand color · rainbow/overworked
gradients in the UI · drop shadows everywhere · clip-art icons · stocky marketing gloss ·
clinical teal/light-blue "healthtech" palettes.

---

## 1. Brand Color System

The palette is anchored to the logo's measured gradient: **azure blue → indigo → violet**,
grounded by a **deep navy ink** and a neutral **slate** scale. Blue is the workhorse
(communication, reliability); violet is the accent (intelligence, AI); the **gradient** is
reserved for brand moments only.

### Core brand

| Token | Hex | HSL | Use |
|---|---|---|---|
| **Brand Blue** (Primary) | `#1A74E8` | `214 81% 51%` | Primary actions, links, focus, active nav |
| Brand Blue — Emphasis | `#1560C4` | `217 80% 42%` | Hover/pressed, accessible text-on-light |
| **Brand Indigo** (gradient mid) | `#5A60F2` | `238 85% 65%` | Gradient waypoint only |
| **Brand Violet** (Accent / "AI") | `#8A50F8` | `261 92% 65%` | AI features, accent dots, highlights |
| Brand Violet — Emphasis | `#6D3BEB` | `258 78% 58%` | Violet text/hover on light |
| **Ink / Navy** | `#0A1733` | `221 67% 12%` | Wordmark, dark sidebar base, strongest text |

### Signature gradient

```
linear-gradient(135deg, #1A74E8 0%, #5A60F2 50%, #8A50F8 100%)
```

Allowed on: the logo, the favicon/app icon, the login hero panel, marketing hero
backgrounds, one feature accent per screen. **Forbidden on:** body text, table rows, cards
in bulk, buttons used more than once per view. Keep gradients to **≤1 prominent surface per
screen**.

### Neutrals — Slate (UI scaffolding)

| Role | Hex | HSL |
|---|---|---|
| Background | `#F7F9FC` | `210 40% 98%` |
| Surface / Card | `#FFFFFF` | `0 0% 100%` |
| Border / Hairline | `#E5E9F0` | `214 32% 91%` |
| Muted surface | `#F1F5F9` | `210 40% 96%` |
| Text — primary | `#0B1220` | `222 44% 11%` |
| Text — secondary | `#51607A` | `215 20% 40%` |
| Text — muted | `#7A8699` | `215 16% 54%` |

---

## 2. Primary Colors

**Brand Blue `#1A74E8`** is the single primary. One primary action per view. It carries:
primary buttons, active sidebar item, links, focus rings, selected states, progress fills,
and the "delivered/healthy" accents that are *not* status-green.

- Default: `#1A74E8`
- Hover / pressed: `#1560C4` (emphasis)
- Tint (selected row / soft fill): `#1A74E8 @ 10%` → `bg-primary/10`
- On-blue text/icons: white `#FFFFFF`

Contrast: white on `#1A74E8` ≈ 4.5:1 (AA for UI/large). For small body text on a blue fill,
use the emphasis `#1560C4` (≈ 5.6:1).

---

## 3. Secondary Colors

**Brand Violet `#8A50F8`** is the secondary/accent — the "AI" signal. Use sparingly:
AI-powered features, the automation/intelligence story, an accent node, a single highlighted
metric. Never as a second primary button.

Supporting secondaries:

| Token | Hex | Use |
|---|---|---|
| Violet tint | `#8A50F8 @ 10%` | AI feature chips, badges |
| Indigo `#5A60F2` | gradient waypoint, decorative node lines |
| Slate `secondary` `#F1F5F9` | neutral buttons, chips, muted surfaces |

---

## 4. Dark Mode Colors

Linear/Vercel-style **near-black with a blue undertone** — not pure black, never navy-bright.
Brand blue/violet brighten slightly for contrast on dark.

| Token | Hex | HSL |
|---|---|---|
| Background | `#0A0E1A` | `222 47% 7%` |
| Surface / Card | `#111624` | `222 36% 11%` |
| Elevated / Popover | `#0E1320` | `222 40% 9%` |
| Border | `#222A3D` | `222 28% 19%` |
| Text — primary | `#EAF0FA` | `210 40% 95%` |
| Text — muted | `#94A1B8` | `215 20% 65%` |
| Primary (Blue) | `#3B8BF0` | `213 85% 59%` |
| Primary — Emphasis | `#6AA8F5` | `213 86% 69%` |
| Violet (Accent) | `#A47CFB` | `261 92% 74%` |
| Success | `#33C27A` | `152 56% 48%` |
| Warning | `#F8B33B` | `38 93% 60%` |
| Error | `#FB6155` | `4 95% 66%` |

Surfaces step up in lightness with elevation (bg → card → popover). Keep the brand gradient
muted in dark mode (lower opacity / behind a `bg-background/60` scrim).

> The app currently ships **light-only** (no `.dark` toggle). The `.dark` token block is
> defined so dark mode is render-ready; wiring a theme switch is a separate, additive task.

---

## 5. Sidebar Colors (theme-aware rail)

The navigation rail **follows the theme** (driven by `--rail*` tokens): a clean **white**
surface in light mode and a deep **indigo-navy** in dark mode — both framing the content area
and letting the brand blue pop on the active item.

| Token | Light | Dark | Use |
|---|---|---|---|
| Rail background | `#FFFFFF` | `#0B1020` (`222 47% 9%`) | rail surface |
| Rail accent (active pill) | `#E3EEFD` (`214 96% 93%`) | `#16203C` (`222 40% 16%`) | active item bg |
| Rail border | `#E5E9F0` | `#2A3346` (`222 28% 22%`) | dividers, edge |
| Rail text | `#0B1220` | `#EAF0FA` | active label |
| Rail muted | `#5A6B85` | `#94A1B8` | inactive labels, icons at rest |
| **Active item** | brand-blue icon + ink label on a `rail-accent` pill | same, on navy | selected nav |

Active nav item = **brand-blue icon** + strong label over a soft `rail-accent` rounded pill
(a sliding `layoutId` shared element). Never fill the whole rail with blue; the blue is the
*signal*, the surface is the *frame*. The modal scrim and dark tooltips use their own fixed
tokens, not the rail (so they stay correct when the rail goes light).

---

## 6. Dashboard Colors

The SaaS dashboard is **light, calm, data-first** (Stripe dashboard):

- Canvas `#F7F9FC`, cards pure white with a `1px #E5E9F0` hairline + `shadow-sm`.
- Primary metric/CTA in **brand blue**; everything else neutral slate.
- Charts: **Sent** = slate `#64748B`, **Delivered** = brand blue `#1A74E8` (or success green
  only when the metric *is* "delivered/healthy"), **Failed** = error `#F04438`. Max 3 series.
- One accent surface max (e.g. the onboarding card or a single highlighted KPI).
- Whitespace is a feature; never fill space with a chart that has no data.

---

## 7. Success / Warning / Error (status colors)

Status colors are **functional, not brand**. Green means "delivered/healthy" — it is *not*
the ThinkAiSolutions brand color and never drives buttons, links, or nav.

| Status | Hex | HSL | Emphasis (text on light) |
|---|---|---|---|
| **Success** | `#15A85C` | `152 78% 37%` | `#0F7A43` `153 78% 27%` |
| **Warning** | `#F59E0B` | `35 92% 50%` | `#B45309` `28 78% 35%` |
| **Error / Destructive** | `#F04438` | `4 86% 58%` | `#C4271C` `4 75% 44%` |
| **Info** | `#2E90FA` | `213 94% 58%` | `#1A6DD0` `215 78% 46%` |

Each status uses a **soft tinted background** (`@10%`) + emphasis text + (optionally) a solid
dot — never a saturated block of color behind text.

---

## 8. Typography System

**Typefaces** (already loaded via Google Fonts):

- **Inter** — UI, headings, body. `font-sans`. Variable weights 400–700.
- **Geist Mono** — numbers in tables/metrics, code, IDs, phone numbers. `font-mono`.

Inter is set with `cv11`, `ss01` feature settings and tabular figures for metrics
(`.tabular-nums`). The wordmark in the logo is bespoke — do not recreate it in Inter.

**Type scale** (Tailwind):

| Role | Class | Size / Tracking | Weight |
|---|---|---|---|
| Display (marketing hero) | `text-4xl`–`text-6xl` `tracking-tight` | 36–60px | 600–700 |
| Page title | `text-2xl tracking-tight` | 24px | 600 |
| Section / Card title | `text-base font-semibold tracking-tight` | 16px | 600 |
| Body | `text-sm` | 14px | 400–500 |
| Secondary / hint | `text-xs text-muted-foreground` | 12px | 400–500 |
| Eyebrow / label | `text-xs font-medium uppercase tracking-wide` | 12px | 500 |
| Metric / number | `text-3xl font-semibold tabular-nums` | 30px | 600 |

Rules: tight tracking on large headings; never bold for emphasis in body (use color/weight
500); numbers always `tabular-nums`; line length ≤ 70ch for paragraphs.

---

## 9. Iconography Guidelines

- **Library:** `lucide-react` (already standard). One library only — never mix icon sets.
- **Stroke:** 1.5–2px (lucide default). **Size:** `size-4` (16px) inline, `size-5` (20px)
  in medallions, `size-6` (24px) in empty-state/hero medallions.
- **Style:** outline (stroke) icons, rounded joins, geometric — matches the logo's line-node
  motif. No filled/duotone icons except status dots.
- **Color:** icons inherit `currentColor`; muted by default (`text-muted-foreground`), brand
  blue when active/interactive, status color only inside a status context.
- **Medallions:** icon centered in a `size-10 rounded-xl bg-{tone}/10 text-{tone}` tile for
  empty states, info tiles, and section markers. Brand blue tile = primary concept; violet
  tile = AI/automation concept.
- The hex-node motif from the logo may be used as a decorative watermark (≤4% opacity) on
  hero/empty surfaces — never behind dense text.

---

## 10. Button System

Primitive: `components/ui/button.tsx` (CVA variants). Radius `md` (10px), height 36 (`default`),
`font-medium`, icon `size-4`, `active:scale-[0.98]`, focus ring = brand blue.

| Variant | Style | When |
|---|---|---|
| `default` (Primary) | `bg-primary` white, `shadow-sm`, hover `bg-primary/90` | The one main action |
| `outline` | `border-border bg-card`, hover `bg-secondary` | Secondary actions |
| `secondary` | `bg-secondary` slate | Tertiary / neutral |
| `ghost` | transparent, hover `bg-secondary` | Toolbar / low-emphasis |
| `destructive` | `bg-destructive` white | Delete / irreversible |
| `link` | brand-blue underline-on-hover | Inline navigation |

Sizes: `sm` h-8 · `default` h-9 · `lg` h-10 · `icon` / `icon-sm`. **One primary button per
view.** Gradient buttons are reserved for a single marketing hero CTA — never in the app UI.

---

## 11. Card System

Primitive: `components/ui/card.tsx`. **Radius `lg` (16px)**, `1px border-border` hairline,
`bg-card`, `shadow-sm`. Padding `p-5` (20px); header/content/footer share it.

- Hover (interactive cards only): `hover:-translate-y-0.5 hover:shadow-md` — subtle lift.
- Never stack heavy shadows; one elevation step. Use the hairline border as the primary
  separation, shadow as secondary.
- KPI card: label (muted) + optional icon, `text-3xl` tabular metric, a hint line, optional
  signed delta pill (`success/10` up, `destructive/10` down).
- Section card: `CardHeader` title + optional "View all →" link, `CardContent` list/table.
- Empty state inside a card: centered icon medallion + title + one-line guidance + one CTA.

---

## 12. Badge System

Primitive: `components/ui/badge.tsx` (CVA). Pill (`rounded-full`), `text-xs font-medium`,
**tonal**: soft `@10%` background + `@15%` border + emphasis text. Never saturated fills.

| Variant | Tone | Use |
|---|---|---|
| `primary` | brand blue | brand/selected counts |
| `success` | green | delivered, approved, connected |
| `warning` | amber | pending, sending, scheduled |
| `danger` | red | failed, rejected |
| `info` | sky | queued, sent, informational |
| `outline` | neutral | categories, metadata, neutral tags |

Optional leading status **dot** (`size-2 rounded-full bg-{tone}`) for quality/health. Add a
**violet** badge tone for AI-generated/automation labels.

---

## 13. Logo Usage Guidelines

The mark exists as: **(a) full lockup** (symbol + wordmark + tagline), **(b) horizontal
lockup** (symbol + wordmark), **(c) symbol only** (the hex-node).

- **Clear space:** keep ≥ the height of the hexagon's half on all sides. Nothing crowds it.
- **Minimum size:** full lockup ≥ 140px wide; symbol-only ≥ 24px; favicon path below.
- **Placement:** symbol-only in the app sidebar/top-bar and favicon; horizontal lockup on
  login + marketing nav; full lockup (with tagline) on marketing hero, invoices, decks.
- **Backgrounds:** prefer white / very light slate, or the deep navy `#0A1733`. On photos or
  busy color, place the symbol on a white or navy rounded tile (`rounded-2xl`).
- **Don't:** recolor the symbol, flatten the gradient to one color, add shadows/glows/outlines,
  rotate, stretch, re-typeset the wordmark, place on low-contrast or clashing colors, or put
  the gradient symbol on a green background.
- **Monochrome fallback:** where one color is required, use Ink `#0A1733` (dark surfaces:
  white). Use this for faxes/print/embossing only — the gradient is the default.

---

## 14. Favicon Recommendations

Use the **symbol only** (hex-node), never the wordmark, at favicon sizes.

- The favicon + app icon use the **official symbol**, cropped from the master lockup to a
  square with ~16% padding on white → `client/public/logo.png` (also `marketing/public/`).
  The full lockup is kept as `logo-lockup.png` for horizontal contexts.
- For crisper small sizes, a designer should export from the master:
  `favicon-32.png`, `favicon-16.png`, `apple-touch-icon.png` (180×180, symbol on a white or
  navy `#0A1733` rounded tile, ~12% padding), `icon-192.png` & `icon-512.png` (maskable, for
  PWA/Android), plus an optional `safari-pinned-tab.svg` in solid Ink.
- **Tab legibility:** at 16px keep only the hex-node (drop tagline/wordmark) — the cropped
  symbol satisfies this. A simplified single-color version is acceptable below 24px.
- `theme-color`: `#0A1228` (matches the rail) so mobile browser chrome blends in.

---

## 15. Login Page Branding

- **Split layout** (desktop): left = brand panel with the deep-navy `#0A1733` field, a single
  brand-gradient accent (corner glow or the hex-node watermark at ~6% opacity), the horizontal
  lockup, a one-line value prop ("AI-powered WhatsApp messaging for enterprises") and the
  tagline. Right = the white auth card.
- **Mobile / current single-column:** logo symbol on a white `rounded-2xl` tile, "ThinkAiSolutions"
  wordmark in Ink, subtitle "WhatsApp Business Platform" in muted slate.
- **Controls use brand tokens**, not emerald: inputs focus `border-primary` + `ring-primary/20`;
  the submit button is `bg-primary` (brand blue) hover `bg-primary/90`; "Create account" link
  in `text-primary-emphasis`.
- Keep it calm: one accent, generous whitespace, no marketing copy dump.

> (Login copy is intentionally untouched in this pass per the chosen scope; the spec above is
> the target when you green-light the login refresh. Once tokens are live, simply swap the
> page's hardcoded `emerald-*`/`slate-*` for `primary`/`foreground`/`muted-foreground`.)

---

## 16. Marketing Website Branding

- **Hero:** deep-navy or white canvas with **one** brand-gradient element (headline accent,
  product frame glow, or hex-node motif). Display headline in Inter `tracking-tight`, 56–64px.
  Tagline AUTOMATE · ENGAGE · GROW as the eyebrow.
- **Sections:** white and `#F7F9FC` alternating; cards with the standard hairline + `shadow-sm`.
  Feature icons in lucide, brand-blue or violet medallions (violet = AI/automation features).
- **Buttons:** one gradient primary CTA in the hero; everything else solid brand-blue or outline.
- **Social proof / enterprise cues:** logo wall in monochrome slate, security/compliance row,
  uptime/scale stats in `tabular-nums`.
- **Tone:** infrastructure, not agency. Short declarative lines, lots of air, product
  screenshots over illustrations. Avoid WhatsApp-green hero blocks and stock "happy customer"
  photography.
- **OG/meta:** social image on navy `#0A1733` with the full lockup + gradient accent;
  `theme-color #0A1228`.

---

## 17. SaaS Dashboard Branding

- **Frame:** fixed dark rail (§5) + light, data-first content (§6). The brand lives in the
  rail logo, the active-nav blue, primary buttons, and focus states — the canvas stays neutral
  so data reads first.
- **Hierarchy:** page title → KPI row → actionable sections (campaigns, activity, onboarding)
  → charts last. Prioritize information over decoration.
- **Brand touchpoints:** logo symbol top-left of the rail; brand-blue active item; brand-blue
  primary CTA; violet only on AI/automation surfaces; the gradient only on the onboarding hero
  or an upgrade card — at most once per screen.
- **Consistency:** every surface uses the shared primitives (Card, Button, Badge, StatCard,
  EmptyState, PageHeader). No bespoke colors — pull from the tokens in §1–§7.
- **Empty & loading:** skeletons for loading, branded empty states (icon medallion + guidance +
  CTA) for no-data — never a blank panel or an empty chart.

---

## Token reference (implementation)

These map to CSS variables in `client/src/index.css` (HSL channels) and Tailwind colors in
`client/tailwind.config.ts`. Components consume **tokens**, never raw hex.

```
--primary            214 81% 51%   #1A74E8   brand blue
--primary-emphasis   217 80% 42%   #1560C4
--violet             261 92% 65%   #8A50F8   accent / AI
--violet-emphasis    258 78% 58%   #6D3BEB
--success            152 78% 37%   #15A85C   status only
--warning             35 92% 50%   #F59E0B
--destructive          4 86% 58%   #F04438
--info               213 94% 58%   #2E90FA
--ring               214 81% 51%            brand-blue focus
rail.DEFAULT         #0A1228                 sidebar
brand gradient       #1A74E8 → #5A60F2 → #8A50F8
```

Brand-gradient helpers (defined in `index.css`): `.bg-brand-gradient`,
`.text-brand-gradient`, `.border-brand-gradient`.
