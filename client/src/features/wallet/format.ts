/**
 * Display formatters for the wallet UI.
 *
 * MONEY RULE: amounts on the wire are always INTEGER paise. We only ever convert
 * to rupees at the very edge, for display. Use paiseToRupees from @thinkai/shared
 * so the conversion logic lives in exactly one place.
 */
import { paiseToRupees } from '@thinkai/shared';

/** INR currency formatter (₹, two decimals, Indian grouping). */
const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format integer paise as a localized ₹ string, e.g. 123450 -> "₹1,234.50". */
export function formatPaise(paise: number): string {
  return inrFormatter.format(paiseToRupees(paise));
}

/** Format epoch milliseconds as a readable local date + time. */
export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Human label for a wallet transaction type. */
export function txnTypeLabel(type: string): string {
  switch (type) {
    case 'recharge':
      return 'Recharge';
    case 'debit':
      return 'Message charge';
    case 'refund':
      return 'Refund';
    default:
      return type;
  }
}

/**
 * Whether a transaction adds to the balance (recharge/refund) vs removes (debit).
 * Used purely to pick the +/- sign and color in the history table.
 */
export function isCredit(type: string): boolean {
  return type === 'recharge' || type === 'refund';
}
