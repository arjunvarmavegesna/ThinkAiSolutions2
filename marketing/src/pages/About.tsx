import { Link } from 'react-router-dom';
import Section from '../components/Section';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { BUSINESS, CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_TEL } from '../lib/config';

const values = [
  {
    title: 'Official, always',
    desc: 'We build only on the Meta WhatsApp Cloud API. No grey routes, no unofficial apps — just a compliant, verified WhatsApp presence for your business.',
  },
  {
    title: 'Transparent billing',
    desc: 'Prepaid wallets and GST invoicing, with each message billed by category. You always know what you’re paying for.',
  },
  {
    title: 'Simple to adopt',
    desc: 'A clean console your team can learn in minutes, so WhatsApp becomes part of daily work instead of another tool to manage.',
  },
];

export default function About() {
  useDocumentTitle('About');

  return (
    <>
      <Section className="bg-hero-mesh">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            About ThinkAiSolutions
          </h1>
          <p className="mt-5 text-lg text-slate-600">
            We provide a WhatsApp Business messaging platform that helps businesses reach their
            customers on WhatsApp, the official way.
          </p>
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-3xl space-y-6 text-lg leading-relaxed text-slate-700">
          <p>
            ThinkAiSolutions is a registered business that provides a software service: a
            multi-tenant WhatsApp Business messaging platform built directly on the Meta
            WhatsApp Cloud API. We operate as a WhatsApp Tech Provider, onboarding businesses
            onto the official WhatsApp Business platform under our own dashboard, billing, and
            support.
          </p>
          <p>
            WhatsApp is where customers already talk. Yet many businesses still rely on phone
            calls and personal numbers — missing reminders, losing bookings, and answering the
            same questions over and over. Our platform gives them an official, verified WhatsApp
            presence with template messaging, campaigns, a shared team inbox, delivery
            analytics, and transparent prepaid billing — without the technical overhead.
          </p>
          <p>
            We serve clinics, hospitals, pharmacies, labs, hotels, restaurants, and other
            businesses that want to automate and manage customer communication on WhatsApp.
          </p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Business &amp; contact</h2>
          <dl className="mt-4 space-y-3 text-sm text-slate-700">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="font-semibold text-ink sm:w-32">Business</dt>
              <dd>
                {BUSINESS.name} — {BUSINESS.type}, {BUSINESS.registration}. WhatsApp Business
                messaging platform (software service).
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="font-semibold text-ink sm:w-32">Registered address</dt>
              <dd>{BUSINESS.fullAddress}</dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="font-semibold text-ink sm:w-32">Email</dt>
              <dd>
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-700 hover:underline">
                  {CONTACT_EMAIL}
                </a>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="font-semibold text-ink sm:w-32">Phone</dt>
              <dd>
                <a href={`tel:${CONTACT_PHONE_TEL}`} className="text-brand-700 hover:underline">
                  {CONTACT_PHONE}
                </a>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="font-semibold text-ink sm:w-32">Website</dt>
              <dd>
                <a href="https://thinkaisolutions.com" className="text-brand-700 hover:underline">
                  thinkaisolutions.com
                </a>
              </dd>
            </div>
          </dl>
        </div>
      </Section>

      <Section className="bg-slate-50 bg-dotgrid">
        <h2 className="font-display text-2xl font-bold text-ink">What we stand for</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {values.map((v) => (
            <div key={v.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
              <h3 className="font-display text-lg font-semibold text-ink">{v.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{v.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center shadow-card sm:px-12">
          <h2 className="font-display text-2xl font-bold text-ink">
            Let&apos;s build your WhatsApp presence
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            Whether you run a single clinic or a hotel chain, we&apos;d love to help.
          </p>
          <div className="mt-7">
            <Link
              to="/contact"
              className="rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Get in touch
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
