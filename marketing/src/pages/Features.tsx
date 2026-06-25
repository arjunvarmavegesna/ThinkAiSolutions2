import { Link } from 'react-router-dom';
import Section from '../components/Section';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { CONSOLE_SIGNUP_URL } from '../lib/config';

const features = [
  {
    title: 'Send template messages',
    desc: 'Deliver Meta-approved template messages to your customers — appointment reminders, order and booking confirmations, payment and delivery alerts, OTPs, and promotions. Marketing, utility, and authentication categories are all supported, with variables filled in per recipient.',
  },
  {
    title: 'Create & manage WhatsApp templates',
    desc: 'Author message templates, submit them to Meta for approval, and track approval status from the console. Keep your library of reusable templates organised so your team always sends on-brand, compliant messages.',
  },
  {
    title: 'Run campaigns',
    desc: 'Send a chosen template to a list of contacts as a single campaign. Each campaign tracks delivery per recipient, so you can see exactly who received, read, or failed to get the message.',
  },
  {
    title: 'Shared team inbox',
    desc: 'Every customer conversation lands in one shared inbox. Your staff reply together within the 24-hour service window, see full message history, and hand off threads without losing context.',
  },
  {
    title: 'Delivery analytics',
    desc: 'Track sent, delivered, read, and failed counts across your messages and campaigns. Daily usage reports and WhatsApp number-quality signals help you spot issues early and understand engagement.',
  },
  {
    title: 'Multi-tenant dashboard',
    desc: 'Operate multiple businesses, branches, or brands from one platform, each with isolated data, its own users, and its own prepaid wallet and pricing — ideal for chains, groups, and partners.',
  },
];

const platform = [
  {
    title: 'Official Meta WhatsApp Cloud API',
    desc: 'We connect directly to Meta as a Tech Provider — verified business profiles and reliable delivery, with no unofficial apps or grey routes.',
  },
  {
    title: 'Prepaid wallet with GST invoicing',
    desc: 'Top up a wallet and pay only for what you send. Every recharge generates a proper GST invoice, and each message is billed transparently by category.',
  },
  {
    title: 'Secure, isolated tenant data',
    desc: 'Every account’s data is scoped and isolated, with role-based access for admins and agents.',
  },
];

export default function Features() {
  useDocumentTitle('Features');

  return (
    <>
      <Section className="bg-hero-mesh">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Everything you need to run WhatsApp at work
          </h1>
          <p className="mt-5 text-lg text-slate-600">
            A complete WhatsApp Business messaging platform — from authoring templates to
            sending campaigns, replying in a shared inbox, and tracking delivery.
          </p>
        </div>
      </Section>

      <Section>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition-shadow hover:shadow-lift"
            >
              <span className="font-display text-sm font-bold text-brand-600">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h2 className="mt-2 font-display text-lg font-semibold text-ink">{f.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="bg-slate-50 bg-dotgrid">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink">
            Official, secure, and transparent
          </h2>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {platform.map((p) => (
            <div key={p.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <h3 className="font-display text-lg font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center shadow-card sm:px-12">
          <h2 className="font-display text-2xl font-bold text-ink">See it in your console</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            Create an account to manage your WhatsApp number, templates, inbox, campaigns, and
            wallet — or reach out and we’ll help you get started.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-4">
            <a
              href={CONSOLE_SIGNUP_URL}
              className="rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Get started
            </a>
            <Link
              to="/contact"
              className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition-colors hover:border-slate-400"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
