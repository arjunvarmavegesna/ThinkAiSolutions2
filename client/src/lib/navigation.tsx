import {
  BarChart3,
  Building2,
  CircleUser,
  Code2,
  FileText,
  Home,
  Inbox,
  LifeBuoy,
  Megaphone,
  MessageSquarePlus,
  Plus,
  TrendingUp,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@thinkai/shared';

export interface NavLeaf {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Exact-match active state (for index-like routes such as /admin). */
  end?: boolean;
  /** Hidden from agents (tenant_admin only). */
  tenantAdminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavLeaf[];
}

export interface QuickAction {
  label: string;
  to: string;
  icon: LucideIcon;
  keywords?: string;
}

/** The two consoles. We are a direct Meta Tech Provider — hence "Direct Admin". */
export function consoleLabelForRole(role: Role | null): string {
  return role === 'reseller_admin' ? 'Direct Admin' : 'Workspace';
}

const TENANT_NAV: NavGroup[] = [
  {
    label: 'Messaging',
    items: [
      { label: 'Home', to: '/dashboard', icon: Home },
      { label: 'Inbox', to: '/inbox', icon: Inbox },
      { label: 'Campaigns', to: '/campaigns', icon: Megaphone },
      { label: 'Templates', to: '/templates', icon: FileText },
    ],
  },
  {
    label: 'Audience',
    items: [
      { label: 'Contacts', to: '/contacts', icon: Users },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Analytics', to: '/reports', icon: BarChart3 },
      { label: 'Developers', to: '/developer', icon: Code2, tenantAdminOnly: true },
    ],
  },
];

const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { label: 'Tenants', to: '/admin', icon: Building2, end: true },
      { label: 'Onboard tenant', to: '/admin/tenants/new', icon: Plus },
    ],
  },
  {
    label: 'Revenue',
    items: [{ label: 'Usage & Revenue', to: '/admin/usage', icon: TrendingUp }],
  },
];

/** Personal account + docs — shown to every role at the bottom of the rail. */
const ACCOUNT_NAV: NavGroup = {
  label: 'Account',
  items: [
    { label: 'Your Account', to: '/account', icon: CircleUser },
    { label: 'Help Center', to: '/help', icon: LifeBuoy },
  ],
};

export function navForRole(role: Role | null): NavGroup[] {
  const base = role === 'reseller_admin' ? ADMIN_NAV : TENANT_NAV;
  const groups =
    role === 'agent'
      ? // Agents don't see tenant-admin-only leaves.
        base.map((g) => ({ ...g, items: g.items.filter((i) => !i.tenantAdminOnly) }))
      : base;
  return [...groups, ACCOUNT_NAV];
}

export function quickActionsForRole(role: Role | null): QuickAction[] {
  if (role === 'reseller_admin') {
    return [
      { label: 'Onboard a new tenant', to: '/admin/tenants/new', icon: Plus, keywords: 'create add' },
      { label: 'View revenue & usage', to: '/admin/usage', icon: TrendingUp, keywords: 'mrr billing margin' },
    ];
  }
  const actions: QuickAction[] = [
    { label: 'New campaign', to: '/campaigns', icon: Megaphone, keywords: 'broadcast send blast' },
    { label: 'Upload contacts', to: '/contacts', icon: Upload, keywords: 'import csv audience' },
    { label: 'Create template', to: '/templates', icon: MessageSquarePlus, keywords: 'message hsm' },
  ];
  if (role === 'tenant_admin') {
    actions.push({ label: 'Open wallet & billing', to: '/wallet', icon: Wallet, keywords: 'recharge balance payment' });
  }
  return actions;
}
