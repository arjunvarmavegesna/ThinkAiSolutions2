/**
 * Phone-number helpers shared across client + server. Pure + dependency-free.
 */

/**
 * Normalize a phone number to E.164 form (a leading '+' followed by digits) for sending to the
 * WhatsApp Cloud API. Strips spaces, dashes, parens, and any stray '+'.
 *
 * NON-THROWING by design: if the input has no digits at all (empty/garbage) the trimmed input is
 * returned unchanged, so hot paths like inbound-webhook ingest never blow up on odd data.
 *
 * Examples:
 *   '919391714623'      -> '+919391714623'
 *   '+91 93917-14623'   -> '+919391714623'
 *   '+919391714623'     -> '+919391714623'
 *   ''                  -> ''
 */
export function toE164(phone: string): string {
  const trimmed = (phone ?? '').trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  return digits.length > 0 ? `+${digits}` : trimmed;
}
