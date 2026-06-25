/**
 * Wallet API surface — thin typed wrappers over the shared apiClient.
 * The client never reads Firestore; every wallet datum flows through these calls.
 */
import type {
  CreateRechargeOrderRequest,
  CreateRechargeOrderResponse,
  CreateSubscriptionOrderResponse,
  GetSubscriptionResponse,
  ListInvoicesResponse,
  ListWalletTransactionsResponse,
  WalletBalanceResponse,
} from '@thinkai/shared';
import { apiClient } from '../../lib/apiClient';

/** GET /api/wallet/balance -> current tenant wallet balance in paise. */
export function getWalletBalance(): Promise<WalletBalanceResponse> {
  return apiClient.get<WalletBalanceResponse>('/wallet/balance');
}

/**
 * GET /api/wallet/transactions -> cursor-paginated wallet ledger.
 * Pass the previous response's nextCursor to fetch the following page.
 */
export function getWalletTransactions(
  cursor?: string,
): Promise<ListWalletTransactionsResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiClient.get<ListWalletTransactionsResponse>(`/wallet/transactions${query}`);
}

/**
 * POST /api/wallet/recharge/order — create a Razorpay order for a desired credit.
 * The desired credit is the taxable base in paise; the server adds 18% GST on top
 * and returns the total amount the client must actually pay via Checkout.
 */
export function createRechargeOrder(
  request: CreateRechargeOrderRequest,
): Promise<CreateRechargeOrderResponse> {
  return apiClient.post<CreateRechargeOrderResponse>('/wallet/recharge/order', request);
}

// ---- Subscription (flat ₹2,500/month plan; replaced wallet recharge) ----

/** GET /api/subscription -> current subscription status + the fixed monthly price split. */
export function getSubscription(): Promise<GetSubscriptionResponse> {
  return apiClient.get<GetSubscriptionResponse>('/subscription');
}

/** POST /api/subscription/order -> a Razorpay order for one ₹2,950 monthly renewal. */
export function createSubscriptionOrder(): Promise<CreateSubscriptionOrderResponse> {
  return apiClient.post<CreateSubscriptionOrderResponse>('/subscription/order', {});
}

/** GET /api/subscription/invoices -> GST invoice history (newest first), cursor-paginated. */
export function getSubscriptionInvoices(cursor?: string): Promise<ListInvoicesResponse> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return apiClient.get<ListInvoicesResponse>(`/subscription/invoices${query}`);
}
