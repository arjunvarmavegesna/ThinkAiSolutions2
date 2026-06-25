import { cn } from '@/lib/utils';

export type HealthStatus = 'healthy' | 'pending' | 'attention' | 'offline';

const MAP: Record<HealthStatus, { dot: string; label: string; text: string }> = {
  healthy: { dot: 'bg-success', label: 'Healthy', text: 'text-success-emphasis' },
  pending: { dot: 'bg-warning', label: 'Setup pending', text: 'text-warning-emphasis' },
  attention: { dot: 'bg-destructive', label: 'Attention required', text: 'text-destructive-emphasis' },
  offline: { dot: 'bg-muted-foreground/50', label: 'Offline', text: 'text-muted-foreground' },
};

/** Health signal dot. `attention` pulses to draw the eye in dense tables. */
export function HealthDot({
  status,
  showLabel = false,
  label,
  className,
}: {
  status: HealthStatus;
  showLabel?: boolean;
  label?: string;
  className?: string;
}): JSX.Element {
  const cfg = MAP[status];
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          cfg.dot,
          status === 'attention' && 'animate-pulse-ring',
        )}
        aria-hidden
      />
      {showLabel && <span className={cn('text-sm font-medium', cfg.text)}>{label ?? cfg.label}</span>}
      <span className="sr-only">{label ?? cfg.label}</span>
    </span>
  );
}
