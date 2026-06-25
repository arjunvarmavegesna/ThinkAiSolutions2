/**
 * BalanceCard — prominent display of the tenant's current wallet balance with a
 * call-to-action to recharge. The balance is authoritative only via the server;
 * after a payment the parent shows a "processing" hint until the webhook lands.
 */
import { formatPaise } from './format';

interface BalanceCardProps {
  balancePaise: number | null;
  loading: boolean;
  /** Shown while we wait for the recharge webhook to credit the wallet. */
  processing: boolean;
  onRecharge: () => void;
  onRefresh: () => void;
}

export function BalanceCard({
  balancePaise,
  loading,
  processing,
  onRecharge,
  onRefresh,
}: BalanceCardProps) {
  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-card">
      <div className="h-[3px] w-full bg-brand-500" />
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">Wallet balance</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-900">
            {loading || balancePaise === null ? (
              <span className="inline-block h-9 w-40 animate-pulse rounded bg-slate-200" />
            ) : (
              formatPaise(balancePaise)
            )}
          </p>
          {processing && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              Payment received — your balance will update shortly.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onRecharge}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Recharge
          </button>
        </div>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Messages are debited per send. Recharge adds the credit you choose plus 18% GST,
          charged once at payment.
        </p>
      </div>
    </section>
  );
}
