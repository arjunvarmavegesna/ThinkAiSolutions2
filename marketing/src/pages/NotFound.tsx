import { Link } from 'react-router-dom';
import Section from '../components/Section';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function NotFound() {
  useDocumentTitle('Page not found');

  return (
    <Section>
      <div className="mx-auto max-w-xl py-12 text-center">
        <p className="text-base font-semibold text-brand-600">404</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-ink">
          Page not found
        </h1>
        <p className="mt-4 text-slate-600">
          The page you are looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-8">
          <Link
            to="/"
            className="rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Back to home
          </Link>
        </div>
      </div>
    </Section>
  );
}
