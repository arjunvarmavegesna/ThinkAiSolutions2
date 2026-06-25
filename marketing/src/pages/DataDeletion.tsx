import { Link } from 'react-router-dom';
import Section from '../components/Section';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { CONTACT_EMAIL } from '../lib/config';

const steps = [
  {
    title: 'Request deletion',
    desc: 'Email us from the address associated with your account, or remove our app from your Meta/Facebook settings. Removing the app automatically notifies us through Meta’s deauthorization callback.',
  },
  {
    title: 'We receive & log the request',
    desc: 'Our servers verify the request (Meta requests are cryptographically signed) and record it. For Meta-initiated deletion requests, we return a confirmation code and a status URL you can use to check progress.',
  },
  {
    title: 'Your data is deleted',
    desc: 'We delete the personal data associated with your account from our active systems, except records we are legally required to keep (such as GST invoice records), which are retained only as long as the law requires.',
  },
];

export default function DataDeletion() {
  useDocumentTitle('Data Deletion');

  return (
    <>
      <Section className="bg-hero-mesh">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Data Deletion
          </h1>
          <p className="mt-5 text-lg text-slate-600">
            You can ask us to delete your data at any time. This page explains how to request it
            and how our deletion process works.
          </p>
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-3xl">
          <ol className="space-y-6">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 font-display text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">{s.title}</h2>
                  <p className="mt-1 text-[15px] leading-relaxed text-slate-700">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <h2 className="font-display text-lg font-semibold text-ink">
              How to request deletion
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-700">
              Email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-brand-700 hover:underline">
                {CONTACT_EMAIL}
              </a>{' '}
              with the subject “Data deletion request” from the email address on your account, and
              tell us which account or WhatsApp number the request relates to. We will confirm once
              your data has been deleted.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 className="font-display text-lg font-semibold text-ink">
              For Meta / Facebook users
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-700">
              If you connected our app through Meta, you can remove it from your Facebook or
              Business settings. Meta then sends us a signed deletion request, which our platform
              verifies and processes automatically. For these requests, you receive a confirmation
              code and a status link so you can confirm the deletion was handled.
            </p>
          </div>

          <p className="mt-8 text-[15px] leading-relaxed text-slate-700">
            For full details on what data we hold and how we use it, see our{' '}
            <Link to="/privacy" className="font-semibold text-brand-700 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </Section>
    </>
  );
}
