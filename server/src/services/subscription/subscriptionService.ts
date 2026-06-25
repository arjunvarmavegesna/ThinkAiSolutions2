/**
 * Flat ₹2,500/month subscription — the gate that REPLACED per-message wallet billing.
 *
 * A tenant may send messages only while `subscriptionCurrentPeriodEnd > now`. Paying the monthly
 * renewal (₹2,500 + 18% GST = ₹2,950 via Razorpay) extends that period by one month. There is no
 * per-message debit anymore — every outbound message is recorded with costPaise = 0.
 *
 * All amounts are INTEGER paise; all timestamps are epoch milliseconds.
 */

import { SUBSCRIPTION_PRICE_PAISE, gstOnPaise } from '@thinkai/shared';
import type { SubscriptionDTO, SubscriptionStatus } from '@thinkai/shared';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';

/** Fixed monthly price split, derived once from the single shared constant. */
export const SUBSCRIPTION_BASE_PAISE = SUBSCRIPTION_PRICE_PAISE; // ₹2,500
export const SUBSCRIPTION_GST_PAISE = gstOnPaise(SUBSCRIPTION_PRICE_PAISE); // ₹450
export const SUBSCRIPTION_TOTAL_PAISE = SUBSCRIPTION_BASE_PAISE + SUBSCRIPTION_GST_PAISE; // ₹2,950

/** Same calendar day next month (JS rolls short months over, e.g. Jan 31 -> Mar 3). */
function addOneMonth(fromMs: number): number {
  const d = new Date(fromMs);
  d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

/** The tenant's current period end (epoch ms); 0 when the tenant/row is missing or never paid. */
async function periodEnd(tenantId: string): Promise<number> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionCurrentPeriodEnd: true },
  });
  return row ? Number(row.subscriptionCurrentPeriodEnd) : 0;
}

/** True while the tenant is inside a paid month. */
export async function isActive(tenantId: string, now: number = Date.now()): Promise<boolean> {
  return (await periodEnd(tenantId)) > now;
}

/**
 * Gate an outbound send. Throws 402 'subscription_inactive' when the tenant has no active
 * subscription, so the caller never reaches the BSP. This replaced the wallet-balance check.
 */
export async function assertActive(tenantId: string): Promise<void> {
  if (!(await isActive(tenantId))) {
    throw AppError.paymentRequired(
      'No active subscription — renew the ₹2,500/month plan to send messages.',
      'subscription_inactive',
    );
  }
}

/** Current subscription state + the fixed price split, for the Billing screen. */
export async function getSubscription(tenantId: string): Promise<SubscriptionDTO> {
  const now = Date.now();
  const currentPeriodEnd = await periodEnd(tenantId);
  const active = currentPeriodEnd > now;
  return {
    status: (active ? 'active' : 'inactive') as SubscriptionStatus,
    currentPeriodEnd,
    active,
    pricePaise: SUBSCRIPTION_BASE_PAISE,
    gstPaise: SUBSCRIPTION_GST_PAISE,
    totalPaise: SUBSCRIPTION_TOTAL_PAISE,
  };
}

/**
 * Apply one verified monthly payment: flip status to active and extend the access period by one
 * month from the LATER of (now, current period end) — so paying early stacks the new month on top
 * rather than truncating remaining time. Per-payment idempotency is enforced upstream by the
 * Razorpay webhook's processedEvents gate, so this is called at most once per captured payment.
 */
export async function applyMonthlyPayment(
  tenantId: string,
  paymentTs: number = Date.now(),
): Promise<{ currentPeriodEnd: number }> {
  const base = Math.max(await periodEnd(tenantId), paymentTs);
  const nextEnd = addOneMonth(base);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      subscriptionStatus: 'active',
      subscriptionCurrentPeriodEnd: msBig(nextEnd),
    },
  });
  return { currentPeriodEnd: nextEnd };
}
