/**
 * Global ⌘K entity search. Turns the command palette into a true "search anything" surface:
 * contacts (server-side prefix search), plus campaigns and templates (filtered client-side from
 * lists the app already loads). Contacts hit the API on a debounce; campaigns/templates are
 * fetched once and cached for the session. Read-only — no new endpoints or business logic.
 */
import { useEffect, useRef, useState } from 'react';

import type { CampaignDTO, ContactDTO, TemplateDTO } from '@thinkai/shared';
import { listContacts } from '../contacts/api';
import { listCampaigns } from '../campaigns/api';
import { listTemplates } from '../templates/api';

export interface ContactHit {
  id: string;
  name: string;
  phone: string;
}
export interface CampaignHit {
  id: string;
  title: string;
  templateName: string;
  status: string;
}
export interface TemplateHit {
  id: string;
  name: string;
  status: string;
}

export interface GlobalSearchResults {
  contacts: ContactHit[];
  campaigns: CampaignHit[];
  templates: TemplateHit[];
  loading: boolean;
}

const EMPTY: GlobalSearchResults = { contacts: [], campaigns: [], templates: [], loading: false };
const MIN_LEN = 2;
const PER_GROUP = 5;
const DEBOUNCE_MS = 220;

/**
 * @param query   the live palette query
 * @param enabled only tenants/agents own these entities — admins pass false to skip the search
 */
export function useGlobalSearch(query: string, enabled: boolean): GlobalSearchResults {
  const [results, setResults] = useState<GlobalSearchResults>(EMPTY);

  // Campaigns + templates aren't server-searchable, so fetch each list once and reuse it.
  const campaignsCache = useRef<CampaignDTO[] | null>(null);
  const templatesCache = useRef<TemplateDTO[] | null>(null);

  const trimmed = query.trim();

  useEffect(() => {
    if (!enabled || trimmed.length < MIN_LEN) {
      setResults(EMPTY);
      return;
    }

    let active = true;
    setResults((r) => ({ ...r, loading: true }));

    const handle = window.setTimeout(() => {
      const q = trimmed.toLowerCase();

      void (async () => {
        // Lazily warm the campaign/template caches the first time search is used.
        const ensureCampaigns = async (): Promise<CampaignDTO[]> => {
          if (campaignsCache.current) return campaignsCache.current;
          try {
            const res = await listCampaigns();
            campaignsCache.current = res.campaigns;
          } catch {
            campaignsCache.current = [];
          }
          return campaignsCache.current;
        };
        const ensureTemplates = async (): Promise<TemplateDTO[]> => {
          if (templatesCache.current) return templatesCache.current;
          try {
            const res = await listTemplates();
            templatesCache.current = res.templates;
          } catch {
            templatesCache.current = [];
          }
          return templatesCache.current;
        };

        const [contactsRes, campaigns, templates] = await Promise.all([
          listContacts({ search: trimmed, limit: PER_GROUP }).catch(() => null),
          ensureCampaigns(),
          ensureTemplates(),
        ]);

        if (!active) return;

        const contacts: ContactHit[] = (contactsRes?.items ?? []).slice(0, PER_GROUP).map((c: ContactDTO) => ({
          id: c.id,
          name: c.name?.trim() || c.phone,
          phone: c.phone,
        }));

        const campaignHits: CampaignHit[] = campaigns
          .filter((c) => c.title.toLowerCase().includes(q) || c.templateName.toLowerCase().includes(q))
          .slice(0, PER_GROUP)
          .map((c) => ({ id: c.id, title: c.title, templateName: c.templateName, status: c.status }));

        const templateHits: TemplateHit[] = templates
          .filter((t) => t.name.toLowerCase().includes(q))
          .slice(0, PER_GROUP)
          .map((t) => ({ id: t.id, name: t.name, status: t.status }));

        setResults({ contacts, campaigns: campaignHits, templates: templateHits, loading: false });
      })();
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [trimmed, enabled]);

  return results;
}
