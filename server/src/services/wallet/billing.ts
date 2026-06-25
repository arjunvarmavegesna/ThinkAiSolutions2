/**
 * Pure billing math. No I/O — these functions are deterministic and unit-testable.
 *
 * CONFIRMED BILLING RULES (Phase 1):
 * - Per-message debit is the BARE tenant rate for the message category (NO GST on debit).
 *   'service' messages (free-text inside the 24h window) are free.
 * - GST (18%) is charged ONCE, at recharge, ON TOP of the desired credit. The client pays
 *   credit + GST; the wallet is credited only the NET credit.
 *
 * All amounts are INTEGER paise. We never use floats for money.
 */

import { gstOnPaise } from '@thinkai/shared';
import type { MessageCategory, Pricing } from '@thinkai/shared';

/**
 * Bare charge (in paise) for a single outbound message of the given category.
 * 'service' is free. Marketing/utility/authentication map to the tenant's per-category rate.
 * No GST is added here — per-message debits carry NO tax (see CONFIRMED BILLING RULES).
 */
export function computeCharge(category: MessageCategory, pricing: Pricing): number {
  switch (category) {
    case 'marketing':
      return pricing.marketingPaise;
    case 'utility':
      return pricing.utilityPaise;
    case 'authentication':
      return pricing.authPaise;
    case 'service':
      return 0;
    default:
      // Exhaustiveness guard: any new category must be priced explicitly above.
      return 0;
  }
}

/** Result of splitting a desired wallet credit into credit + GST + total to pay. */
export interface RechargeBreakdown {
  /** NET credit the wallet receives (the taxable base). */
  creditPaise: number;
  /** 18% GST charged on top of the credit. */
  gstPaise: number;
  /** What the client actually pays via Razorpay = creditPaise + gstPaise. */
  totalPaise: number;
}

/**
 * Split a desired wallet credit into its credit + GST + grand-total components.
 * GST is added ON TOP of the credit (so the wallet still receives the full creditPaise).
 */
export function computeRechargeBreakdown(creditPaise: number): RechargeBreakdown {
  const gstPaise = gstOnPaise(creditPaise);
  return {
    creditPaise,
    gstPaise,
    totalPaise: creditPaise + gstPaise,
  };
}
