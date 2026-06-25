/**
 * Composes the tenant's WhatsApp Business state for the dashboard "command center" from
 * existing read endpoints — connection + quality, template/contact counts, recent campaigns,
 * and a recent-message activity feed. Each source settles independently so one slow/failing
 * call never blanks the whole dashboard. No new APIs: this only reads what other pages read.
 */
import { useEffect, useState } from 'react';

import type {
  CampaignDTO,
  MessagingTier,
  QualityRating,
  ReportMessageRow,
  SubscriptionStatus,
  WabaStatus,
} from '@thinkai/shared';

import { getWabaStatus } from '../../api/onboardingApi';
import { getQuality, getMessageReport } from '../reports/api';
import { listTemplates } from '../templates/api';
import { listContacts } from '../contacts/api';
import { listCampaigns } from '../campaigns/api';
import { getSubscription } from '../wallet/api';

export interface CommandCenterNumber {
  phoneNumber: string;
  displayName: string;
  status: WabaStatus;
  qualityRating: QualityRating;
  messagingTier: MessagingTier;
  /** Epoch ms Meta quality/tier was last refreshed for this number — the dashboard's "last sync". */
  qualityUpdatedAt?: number;
}

export interface CommandCenterPlan {
  status: SubscriptionStatus;
  active: boolean;
  /** Epoch ms the current paid month ends (0 = never subscribed). */
  currentPeriodEnd: number;
}

export interface CommandCenterData {
  connected: boolean;
  hasWaba: boolean;
  number: CommandCenterNumber | null;
  templatesTotal: number;
  templatesApproved: number;
  contactsTotal: number | null;
  campaigns: CampaignDTO[];
  recentMessages: ReportMessageRow[];
  /** Subscription state, when the caller is allowed to read it (tenant_admin); null for agents. */
  plan: CommandCenterPlan | null;
}

const EMPTY: CommandCenterData = {
  connected: false,
  hasWaba: false,
  number: null,
  templatesTotal: 0,
  templatesApproved: 0,
  contactsTotal: null,
  campaigns: [],
  recentMessages: [],
  plan: null,
};

const DAY = 24 * 60 * 60 * 1000;

export function useCommandCenter(): { data: CommandCenterData; loading: boolean } {
  const [data, setData] = useState<CommandCenterData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void (async () => {
      const [waba, quality, templates, contacts, campaigns, messages, subscription] =
        await Promise.allSettled([
          getWabaStatus(),
          getQuality(false),
          listTemplates(),
          listContacts({ limit: 1 }),
          listCampaigns(),
          getMessageReport({ from: Date.now() - 14 * DAY, to: Date.now(), limit: 8 }),
          // Agents can't read subscription — a rejection here just leaves `plan` null.
          getSubscription(),
        ]);

      if (!active) return;

      const next: CommandCenterData = { ...EMPTY };

      if (waba.status === 'fulfilled') {
        next.connected = waba.value.connected;
        next.hasWaba = waba.value.hasWaba;
      }
      if (quality.status === 'fulfilled' && quality.value.wabas.length > 0) {
        const w = quality.value.wabas[0];
        next.number = {
          phoneNumber: w.phoneNumber,
          displayName: w.displayName,
          status: w.status,
          qualityRating: w.qualityRating,
          messagingTier: w.messagingTier,
          qualityUpdatedAt: w.qualityUpdatedAt,
        };
      }
      if (subscription.status === 'fulfilled') {
        next.plan = {
          status: subscription.value.status,
          active: subscription.value.active,
          currentPeriodEnd: subscription.value.currentPeriodEnd,
        };
      }
      if (templates.status === 'fulfilled') {
        next.templatesTotal = templates.value.templates.length;
        next.templatesApproved = templates.value.templates.filter((t) => t.status === 'approved').length;
      }
      if (contacts.status === 'fulfilled') {
        next.contactsTotal = contacts.value.total ?? (contacts.value.items.length > 0 ? contacts.value.items.length : 0);
      }
      if (campaigns.status === 'fulfilled') {
        next.campaigns = campaigns.value.campaigns;
      }
      if (messages.status === 'fulfilled') {
        next.recentMessages = messages.value.rows;
      }

      setData(next);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  return { data, loading };
}
