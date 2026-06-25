import type { ReactNode } from 'react';
import {
  BarChart3,
  Code2,
  FileText,
  LifeBuoy,
  Megaphone,
  MessageCircle,
  Receipt,
  Rocket,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface DocCategory {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface DocArticle {
  slug: string;
  title: string;
  category: string; // DocCategory.id
  summary: string;
  popular?: boolean;
  body?: ReactNode;
}

export const DOC_CATEGORIES: DocCategory[] = [
  { id: 'getting-started', title: 'Getting Started', description: 'Set up your workspace and learn the basics.', icon: Rocket },
  { id: 'whatsapp', title: 'WhatsApp Setup', description: 'Connect your WABA via Meta Embedded Signup.', icon: MessageCircle },
  { id: 'templates', title: 'Templates', description: 'Create, submit, and manage message templates.', icon: FileText },
  { id: 'campaigns', title: 'Campaigns', description: 'Build, schedule, and measure broadcasts.', icon: Megaphone },
  { id: 'contacts', title: 'Contacts', description: 'Import audiences, segments, and tags.', icon: Users },
  { id: 'analytics', title: 'Analytics', description: 'Delivery rates and reporting.', icon: BarChart3 },
  { id: 'developers', title: 'Developers', description: 'API keys, webhooks, and SDKs.', icon: Code2 },
  { id: 'billing', title: 'Billing', description: 'Plans, pricing, and invoices.', icon: Receipt },
  { id: 'troubleshooting', title: 'Troubleshooting', description: 'Fix connection, sync, and Meta errors.', icon: LifeBuoy },
];

export const DOC_ARTICLES: DocArticle[] = [
  // Getting Started
  {
    slug: 'platform-overview',
    title: 'Platform overview',
    category: 'getting-started',
    summary: 'How ThinkAiSolutions connects you directly to the Meta WhatsApp Cloud API.',
    body: (
      <>
        <p>
          ThinkAiSolutions is a <strong>direct Meta WhatsApp Cloud API Tech Provider</strong>. You connect your own
          WhatsApp Business Account (WABA) and send under your own brand — there is no reseller layer between you and
          Meta.
        </p>
        <h2>The building blocks</h2>
        <ul>
          <li><strong>Numbers</strong> — your WABA phone numbers, connected via Meta Embedded Signup.</li>
          <li><strong>Templates</strong> — pre-approved message formats required to start conversations.</li>
          <li><strong>Campaigns</strong> — broadcasts to a segment using an approved template.</li>
          <li><strong>Inbox</strong> — two-way conversations inside the 24-hour service window.</li>
        </ul>
        <p>New here? Start with <a href="/help/first-login">First login</a>, then <a href="/help/connect-whatsapp">Connect WhatsApp</a>.</p>
      </>
    ),
  },
  {
    slug: 'first-login',
    title: 'First login',
    category: 'getting-started',
    summary: 'What to expect the first time you sign in to your workspace.',
    body: (
      <>
        <p>After your account is created you land on <strong>Home</strong> — your workspace dashboard.</p>
        <ol>
          <li>Confirm your name and contact details under <a href="/account">Your Account</a>.</li>
          <li>Connect a WhatsApp number (see <a href="/help/connect-whatsapp">Connect WhatsApp</a>).</li>
          <li>Sync your approved templates.</li>
          <li>Import contacts and send your first campaign.</li>
        </ol>
        <p>Press <code>⌘K</code> anytime to jump between sections.</p>
      </>
    ),
  },
  { slug: 'workspace-setup', title: 'Workspace setup', category: 'getting-started', summary: 'Name your workspace, invite teammates, and set defaults.' },

  // WhatsApp Setup
  {
    slug: 'connect-whatsapp',
    title: 'Connect WhatsApp',
    category: 'whatsapp',
    popular: true,
    summary: 'Link your WhatsApp Business Account using Meta Embedded Signup.',
    body: (
      <>
        <p>
          Connecting takes a couple of minutes through <strong>Meta Embedded Signup</strong>. You authorize in a Meta
          popup — ThinkAiSolutions never handles a per-client Meta key.
        </p>
        <h2>Steps</h2>
        <ol>
          <li>Go to <strong>Numbers</strong> (or the WhatsApp tab) and click <strong>Continue with Facebook</strong>.</li>
          <li>Pick or create your <strong>WhatsApp Business Account (WABA)</strong> and phone number.</li>
          <li>Complete business verification if Meta prompts you.</li>
          <li>Set the 6-digit <a href="/help/registration-pin">registration PIN</a> for the number.</li>
        </ol>
        <p>
          Once connected, the status chip in the top bar flips to <strong>Connected</strong> and you can sync templates
          and send.
        </p>
      </>
    ),
  },
  {
    slug: 'waba',
    title: 'About your WABA',
    category: 'whatsapp',
    summary: 'What a WhatsApp Business Account is and how numbers attach to it.',
    body: (
      <>
        <p>
          A <strong>WABA</strong> is the Meta-level container that owns your phone numbers, templates, and quality
          rating. One WABA can hold multiple numbers. Your messaging limits and quality tier are tracked per number.
        </p>
      </>
    ),
  },
  { slug: 'meta-embedded-signup', title: 'Meta Embedded Signup', category: 'whatsapp', summary: 'How the in-app Meta authorization flow works and what it captures.' },
  { slug: 'verification', title: 'Business verification', category: 'whatsapp', summary: 'When Meta requires verification and how to complete it.' },
  {
    slug: 'registration-pin',
    title: 'Registration PIN',
    category: 'whatsapp',
    summary: 'Set and reset the 6-digit PIN that secures number registration.',
    body: (
      <>
        <p>
          The <strong>registration PIN</strong> is a 6-digit code Meta ties to your number for two-step verification.
          You set it during connection. If you ever see a <code>PIN required</code> error, reset it from the number's
          settings and re-register.
        </p>
      </>
    ),
  },

  // Templates
  { slug: 'create-templates', title: 'Create templates', category: 'templates', summary: 'Build a template with variables, buttons, and media headers.' },
  {
    slug: 'template-approval',
    title: 'Template approval process',
    category: 'templates',
    popular: true,
    summary: 'How Meta reviews templates and how to pass on the first try.',
    body: (
      <>
        <p>Every template is reviewed by Meta before it can be sent. Review is usually minutes, occasionally up to 24 hours.</p>
        <h2>Categories</h2>
        <ul>
          <li><strong>Marketing</strong> — promotions and announcements.</li>
          <li><strong>Utility</strong> — order updates, reminders, alerts.</li>
          <li><strong>Authentication</strong> — one-time passcodes.</li>
        </ul>
        <h2>Pass on the first try</h2>
        <ul>
          <li>Pick the category that matches the content — mismatches are the top rejection reason.</li>
          <li>Give sample values for every <code>{'{{variable}}'}</code>.</li>
          <li>Avoid forbidden content and excessive URLs.</li>
        </ul>
        <p>Rejected? See <a href="/help/rejected-templates">Rejected templates</a>.</p>
      </>
    ),
  },
  { slug: 'rejected-templates', title: 'Rejected templates', category: 'templates', summary: 'Why templates get rejected and how to fix and resubmit.' },

  // Campaigns
  {
    slug: 'create-campaign',
    title: 'Create your first campaign',
    category: 'campaigns',
    popular: true,
    summary: 'Send a broadcast to a segment using an approved template.',
    body: (
      <>
        <p>A campaign sends one approved template to a contact segment.</p>
        <ol>
          <li>Go to <strong>Campaigns</strong> and click <strong>New campaign</strong>.</li>
          <li>Choose your audience — a saved <a href="/help/segments">segment</a> or an imported list.</li>
          <li>Pick an <strong>approved</strong> template and fill its variables.</li>
          <li>Send now or <a href="/help/scheduling">schedule</a> for later.</li>
        </ol>
        <p>Track delivery and read rates live on the campaign card as it runs.</p>
      </>
    ),
  },
  { slug: 'scheduling', title: 'Scheduling', category: 'campaigns', summary: 'Schedule campaigns for a future date, time, and timezone.' },
  { slug: 'campaign-analytics', title: 'Campaign analytics', category: 'campaigns', summary: 'Read sent, delivered, read, and failure metrics per campaign.' },

  // Contacts
  { slug: 'import-contacts', title: 'Import contacts', category: 'contacts', summary: 'Upload a CSV and map columns to contact fields.' },
  { slug: 'segments', title: 'Segments', category: 'contacts', summary: 'Group contacts by attributes for targeted campaigns.' },
  { slug: 'tags', title: 'Tags', category: 'contacts', summary: 'Label contacts and conversations for fast filtering.' },

  // Analytics
  { slug: 'delivery-rates', title: 'Delivery rates', category: 'analytics', summary: 'How delivery rate is calculated and what healthy looks like.' },
  { slug: 'reports', title: 'Reports', category: 'analytics', summary: 'Explore message, quality, and campaign reports.' },

  // Developers
  {
    slug: 'authentication',
    title: 'API authentication',
    category: 'developers',
    popular: true,
    summary: 'Authenticate API requests with your workspace API key.',
    body: (
      <>
        <p>Authenticate every request with a Bearer token — your workspace API key.</p>
        <ul>
          <li>Create and rotate keys under <strong>Developers → API keys</strong>.</li>
          <li>Send the key in the <code>Authorization: Bearer &lt;key&gt;</code> header.</li>
          <li>Keep keys server-side. Never ship them in client code.</li>
        </ul>
        <p>Next: <a href="/help/api-keys">API keys</a> and <a href="/help/webhooks">Webhooks</a>.</p>
      </>
    ),
  },
  { slug: 'api-keys', title: 'API keys', category: 'developers', summary: 'Issue, scope, and rotate keys for your workspace.' },
  { slug: 'webhooks', title: 'Webhooks', category: 'developers', summary: 'Receive delivery, status, and inbound-message events.' },
  { slug: 'sdk-examples', title: 'SDK examples', category: 'developers', summary: 'Send your first message with copy-paste snippets.' },

  // Billing
  { slug: 'plans', title: 'Plans', category: 'billing', summary: 'Compare plans and what each includes.' },
  { slug: 'pricing', title: 'Pricing', category: 'billing', summary: 'How conversation and message pricing works.' },
  { slug: 'invoices', title: 'Invoices', category: 'billing', summary: 'Find, download, and understand your GST invoices.' },

  // Troubleshooting
  {
    slug: 'connection-issues',
    title: 'Connection issues',
    category: 'troubleshooting',
    summary: 'Number shows disconnected or sends are blocked.',
    body: (
      <>
        <h2>If your number shows disconnected</h2>
        <ul>
          <li>Confirm the number is still registered in your WABA.</li>
          <li>Check the <a href="/help/registration-pin">registration PIN</a> hasn't been reset.</li>
          <li>Review your quality rating — a low tier can pause sending.</li>
        </ul>
      </>
    ),
  },
  { slug: 'template-sync-failures', title: 'Template sync failures', category: 'troubleshooting', summary: 'Templates not appearing after a sync.' },
  { slug: 'meta-errors', title: 'Meta error codes', category: 'troubleshooting', summary: 'Decode common Meta Graph API error codes.' },
];

export function getArticle(slug: string): DocArticle | undefined {
  return DOC_ARTICLES.find((a) => a.slug === slug);
}

export function articlesByCategory(categoryId: string): DocArticle[] {
  return DOC_ARTICLES.filter((a) => a.category === categoryId);
}

export function popularArticles(): DocArticle[] {
  return DOC_ARTICLES.filter((a) => a.popular);
}

export function categoryById(id: string): DocCategory | undefined {
  return DOC_CATEGORIES.find((c) => c.id === id);
}

export function searchArticles(query: string): DocArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return DOC_ARTICLES.filter(
    (a) => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q),
  ).slice(0, 8);
}

/* ---- recently-viewed (localStorage) ---- */
const RECENT_KEY = 'tai:docs:recent';

export function recordRecent(slug: string): void {
  try {
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
    const next = [slug, ...prev.filter((s) => s !== slug)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getRecent(): DocArticle[] {
  try {
    const slugs = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
    return slugs.map(getArticle).filter((a): a is DocArticle => Boolean(a));
  } catch {
    return [];
  }
}
