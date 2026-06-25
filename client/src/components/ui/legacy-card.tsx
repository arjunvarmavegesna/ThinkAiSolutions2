import type { ReactNode } from 'react';

/**
 * Twincles-style content card: white, rounded, soft shadow, with a 3px blue top accent.
 * Optional heading row (blue text + optional leading icon).
 */
export function Card({
  title,
  icon,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={`overflow-hidden rounded-xl bg-white shadow-card ${className}`}>
      <div className="h-[3px] w-full bg-brand-500" />
      <div className="p-5">
        {(title || actions) && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-brand-600">
              {icon}
              {title}
            </h2>
            {actions}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
