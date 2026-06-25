import { Link, useParams } from 'react-router-dom';

import Section from '../components/Section';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { CONTACT_EMAIL } from '../lib/config';
import { articlesByCategory, categoryById, getArticle } from '../lib/docs';

/** Single help article at /help/:slug. Static content, no login. */
export default function HelpArticle() {
  const { slug = '' } = useParams();
  const article = getArticle(slug);
  useDocumentTitle(article ? `${article.title} — Help` : 'Help Center');

  if (!article) {
    return (
      <Section>
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="font-display text-2xl font-bold text-ink">Article not found</p>
          <p className="mt-2 text-sm text-slate-600">
            This help article doesn’t exist or may have moved.
          </p>
          <Link
            to="/help"
            className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            Back to Help Center
          </Link>
        </div>
      </Section>
    );
  }

  const category = categoryById(article.category);
  const related = articlesByCategory(article.category).filter((a) => a.slug !== article.slug);

  return (
    <Section>
      <div className="mx-auto max-w-3xl">
        {/* Breadcrumb */}
        <nav className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          <Link to="/help" className="hover:text-brand-700">Help</Link>
          <span aria-hidden>/</span>
          {category && <span className="text-slate-600">{category.title}</span>}
        </nav>

        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{article.title}</h1>
        <p className="mt-3 text-lg text-slate-600">{article.summary}</p>

        <div className="my-8 h-px bg-slate-200" />

        {/* Body (prose styled via arbitrary variants — no typography plugin needed) */}
        {article.body ? (
          <div
            className="space-y-4 text-[15px] leading-relaxed text-slate-700
              [&_h2]:mt-9 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink
              [&_p]:leading-relaxed
              [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5
              [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5
              [&_li]:pl-1
              [&_a]:font-medium [&_a]:text-brand-700 hover:[&_a]:underline
              [&_strong]:font-semibold [&_strong]:text-ink
              [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-ink"
          >
            {article.body}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm text-slate-600">
              A full guide for this topic is on the way. In the meantime,{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-brand-700 hover:underline">
                email our team
              </a>{' '}
              and we’ll walk you through it.
            </p>
          </div>
        )}

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-14">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              More in {category?.title ?? 'this section'}
            </h2>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {related.map((a) => (
                <li key={a.slug}>
                  <Link to={`/help/${a.slug}`} className="block px-5 py-3.5 transition-colors hover:bg-slate-50">
                    <p className="font-medium text-ink">{a.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{a.summary}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-12">
          <Link to="/help" className="text-sm font-medium text-brand-700 hover:underline">
            ← Back to Help Center
          </Link>
        </div>
      </div>
    </Section>
  );
}
