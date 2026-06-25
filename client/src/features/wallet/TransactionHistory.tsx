/**
 * TransactionHistory — cursor-paginated wallet ledger. Loads the first page on
 * mount and appends further pages via a "Load more" button driven by nextCursor.
 *
 * The list is read-only and tenant-scoped on the server; the client only renders
 * what /api/wallet/transactions returns.
 */
import { useCallback, useEffect, useState } from 'react';
import type { WalletTransactionDTO } from '@thinkai/shared';
import { ApiError } from '../../lib/apiClient';
import { getWalletTransactions } from './api';
import { formatPaise, formatTimestamp, isCredit, txnTypeLabel } from './format';

export interface TransactionHistoryHandle {
  /** Allows the parent to reload the ledger (e.g. after a recharge completes). */
  reload: () => void;
}

interface TransactionHistoryProps {
  /** Bump this number to force a fresh reload from the first page. */
  reloadToken?: number;
}

export function TransactionHistory({ reloadToken = 0 }: TransactionHistoryProps) {
  const [items, setItems] = useState<WalletTransactionDTO[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  /** Fetch one page; when `reset` is true we replace, otherwise we append. */
  const loadPage = useCallback(async (nextCursor: string | undefined, reset: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getWalletTransactions(nextCursor);
      setItems((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
      setInitialized(true);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not load transactions.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and forced reloads (reloadToken changes) start from the first page.
  useEffect(() => {
    void loadPage(undefined, true);
  }, [loadPage, reloadToken]);

  const hasMore = cursor !== undefined;

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-card">
      <div className="h-[3px] w-full bg-brand-500" />
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-base font-semibold text-brand-600">Transaction History</h2>
      </div>

      {error && (
        <div className="px-6 py-4">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        </div>
      )}

      {initialized && items.length === 0 && !error ? (
        <p className="px-6 py-10 text-center text-sm text-slate-400">
          No transactions yet. Recharge your wallet to get started.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Reference</th>
                <th className="px-6 py-3 text-right">Amount</th>
                <th className="px-6 py-3 text-right">Balance after</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((txn) => {
                const credit = isCredit(txn.type);
                const sign = credit ? '+' : '−';
                return (
                  <tr key={txn.id} className="text-slate-700">
                    <td className="whitespace-nowrap px-6 py-3 text-slate-500">
                      {formatTimestamp(txn.ts)}
                    </td>
                    <td className="px-6 py-3">{txnTypeLabel(txn.type)}</td>
                    <td className="max-w-[12rem] truncate px-6 py-3 font-mono text-xs text-slate-400">
                      {txn.ref}
                    </td>
                    <td
                      className={`whitespace-nowrap px-6 py-3 text-right font-medium ${
                        credit ? 'text-emerald-600' : 'text-slate-900'
                      }`}
                    >
                      {sign}
                      {formatPaise(txn.amountPaise)}
                      {txn.gstPaise > 0 && (
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          (+{formatPaise(txn.gstPaise)} GST)
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-right text-slate-500">
                      {formatPaise(txn.balanceAfter)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-center border-t border-slate-100 px-6 py-4">
        {hasMore ? (
          <button
            type="button"
            onClick={() => void loadPage(cursor, false)}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        ) : (
          loading && <span className="text-sm text-slate-400">Loading…</span>
        )}
      </div>
    </section>
  );
}
