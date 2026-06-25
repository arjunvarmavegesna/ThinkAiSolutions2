import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Status / category pill. Tonal variants use soft tinted backgrounds (Stripe-style). */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        primary: 'border-primary/15 bg-primary/10 text-primary-emphasis',
        success: 'border-success/15 bg-success/10 text-success-emphasis',
        warning: 'border-warning/20 bg-warning/10 text-warning-emphasis',
        danger: 'border-destructive/15 bg-destructive/10 text-destructive-emphasis',
        info: 'border-info/15 bg-info/10 text-info-emphasis',
        outline: 'border-border bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
