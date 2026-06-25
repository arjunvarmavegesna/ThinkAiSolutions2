import { Link } from 'react-router-dom';
import Section from '../components/Section';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { CONSOLE_SIGNUP_URL } from '../lib/config';

const rateCards = [
  {
    category: 'Marketing',
    blurb: 'Promotions, offers, announcements, and re-engagement campaigns.',
    rate: '₹ —',
    unit: 'per message',
  },
  {
    category: 'Utility',
    blurb: 'Order updates, appointment reminders, payment and delivery alerts.',
    rate: '₹ —',
    unit: 'per message',
  },
  {
    category: 'Authentication',
    blurb: 'One-time passwords and login verification codes.',
    rate: '₹ —',
    unit: 'per message',
  },
  {
    category: 'Service',
    blurb: 'Replies to customers inside the 24-hour service window.',
    rate: 'Free',
    unit: 'no charge',
    highlight: true,
  },
];

export default function Pricing() {
  useDocumentTitle('Pricing');

  return (
    <>
      <Section className="bg-hero-mesh">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Simple, prepaid pricing
          </h1>
          <p className="mt-5 text-lg text-slate-600">
            Top up a prepaid wallet and pay only for the messages you send. WhatsApp
            charges per conversation by category — service conversations (your replies
            within the 24-hour window) are free.
          </p>
        </div>
      </Section>

      <Section>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {rateCards.map((c) => (
            <div
              key={c.category}
              className={`flex flex-col rounded-2xl border p-6 shadow-card ${
                c.highlight
                  ? 'border-brand-300 bg-brand-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <h2 className="text-lg font-semibold text-ink">{c.category}</h2>
              <p className="mt-2 flex-1 text-sm text-slate-600">{c.blurb}</p>
              <div className="mt-6">
                <div className="text-2xl font-bold text-ink">{c.rate}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {c.unit}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">
          Rates shown are placeholders. Your final per-message rates depend on volume and
          message category — contact us for a quote.
        </p>
      </Section>

      <Section className="bg-slate-50 bg-dotgrid">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-bold text-ink">How the wallet works</h2>
          <ol className="mt-6 space-y-4">
            {[
              'Recharge your prepaid wallet online — every top-up comes with a GST invoice.',
              'Each billable message is debited from your balance at your per-category rate.',
              'Service replies within the 24-hour window are free and never debited.',
              'Track every transaction and your live balance from the console.',
            ].map((step, i) => (
              <li key={step} className="flex gap-4">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <p className="text-slate-700">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section>
        <div className="rounded-3xl bg-brand-600 px-6 py-14 text-center sm:px-12">
          <h2 className="font-display text-3xl font-bold tracking-tight text-white">
            Want exact rates for your business?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-brand-50">
            Tell us your monthly volume and use case, and we will share a tailored quote.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/contact"
              className="rounded-lg bg-white px-6 py-3 text-base font-semibold text-brand-700 transition-colors hover:bg-brand-50"
            >
              Talk to us
            </Link>
            <a
              href={CONSOLE_SIGNUP_URL}
              className="rounded-lg border border-white/40 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              Get started
            </a>
          </div>
        </div>
      </Section>
    </>
  );
}
