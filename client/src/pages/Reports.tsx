/**
 * Analytics — modern, Stripe-style analytics workspace (Phase-2/3 reporting).
 *   - Overview (2.3)  — per-day funnel + spend, KPIs, trend charts
 *   - Messages (2.4)  — API / message log
 *   - Campaigns (2.2) — per-campaign delivery funnel
 *   - Quality (3.1)   — per-number quality rating + messaging tier
 *
 * The tab content components own their own data; this shell only owns the active tab.
 */
import { useState } from 'react';
import { Activity, BarChart3, Megaphone, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { PageHeader } from '@/components/patterns/page-header';
import { cn } from '@/lib/utils';
import { MessageReport } from '../features/reports/MessageReport';
import { DailyReport } from '../features/reports/DailyReport';
import { CampaignReport } from '../features/reports/CampaignReport';
import { QualityReport } from '../features/reports/QualityReport';

type Tab = 'overview' | 'messages' | 'campaigns' | 'quality';

const TABS: Array<{ key: Tab; label: string; icon: LucideIcon }> = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'messages', label: 'Messages', icon: BarChart3 },
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { key: 'quality', label: 'Quality', icon: ShieldCheck },
];

export function Reports(): JSX.Element {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Delivery, spend, and quality across your WhatsApp messaging — at a glance."
      />

      {/* Segmented tab control */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-xs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <DailyReport />}
      {tab === 'messages' && <MessageReport />}
      {tab === 'campaigns' && <CampaignReport />}
      {tab === 'quality' && <QualityReport />}
    </div>
  );
}
