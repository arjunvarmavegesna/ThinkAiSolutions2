/**
 * RechargeModal — collects a rupee amount, creates a Razorpay order on the server,
 * and launches Razorpay Checkout for the GST-inclusive total.
 *
 * MONEY RULE: the user types rupees; we convert to integer paise at the edge with
 * rupeesToPaise before anything leaves the browser. The server adds 18% GST on top
 * of that credit and returns the exact amount to charge.
 *
 * The wallet is credited only by the verified `payment.captured` webhook — never
 * from this component. On a successful client payment we simply call onProcessing
 * so the page can show a "processing" hint until the webhook updates the balance.
 */
import { useMemo, useState } from 'react';
import { gstOnPaise, rupeesToPaise } from '@thinkai/shared';
import { ApiError } from '../../lib/apiClient';
import { createRechargeOrder } from './api';
import { formatPaise } from './format';
import { useRazorpayCheckout } from './useRazorpayCheckout';

interface RechargeModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after the user completes payment; balance still credits via webhook. */
  onProcessing: () => void;
  prefill?: { name?: string; email?: string };
}

/** Quick-pick rupee amounts offered as one-tap buttons. */
const QUICK_AMOUNTS = [500, 1000, 2500, 5000];

export function RechargeModal({ open, onClose, onProcessing, prefill }: RechargeModalProps) {
  const [rupeesInput, setRupeesInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { ready, loadError, openCheckout } = useRazorpayCheckout();

  // Parse the rupee field into integer paise; invalid/blank => null.
  const creditPaise = useMemo(() => {
    const rupees = Number(rupeesInput);
    if (!rupeesInput.trim() || !Number.isFinite(rupees) || rupees <= 0) return null;
    return rupeesToPaise(rupees);
  }, [rupeesInput]);

  // Client-side GST preview only (the server recomputes authoritatively).
  const gstPaise = creditPaise === null ? 0 : gstOnPaise(creditPaise);
  const totalPaise = creditPaise === null ? 0 : creditPaise + gstPaise;

  if (!open) return null;

  const resetAndClose = () => {
    setRupeesInput('');
    setError(null);
    setSubmitting(false);
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (creditPaise === null) {
      setError('Enter a valid amount in rupees.');
      return;
    }
    if (!ready) {
      setError(loadError ?? 'Payment gateway is still loading. Please try again.');
      return;
    }

    setSubmitting(true);
    try {
      const order = await createRechargeOrder({ creditPaise });

      openCheckout({
        orderId: order.orderId,
        amountPaise: order.amountPaise,
        currency: order.currency,
        keyId: order.keyId,
        prefill: { name: prefill?.name, email: prefill?.email },
        onSuccess: () => {
          // Funds captured client-side; the webhook will credit the wallet.
          onProcessing();
          resetAndClose();
        },
        onDismiss: () => {
          // User closed Checkout (or it failed) without a captured payment.
          setSubmitting(false);
        },
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not start the recharge. Please try again.';
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recharge-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 id="recharge-modal-title" className="text-lg font-semibold text-slate-900">
            Recharge wallet
          </h2>
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="recharge-amount" className="block text-sm font-medium text-slate-700">
              Amount to credit (₹)
            </label>
            <input
              id="recharge-amount"
              type="number"
              inputMode="decimal"
              min="1"
              step="1"
              value={rupeesInput}
              onChange={(e) => setRupeesInput(e.target.value)}
              placeholder="e.g. 1000"
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setRupeesInput(String(amount))}
                className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-600 transition hover:border-teal-500 hover:text-teal-700"
              >
                ₹{amount.toLocaleString('en-IN')}
              </button>
            ))}
          </div>

          {/* GST preview — server recomputes authoritatively at order time. */}
          <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Credit</span>
              <span>{creditPaise === null ? '—' : formatPaise(creditPaise)}</span>
            </div>
            <div className="mt-1 flex justify-between text-slate-600">
              <span>GST (18%)</span>
              <span>{creditPaise === null ? '—' : formatPaise(gstPaise)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
              <span>You pay</span>
              <span>{creditPaise === null ? '—' : formatPaise(totalPaise)}</span>
            </div>
          </div>

          {(error || loadError) && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error ?? loadError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || creditPaise === null}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Opening checkout…' : 'Pay with Razorpay'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
