import { Link } from 'react-router-dom';
import Section from '../components/Section';
import ChatMockup from '../components/ChatMockup';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { CONSOLE_SIGNUP_URL } from '../lib/config';

const features = [
  {
    title: 'Send template messages',
    desc: 'Deliver Meta-approved template messages — reminders, confirmations, OTPs, and alerts — across marketing, utility, and authentication categories.',
  },
  {
    title: 'Create & manage templates',
    desc: 'Author WhatsApp message templates, submit them for Meta approval, and track their status from one place.',
  },
  {
    title: 'Run campaigns',
    desc: 'Send a template to a list of contacts in one campaign and watch it roll out, with per-recipient delivery tracking.',
  },
  {
    title: 'Shared team inbox',
    desc: 'Your staff handle every conversation together from a single view, replying within the 24-hour service window so no thread is missed.',
  },
  {
    title: 'Delivery analytics',
    desc: 'See sent, delivered, read, and failed counts across messages and campaigns, plus daily usage and number-quality signals.',
  },
  {
    title: 'Multi-tenant dashboard',
    desc: 'Run multiple businesses, locations, or brands with isolated data, users, and prepaid wallet billing per tenant.',
  },
];

const audiences = [
  { label: 'Clinics', icon: '🩺' },
  { label: 'Hospitals', icon: '🏥' },
  { label: 'Pharmacies & labs', icon: '💊' },
  { label: 'Hotels', icon: '🏨' },
  { label: 'Restaurants', icon: '🍽️' },
  { label: 'Other businesses', icon: '🏢' },
];

export default function Home() {
  useDocumentTitle('WhatsApp Business Messaging Platform');

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-hero-mesh">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2 lg:gap-8 lg:px-8">
          <div className="max-w-xl">
            <span className="inline-flex animate-rise-in items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-sm font-medium text-brand-700 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              Built on the Meta WhatsApp Cloud API
            </span>
            <h1 className="mt-5 animate-rise-in font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink [animation-delay:80ms] sm:text-5xl lg:text-6xl">
              A WhatsApp Business messaging platform for businesses
            </h1>
            <p className="mt-6 animate-rise-in text-lg leading-relaxed text-slate-600 [animation-delay:160ms]">
              ThinkAiSolutions lets you reach customers on WhatsApp the official way. Send
              template messages, run campaigns, reply from a shared team inbox, and track
              delivery — all from one dashboard, billed transparently from a prepaid wallet.
            </p>
            <div className="mt-8 flex animate-rise-in flex-wrap gap-4 [animation-delay:240ms]">
              <a
                href={CONSOLE_SIGNUP_URL}
                className="rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
              >
                Get started
              </a>
              <Link
                to="/features"
                className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition-colors hover:border-slate-400"
              >
                Explore features
              </Link>
            </div>
            <p className="mt-5 animate-rise-in text-sm text-slate-500 [animation-delay:320ms]">
              Official, verified WhatsApp presence · GST-invoiced wallet billing · no grey routes
            </p>
          </div>

          <div className="lg:pl-6">
            <ChatMockup />
          </div>
        </div>
      </section>

      {/* What we do */}
      <Section>
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            One platform for every customer conversation
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            We connect directly to the Meta WhatsApp Cloud API as a Tech Provider, so your
            business gets an official, verified WhatsApp presence with reliable delivery and
            full message templates — no unofficial apps, no grey-route risk.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-card transition-shadow hover:shadow-lift"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <CheckIcon />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Who it's for */}
      <Section className="bg-slate-50 bg-dotgrid">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Who it&apos;s for
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Built for clinics, hospitals, and hotels — and any business automating customer
            communication on WhatsApp.
          </p>
        </div>
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3">
          {audiences.map((a) => (
            <div
              key={a.label}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card"
            >
              <span className="text-2xl" aria-hidden="true">
                {a.icon}
              </span>
              <span className="text-sm font-semibold text-ink">{a.label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section>
        <div className="overflow-hidden rounded-3xl bg-brand-600 px-6 py-14 text-center sm:px-12">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">
            Ready to put your business on WhatsApp?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-brand-50">
            Create an account and start sending on the official WhatsApp Business platform.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <a
              href={CONSOLE_SIGNUP_URL}
              className="rounded-lg bg-white px-6 py-3 text-base font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              Get started
            </a>
            <Link
              to="/pricing"
              className="rounded-lg border border-white/40 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              See pricing
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 0 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
