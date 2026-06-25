/**
 * Per-recipient template variable merge-tag resolver.
 *
 * This module is SHARED on purpose: the server campaign send loop and the client create-campaign
 * live-preview both import it, so the two can never drift (especially once {{contact.attributes.*}}
 * is added — it changes in exactly one place here).
 *
 * A campaign stores RAW variable strings. Each is either a KNOWN merge tag that resolves to a
 * contact field at send time, or a LITERAL that is passed through verbatim (the original Phase-1.2
 * behaviour). Resolution is per recipient and happens at send time on the server; the client
 * mirrors it for preview by calling the same functions.
 *
 * Pure: no Firestore, no Meta, no HTTP, no AppError — just string -> string against a MergeContact.
 * Keeping it dependency-free is what lets it live in `shared` and unit-test cleanly, and keeps all
 * merge logic OUT of the provider-isolation boundary (nothing here touches metaCloud).
 */

/** The contact fields a merge tag may resolve against. `phone` is always present for a recipient. */
export interface MergeContact {
  name?: string;
  phone: string;
}

/**
 * Universal non-empty fallback. Meta returns HTTP 400 on an empty body parameter, so any value
 * that resolves to empty is replaced with this. It is also the missing/empty-name value
 * (reads naturally in "Hi there").
 */
export const MERGE_FALLBACK = 'there';

/** Defensive cap on a resolved body-parameter length (WhatsApp Cloud API hygiene). */
const MAX_PARAM_LENGTH = 60;

/** A variable that IS exactly a known merge tag: {{contact.name}} / {{contact.phone}} (space/case tolerant). */
const KNOWN_TAG_RE = /^\{\{\s*contact\.(name|phone)\s*\}\}$/i;

/** Matches a contact merge tag ANYWHERE in a value — used for create-time audience validation. */
const MERGE_TAG_RE = /\{\{\s*contact\.\w+\s*\}\}/i;

/** Matches ANY leftover {{...}} placeholder after resolution (an unresolved / unknown tag). */
const UNRESOLVED_RE = /\{\{.*?\}\}/;

/**
 * True if a raw variable contains a contact merge tag (e.g. an inserted/typed {{contact.name}}).
 * Used at campaign creation to reject merge tags for a "paste numbers" audience, which has no
 * contact records to resolve against.
 */
export function containsMergeTag(value: string): boolean {
  return MERGE_TAG_RE.test(value);
}

/**
 * WhatsApp Cloud API body-parameter hygiene applied to every resolved value: collapse each
 * whitespace run — newlines, tabs, and the "4+ consecutive spaces" case — to a single space,
 * trim, then cap at 60 chars (re-trimming any space exposed by the cut).
 */
export function sanitizeParam(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_PARAM_LENGTH).trim();
}

/**
 * Resolve ONE raw variable against a contact:
 *  - {{contact.name}}  -> contact.name  (or MERGE_FALLBACK when missing/empty)
 *  - {{contact.phone}} -> contact.phone
 *  - anything else     -> the literal text, verbatim (current behaviour)
 *
 * The result is always sanitised and never empty (an empty result -> MERGE_FALLBACK). An unknown
 * tag like {{contact.email}} does NOT match a known tag, so it falls through as a literal and is
 * caught later by hasUnresolvedTag (the send loop then skips that recipient).
 */
export function resolveVariable(raw: string, contact: MergeContact): string {
  const tag = raw.match(KNOWN_TAG_RE);
  let resolved: string;
  if (tag) {
    const field = tag[1].toLowerCase();
    resolved = field === 'name' ? contact.name ?? '' : contact.phone;
  } else {
    resolved = raw;
  }
  const clean = sanitizeParam(resolved);
  return clean.length > 0 ? clean : MERGE_FALLBACK;
}

/** True if a (resolved) value still carries a {{...}} placeholder — i.e. an unresolvable tag. */
export function hasUnresolvedTag(value: string): boolean {
  return UNRESOLVED_RE.test(value);
}

/**
 * Resolve every variable for one recipient. `unresolved` is true when ANY resolved value still
 * carries a {{...}} placeholder (an unknown tag the send loop must skip rather than deliver a raw
 * "{{...}}" to a customer).
 */
export function resolveRecipientVariables(
  rawVars: string[],
  contact: MergeContact,
): { variables: string[]; unresolved: boolean } {
  const variables = rawVars.map((v) => resolveVariable(v, contact));
  return { variables, unresolved: variables.some(hasUnresolvedTag) };
}
