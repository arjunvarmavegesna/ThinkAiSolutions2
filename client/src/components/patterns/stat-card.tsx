import * as React from 'react';
import { animate } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Animated count-up for a metric; respects reduced-motion (jumps to final). */
function CountUp({ value, format }: { value: number; format?: (n: number) => string }): JSX.Element {
  const ref = React.useRef<HTMLSpanElement>(null);
  const fmt = format ?? ((n: number) => Math.round(n).toLocaleString('en-IN'));
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      node.textContent = fmt(value);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = fmt(v);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span ref={ref} className="tabular-nums">{fmt(0)}</span>;
}

export interface StatCardProps {
  label: string;
  value: number | string;
  /** Optional count-up formatter; only used when `value` is a number. */
  format?: (n: number) => string;
  /** Signed percentage/point delta vs. the prior period. */
  delta?: number;
  deltaSuffix?: string;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  format,
  delta,
  deltaSuffix = '%',
  hint,
  icon,
  className,
}: StatCardProps): JSX.Element {
  const positive = (delta ?? 0) >= 0;
  return (
    <Card className={cn('p-5 transition-shadow hover:shadow-md', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-3xl font-semibold leading-none tracking-tight text-foreground">
          {typeof value === 'number' ? <CountUp value={value} format={format} /> : value}
        </span>
        {typeof delta === 'number' && (
          <span
            className={cn(
              'mb-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium',
              positive ? 'bg-success/10 text-success-emphasis' : 'bg-destructive/10 text-destructive-emphasis',
            )}
          >
            {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta)}
            {deltaSuffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
