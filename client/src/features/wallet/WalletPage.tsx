/**
 * Billing page (tenant-admin) — the flat ₹2,500/month subscription that replaced the
 * per-message wallet. Shows the current status + renewal date, a one-tap "Pay ₹2,950"
 * (₹2,500 + 18% GST) Razorpay flow, and the GST invoice history.
 *
 * Truth comes from the server: a payment only takes effect once the verified
 * `payment.captured` webhook extends the period. After the user pays we poll the
 * subscription a few times so the new renewal date appears without a manual refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { InvoiceDTO, SubscriptionDTO } from '@thinkai/shared';
import { ApiError } from '../../lib/apiClient';
import { useAuth } from '../../auth/useAuth';
import { getSubscription, createSubscriptionOrder, getSubscriptionInvoices } from './api';
import { formatPaise } from './format';
import { useRazorpayCheckout } from './useRazorpayCheckout';

const POLL_INTERVAL_MS = 4000;
const POLL_MAX = 8; // ~32s

/** Format an epoch-ms date as e.g. "25 Jun 2026". */
function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function WalletPage() {
  const { user } = useAuth();
  const { ready, loadError, openCheckout } = useRazorpayCheckout();

  const [sub, setSub] = useState<SubscriptionDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<InvoiceDTO[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);

  const baselineEndRef = useRef<number>(0);
  const pollCountRef = useRef(0);

  const loadSub = useCallback(async (): Promise<SubscriptionDTO | null> => {
    try {
      const res = await getSubscription();
      setSub(res);
      setError(null);
      return res;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load subscription.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    try {
      const res = await getSubscriptionInvoices();
      setInvoices(res.items);
    } catch {
      // Non-fatal: the page still works without the history list.
    }
  }, []);

  useEffect(() => {
    void loadSub();
    void loadInvoices();
  }, [loadSub, loadInvoices]);

  // After payment, poll until the period extends (webhook applied) or the budget runs out.
  useEffect(() => {
    if (!processing) return;
    pollCountRef.current = 0;
    const interval = setInterval(async () => {
      pollCountRef.current += 1;
      const latest = await loadSub();
      const extended = latest !== null && latest.currentPeriodEnd > baselineEndRef.current;
      if (extended || pollCountRef.current >= POLL_MAX) {
        setProcessing(false);
        if (extended) void loadInvoices();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [processing, loadSub, loadInvoices]);

  const handlePay = useCallback(async () => {
    if (!sub) return;
    setError(null);
    if (!ready) {
      setError(loadError ?? 'Payment gateway is still loading. Please try again.');
      return;
    }
    setSubmitting(true);
    try {
      const order = await createSubscriptionOrder();
      baselineEndRef.current = sub.currentPeriodEnd;
      openCheckout({
        orderId: order.orderId,
        amountPaise: order.amountPaise,
        currency: order.currency,
        keyId: order.keyId,
        prefill: { name: user?.displayName ?? undefined, email: user?.email ?? undefined },
        onSuccess: () => {
          setSubmitting(false);
          setProcessing(true);
        },
        onDismiss: () => setSubmitting(false),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the payment. Please try again.');
      setSubmitting(false);
    }
  }, [sub, ready, loadError, openCheckout, user]);

  const active = sub?.active ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your WhatsApp Business plan — a flat monthly subscription with unlimited messaging.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-emphasis">
          {error}
        </p>
      )}

      {/* Plan card */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">Monthly plan</h2>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      active
                        ? 'border-success/20 bg-success/10 text-success-emphasis'
                        : 'border-border bg-secondary/60 text-muted-foreground'
                    }`}
                  >
                    <span className={`size-1.5 rounded-full ${active ? 'bg-success' : 'bg-muted-foreground'}`} />
                    {active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {active && sub
                    ? <>Renews / expires on <span className="font-medium text-foreground">{formatDate(sub.currentPeriodEnd)}</span></>
                    : 'No active subscription — pay to start sending messages.'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold text-foreground">
                  {sub ? formatPaise(sub.totalPaise) : '—'}
                  <span className="text-sm font-normal text-muted-foreground">/month</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {sub ? `${formatPaise(sub.pricePaise)} + ${formatPaise(sub.gstPaise)} GST` : ''}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={handlePay}
                disabled={submitting || processing || !sub}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processing
                  ? 'Confirming payment…'
                  : submitting
                    ? 'Opening checkout…'
                    : active
                      ? `Renew — pay ${sub ? formatPaise(sub.totalPaise) : ''}`
                      : `Subscribe — pay ${sub ? formatPaise(sub.totalPaise) : ''}`}
              </button>
              {processing && (
                <span className="text-xs text-muted-foreground">Waiting for payment confirmation…</span>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Paying adds one month from {active ? 'your current renewal date' : 'today'}. Unlimited messages; WhatsApp/Meta charges are included.
            </p>
          </>
        )}
      </div>

      {/* Invoice history */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Invoices</h2>
        </div>
        {invoices.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{inv.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(inv.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-foreground">
                    {formatPaise(inv.taxableAmountPaise + inv.gstTotalPaise)}
                  </p>
                  <p className="text-xs text-muted-foreground">incl. {formatPaise(inv.gstTotalPaise)} GST</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default WalletPage;
