import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Standard page heading: optional eyebrow/breadcrumb, title, description, and a
 * right-aligned actions slot. Keeps every screen's top zone visually consistent.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  badge,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium text-muted-foreground">{eyebrow}</div>}
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
