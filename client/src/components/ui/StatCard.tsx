type Tone = 'submitted' | 'sent' | 'delivered' | 'failed';

const TONES: Record<Tone, { ring: string; icon: JSX.Element }> = {
  submitted: {
    ring: 'bg-emerald-50 text-emerald-600',
    icon: <CheckIcon />,
  },
  sent: {
    ring: 'bg-emerald-50 text-emerald-600',
    icon: <DoubleCheckIcon />,
  },
  delivered: {
    ring: 'bg-sky-50 text-sky-500',
    icon: <DoubleCheckIcon />,
  },
  failed: {
    ring: 'bg-rose-50 text-rose-500',
    icon: <XIcon />,
  },
};

/** A single metric tile: white card, blue top accent, label, big number, trend, status icon. */
export function StatCard({
  label,
  value,
  trend,
  tone,
}: {
  label: string;
  value: number;
  trend: string;
  tone: Tone;
}): JSX.Element {
  const t = TONES[tone];
  const up = tone !== 'failed';
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-card">
      <div className="h-[3px] w-full bg-brand-500" />
      <div className="flex items-start justify-between p-5">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
          <p className={`mt-1 text-xs font-medium ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
            {up ? '▲' : '▼'} {trend}
          </p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-full ${t.ring}`}>
          {t.icon}
        </span>
      </div>
    </div>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function DoubleCheckIcon(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m1 13 4 4L15 7" />
      <path d="m9 17 1 1L23 5" />
    </svg>
  );
}
function XIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
