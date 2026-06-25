import { Link } from 'react-router-dom';
import { BUSINESS, CONSOLE_URL, CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_TEL } from '../lib/config';

const year = new Date().getFullYear();

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <img src="/logo.png?v=2" alt="ThinkAiSolutions logo" className="h-9 w-9" width={36} height={36} />
              <span className="font-display text-lg font-bold text-ink">ThinkAiSolutions</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-slate-600">
              A WhatsApp Business messaging platform built on the Meta WhatsApp Cloud API —
              templates, campaigns, a shared team inbox, and delivery analytics.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">Product</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                <Link to="/features" className="hover:text-brand-700">
                  Features
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-brand-700">
                  Pricing
                </Link>
              </li>
              <li>
                <a href={CONSOLE_URL} className="hover:text-brand-700">
                  Console
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">Company</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                <Link to="/about" className="hover:text-brand-700">
                  About
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-brand-700">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink">Legal</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                <Link to="/privacy" className="hover:text-brand-700">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-brand-700">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/data-deletion" className="hover:text-brand-700">
                  Data Deletion
                </Link>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-brand-700">
                  {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 space-y-1 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <p>
            {BUSINESS.name} · {BUSINESS.type} · {BUSINESS.registration}
          </p>
          <p>{BUSINESS.fullAddress}</p>
          <p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-brand-700">
              {CONTACT_EMAIL}
            </a>{' '}
            ·{' '}
            <a href={`tel:${CONTACT_PHONE_TEL}`} className="hover:text-brand-700">
              {CONTACT_PHONE}
            </a>
          </p>
          <p className="pt-1">&copy; {year} {BUSINESS.name}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
