/**
 * useRazorpayCheckout — lazily loads the Razorpay Checkout script and exposes an
 * `openCheckout` function that launches the hosted payment modal for a given order.
 *
 * IMPORTANT: the wallet balance is NEVER credited from the browser. After the user
 * pays, Razorpay redirects the funds and fires a server-side `payment.captured`
 * webhook; only that verified webhook credits the wallet. The browser-side
 * `handler` callback here is used purely to flip the UI into a "processing" state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/** Minimal shape of the global Razorpay constructor we rely on. */
interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
}

interface RazorpayConstructor {
  new (options: RazorpayCheckoutOptions): RazorpayInstance;
}

interface RazorpayCheckoutOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
}

/** Fields Razorpay returns to the client handler on a successful payment. */
export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

/** Arguments to launch a single checkout session. */
export interface OpenCheckoutArgs {
  orderId: string;
  /** Amount the client pays (creditPaise + gstPaise), in integer paise. */
  amountPaise: number;
  currency: string;
  keyId: string;
  prefill?: { name?: string; email?: string; contact?: string };
  /** Fired after a successful client-side payment (wallet still credits via webhook). */
  onSuccess?: (response: RazorpaySuccessResponse) => void;
  /** Fired if the user closes the Checkout modal without paying. */
  onDismiss?: () => void;
}

interface UseRazorpayCheckoutResult {
  /** True once the Checkout script has finished loading. */
  ready: boolean;
  /** Non-null if the script failed to load (offline / blocked). */
  loadError: string | null;
  /** Launches the hosted Razorpay modal for the given order. */
  openCheckout: (args: OpenCheckoutArgs) => void;
}

/** Inject the Razorpay script once and resolve when it is available on window. */
function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Razorpay Checkout is only available in the browser.'));
      return;
    }
    if (window.Razorpay) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Razorpay Checkout.')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout.'));
    document.body.appendChild(script);
  });
}

export function useRazorpayCheckout(): UseRazorpayCheckoutResult {
  const [ready, setReady] = useState<boolean>(() => typeof window !== 'undefined' && !!window.Razorpay);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    loadRazorpayScript()
      .then(() => {
        if (mounted.current) setReady(true);
      })
      .catch((err: unknown) => {
        if (mounted.current) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load Razorpay Checkout.');
        }
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  const openCheckout = useCallback((args: OpenCheckoutArgs) => {
    if (typeof window === 'undefined' || !window.Razorpay) {
      setLoadError('Razorpay Checkout is not available yet. Please try again.');
      return;
    }

    const options: RazorpayCheckoutOptions = {
      key: args.keyId,
      order_id: args.orderId,
      amount: args.amountPaise,
      currency: args.currency,
      name: 'ThinkAiSolutions',
      description: 'Wallet recharge',
      prefill: args.prefill,
      theme: { color: '#0f766e' },
      handler: (response: RazorpaySuccessResponse) => {
        args.onSuccess?.(response);
      },
      modal: {
        ondismiss: () => {
          args.onDismiss?.();
        },
      },
    };

    const checkout = new window.Razorpay(options);
    // Surface gateway-side failures back to the dismiss path so the UI can recover.
    checkout.on('payment.failed', () => {
      args.onDismiss?.();
    });
    checkout.open();
  }, []);

  return { ready, loadError, openCheckout };
}
