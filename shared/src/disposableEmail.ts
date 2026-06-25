/**
 * Disposable / throwaway email detection — shared by the server (authoritative reject in the
 * self-serve provision controller) and the client (instant feedback on the signup form), so
 * both sides judge an address the same way from ONE source of truth.
 *
 * The list is a curated set of the most common throwaway providers, not exhaustive. For full
 * coverage you can later replace `DISPOSABLE_EMAIL_DOMAINS` with the maintained
 * `disposable-email-domains` dataset (https://github.com/disposable-email-domains) — the
 * `isDisposableEmail` contract stays the same.
 */

/** Common disposable inbox domains (lowercase, no leading dot). */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  '0815.ru',
  '10minutemail.com',
  '20minutemail.com',
  '33mail.com',
  'discard.email',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'inboxbear.com',
  'mail-temp.com',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mintemail.com',
  'mohmal.com',
  'moakt.com',
  'mytemp.email',
  'sharklasers.com',
  'spam4.me',
  'temp-mail.org',
  'tempmail.com',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
]);

/** Extract the lowercased domain (part after the last `@`), or '' if the address is malformed. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * True if the address belongs to a known disposable provider. Matches the exact domain and any
 * subdomain of a listed domain (e.g. `foo.mailinator.com` -> blocked via `mailinator.com`).
 */
export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;
  // Catch subdomains: walk up the labels (a.b.mailinator.com -> b.mailinator.com -> mailinator.com).
  const labels = domain.split('.');
  for (let i = 1; i < labels.length - 1; i += 1) {
    if (DISPOSABLE_EMAIL_DOMAINS.has(labels.slice(i).join('.'))) return true;
  }
  return false;
}
