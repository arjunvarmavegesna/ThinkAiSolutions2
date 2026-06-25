import type { ReactNode } from 'react';

interface SectionProps {
  children: ReactNode;
  /** Optional id for in-page anchor links. */
  id?: string;
  /** Tailwind background utility classes, e.g. "bg-slate-50". */
  className?: string;
}

/** A consistent, centered, responsive content container with vertical rhythm. */
export default function Section({ children, id, className = '' }: SectionProps) {
  return (
    <section id={id} className={className}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        {children}
      </div>
    </section>
  );
}
