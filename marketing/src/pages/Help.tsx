import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import Section from '../components/Section';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { CONTACT_EMAIL } from '../lib/config';
import {
  DOC_CATEGORIES,
  articlesByCategory,
  popularArticles,
  searchArticles,
  type DocArticle,
} from '../lib/docs';

/** Public help center — searchable categories + articles, no login required. */
export default function Help() {
  useDocumentTitle('Help Center');
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchArticles(query), [query]);
  const popular = popularArticles();
  const searching = query.trim().length > 0;

  return (
    <>
      {/* Hero + search */}
      <section className="border-b border-slate-200 bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            How can we help?
          </h1>
          <p className="mt-3 text-base text-slate-600">
            Guides for connecting WhatsApp, templates, campaigns, and the API.
          </p>

          <div className="relative mx-auto mt-8 max-w-xl">
            <svg
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the help center…"
              className="w-full rounded-xl border border-slate-300 bg-white py-3.5 pl-12 pr-4 text-sm shadow-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>
      </section>

      <Section>
        {searching ? (
          <div className="mx-auto max-w-2xl">
            <p className="mb-4 text-sm text-slate-500">
              {results.length} result{results.length === 1 ? '' : 's'} for “{query.trim()}”
            </p>
            {results.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
                <p className="font-medium text-ink">No matching articles</p>
                <p className="mt-1 text-sm text-slate-600">
                  Try different keywords, or{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-brand-700 hover:underline">
                    email our team
                  </a>
                  .
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {results.map((a) => (
                  <li key={a.slug}>
                    <ArticleRow article={a} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            {/* Popular */}
            <div className="mb-14">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-500">Popular articles</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {popular.map((a) => (
                  <Link
                    key={a.slug}
                    to={`/help/${a.slug}`}
                    className="group rounded-xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                  >
                    <p className="font-semibold text-ink group-hover:text-brand-700">{a.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{a.summary}</p>
                  </Link>
                ))}
              </div>
            </div>

            {/* Categories */}
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {DOC_CATEGORIES.map((cat) => {
                const articles = articlesByCategory(cat.id);
                return (
                  <div key={cat.id}>
                    <h3 className="font-display text-lg font-bold text-ink">{cat.title}</h3>
                    <p className="mt-0.5 text-sm text-slate-500">{cat.description}</p>
                    <ul className="mt-3 space-y-1.5">
                      {articles.map((a) => (
                        <li key={a.slug}>
                          <Link
                            to={`/help/${a.slug}`}
                            className="text-sm text-slate-700 transition-colors hover:text-brand-700 hover:underline"
                          >
                            {a.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* Contact CTA */}
            <div className="mt-16 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="font-display text-xl font-bold text-ink">Still need a hand?</p>
              <p className="mt-1 text-sm text-slate-600">Our team replies fast — usually within a business day.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link
                  to="/contact"
                  className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
                >
                  Contact support
                </Link>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white"
                >
                  Email us
                </a>
              </div>
            </div>
          </>
        )}
      </Section>
    </>
  );
}

function ArticleRow({ article }: { article: DocArticle }) {
  return (
    <Link to={`/help/${article.slug}`} className="block px-5 py-4 transition-colors hover:bg-slate-50">
      <p className="font-medium text-ink">{article.title}</p>
      <p className="mt-0.5 text-sm text-slate-600">{article.summary}</p>
    </Link>
  );
}
