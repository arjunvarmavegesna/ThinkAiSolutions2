import { useState, type FormEvent } from 'react';
import Section from '../components/Section';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { BUSINESS, CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_TEL } from '../lib/config';

export default function Contact() {
  useDocumentTitle('Contact');

  const [form, setForm] = useState({ name: '', email: '', business: '', message: '' });

  // No backend: compose a mailto so the static site stays fully self-contained.
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const subject = encodeURIComponent(`Enquiry from ${form.name || 'website'}`);
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\nBusiness: ${form.business}\n\n${form.message}`,
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-ink shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

  return (
    <>
      <Section className="bg-hero-mesh">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Get in touch
          </h1>
          <p className="mt-5 text-lg text-slate-600">
            Tell us about your business and what you want to do on WhatsApp. We usually
            reply within one business day.
          </p>
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Contact details</h2>
            <p className="mt-3 text-slate-600">
              Prefer email? Reach us directly and we will take it from there.
            </p>
            <dl className="mt-6 space-y-4 text-slate-700">
              <div>
                <dt className="text-sm font-semibold text-ink">Email</dt>
                <dd>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-700 hover:underline">
                    {CONTACT_EMAIL}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-ink">Phone</dt>
                <dd>
                  <a href={`tel:${CONTACT_PHONE_TEL}`} className="text-brand-700 hover:underline">
                    {CONTACT_PHONE}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-ink">Website</dt>
                <dd>
                  <a href="https://thinkaisolutions.com" className="text-brand-700 hover:underline">
                    thinkaisolutions.com
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-ink">Registered address</dt>
                <dd className="text-sm text-slate-600">{BUSINESS.fullAddress}</dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-ink">Who we serve</dt>
                <dd className="text-sm text-slate-600">
                  Clinics, hospitals, pharmacies, labs, hotels, restaurants, and other
                  businesses.
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="text-sm font-medium text-ink">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="email" className="text-sm font-medium text-ink">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className={inputClass}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="business" className="text-sm font-medium text-ink">
                  Business name
                </label>
                <input
                  id="business"
                  name="business"
                  type="text"
                  value={form.business}
                  onChange={(e) => setForm((f) => ({ ...f, business: e.target.value }))}
                  className={inputClass}
                  placeholder="Clinic, hotel, restaurant…"
                />
              </div>
              <div>
                <label htmlFor="message" className="text-sm font-medium text-ink">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  required
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  className={inputClass}
                  placeholder="What would you like to do on WhatsApp?"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Send message
              </button>
              <p className="text-center text-xs text-slate-500">
                This opens your email app — no data is stored on this site.
              </p>
            </form>
          </div>
        </div>
      </Section>
    </>
  );
}
