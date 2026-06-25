/**
 * WalletPage — the tenant-admin wallet view. Shows the current balance, a recharge
 * flow (Razorpay), and a paginated transaction history.
 *
 * Balance truth comes from the server: a recharge is only reflected once the
 * verified `payment.captured` webhook credits the wallet. After the user pays we
 * flip into a "processing" state and poll the balance a few times so the new
 * amount appears as soon as the webhook lands, without a manual refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../auth/useAuth';
import { getWalletBalance } from './api';
import { BalanceCard } from './BalanceCard';
import { RechargeModal } from './RechargeModal';
import { TransactionHistory } from './TransactionHistory';

/** How long (ms) we keep polling for the post-payment balance update. */
const PROCESSING_POLL_INTERVAL_MS = 4000;
const PROCESSING_POLL_MAX = 8; // ~32s total

export function WalletPage() {
  const { user } = useAuth();

  const [balancePaise, setBalancePaise] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Bumping this forces TransactionHistory to reload from page 1.
  const [historyReloadToken, setHistoryReloadToken] = useState(0);

  // Track the balance at the moment payment started so we can detect the webhook credit.
  const processingBaselineRef = useRef<number | null>(null);
  const pollCountRef = useRef(0);

  const fetchBalance = useCallback(async (): Promise<number | null> => {
    setBalanceError(null);
    try {
      const res = await getWalletBalance();
      setBalancePaise(res.balancePaise);
      return res.balancePaise;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not load wallet balance.';
      setBalanceError(message);
      return null;
    } finally {
      setLoadingBalance(false);
    }
  }, []);

  // Initial balance load.
  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  // While "processing", poll the balance until it changes (webhook credited) or we
  // exhaust the poll budget. Refresh the history once the credit is observed.
  useEffect(() => {
    if (!processing) return;

    pollCountRef.current = 0;
    const interval = setInterval(async () => {
      pollCountRef.current += 1;
      const latest = await fetchBalance();

      const baseline = processingBaselineRef.current;
      const credited = latest !== null && baseline !== null && latest > baseline;

      if (credited || pollCountRef.current >= PROCESSING_POLL_MAX) {
        setProcessing(false);
        processingBaselineRef.current = null;
        if (credited) {
          // The new recharge txn should now be visible — reload the ledger.
          setHistoryReloadToken((t) => t + 1);
        }
      }
    }, PROCESSING_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [processing, fetchBalance]);

  const handleProcessing = useCallback(() => {
    // Remember the pre-payment balance so we can detect the webhook credit.
    processingBaselineRef.current = balancePaise;
    setProcessing(true);
    // Optimistically reload history too — the recharge row may already be written.
    setHistoryReloadToken((t) => t + 1);
  }, [balancePaise]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-baseline gap-2 text-sm text-gray-500">
        <span className="text-lg font-semibold text-gray-800">Wallet</span>
        <span>›</span>
        <span>Balance &amp; Recharge</span>
      </div>

      {balanceError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{balanceError}</p>
      )}

      <BalanceCard
        balancePaise={balancePaise}
        loading={loadingBalance}
        processing={processing}
        onRecharge={() => setRechargeOpen(true)}
        onRefresh={() => {
          setLoadingBalance(true);
          void fetchBalance();
        }}
      />

      <TransactionHistory reloadToken={historyReloadToken} />

      <RechargeModal
        open={rechargeOpen}
        onClose={() => setRechargeOpen(false)}
        onProcessing={handleProcessing}
        prefill={{
          name: user?.displayName ?? undefined,
          email: user?.email ?? undefined,
        }}
      />
    </div>
  );
}

export default WalletPage;
