import * as React from 'react';
import { animate } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Animated count-up for a metric. Eases from 0 (or the previous value) to `value`
 * with a Stripe-style spring-out curve; respects `prefers-reduced-motion` by jumping
 * straight to the final value. Pure presentation — no data side effects.
 */
export function CountUp({
  value,
  format,
  duration = 0.9,
  className,
}: {
  value: number;
  /** Optional formatter applied to each interpolated frame (e.g. formatCount). */
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}): JSX.Element {
  const ref = React.useRef<HTMLSpanElement>(null);
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString('en-IN'));
  const prev = React.useRef(0);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      node.textContent = fmt(value);
      prev.current = value;
      return;
    }
    const from = prev.current;
    const controls = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = fmt(v);
      },
    });
    prev.current = value;
    return () => controls.stop();
    // Intentionally keyed on `value` only — `fmt`/`duration` are stable for a given metric.
  }, [value]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {fmt(0)}
    </span>
  );
}
