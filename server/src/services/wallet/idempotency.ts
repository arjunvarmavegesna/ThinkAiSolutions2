/**
 * Deterministic wallet-transaction document ids.
 *
 * IDEMPOTENCY MODEL: every wallet mutation writes its walletTransaction at a doc id that is
 * a pure function of its natural key (the messageId for debits/refunds, the Razorpay
 * payment id for recharges). Because Firestore writes inside a runTransaction are
 * conditional on the current snapshot, re-processing the same event simply finds the txn
 * doc already present and becomes a no-op. No separate dedup table is needed for the wallet.
 */

/** Debit row for an outbound billable message. Natural key = messageId. */
export const debitTxnId = (messageId: string): string => `debit_${messageId}`;

/** Recharge row for a captured Razorpay payment. Natural key = razorpay_payment_id. */
export const rechargeTxnId = (paymentId: string): string => `recharge_${paymentId}`;

/** Refund row reversing a prior message debit. Natural key = messageId. */
export const refundTxnId = (messageId: string): string => `refund_${messageId}`;
