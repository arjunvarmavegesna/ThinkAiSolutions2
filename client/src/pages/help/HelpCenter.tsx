/**
 * Help Center — Stripe/Intercom-style docs home: hero search, popular &
 * recently-viewed articles, a full category index, and a support section.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bug,
  Clock,
  FileText,
  Lightbulb,
  Mail,
  MessageCircle,
  Search,
  Star,
} from 'lucide-react';
import {
  DOC_CATEGORIES,
  articlesByCategory,
  getRecent,
  popularArticles,
  searchArticles,
  type DocArticle,
} from '../../features/help/docs';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const SUPPORT = [
  { label: 'Chat with support', desc: 'Get a fast reply from our team.', icon: MessageCircle, href: 'mailto:support@thinkaisolutions.com?subject=Support%20request' },
  { label: 'Email support', desc: 'support@thinkaisolutions.com', icon: Mail, href: 'mailto:support@thinkaisolutions.com' },
  { label: 'Report a bug', desc: 'Tell us what went wrong.', icon: Bug, href: 'mailto:support@thinkaisolutions.com?subject=Bug%20report' },
  { label: 'Request a feature', desc: 'Shape the roadmap with us.', icon: Lightbulb, href: 'mailto:support@thinkaisolutions.com?subject=Feature%20request' },
];

export function HelpCenter(): JSX.Element {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const results = searchArticles(query);
  const recent = getRecent();
  const popular = popularArticles();

  // "/" focuses search (⌘K is reserved for global navigation).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-b from-accent/60 to-card p-8 text-center sm:p-12">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">How can we help?</h1>
        <p className="mt-2 text-sm text-muted-foreground">Search the docs or browse by topic.</p>

        <div className="relative mx-auto mt-6 max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documentation…"
            className="h-12 w-full rounded-lg border border-border bg-card pl-12 pr-16 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <kbd className="absolute right-4 top-1/2 hidden -translate-y-1/2 items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline-flex">
            /
          </kbd>

          {/* Search results */}
          {query && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute z-20 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover p-1.5 text-left shadow-lg"
            >
              {results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No articles match “{query}”. Try a different term or <a className="text-primary-emphasis underline" href="mailto:support@thinkaisolutions.com">contact support</a>.
                </p>
              ) : (
                results.map((a) => <ResultRow key={a.slug} article={a} />)
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Popular + recent */}
      {!query && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <ArticleColumn icon={<Star className="size-4 text-warning" />} title="Popular articles" articles={popular} />
          {recent.length > 0 && (
            <ArticleColumn icon={<Clock className="size-4 text-muted-foreground" />} title="Recently viewed" articles={recent} />
          )}
        </div>
      )}

      {/* Category index */}
      <div>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-foreground">Browse by topic</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {DOC_CATEGORIES.map((cat) => {
            const articles = articlesByCategory(cat.id);
            return (
              <Card key={cat.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-[18px]">
                      <cat.icon />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{cat.title}</h3>
                      <p className="text-xs text-muted-foreground">{cat.description}</p>
                    </div>
                  </div>
                  <ul className="space-y-0.5">
                    {articles.slice(0, 4).map((a) => (
                      <li key={a.slug}>
                        <Link
                          to={`/help/${a.slug}`}
                          className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                        >
                          {a.title}
                          <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Support */}
      <div>
        <h2 className="mb-1 text-lg font-semibold tracking-tight text-foreground">Need more help?</h2>
        <p className="mb-4 text-sm text-muted-foreground">Our team is here for you.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SUPPORT.map((s) => (
            <a
              key={s.label}
              href={s.href}
              className="group rounded-lg border border-border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-secondary text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground [&_svg]:size-[18px]">
                <s.icon />
              </span>
              <p className="text-sm font-semibold text-foreground">{s.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultRow({ article }: { article: DocArticle }): JSX.Element {
  return (
    <Link
      to={`/help/${article.slug}`}
      className="flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent"
    >
      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{article.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{article.summary}</span>
      </span>
    </Link>
  );
}

function ArticleColumn({ icon, title, articles }: { icon: JSX.Element; title: string; articles: DocArticle[] }): JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </div>
      <Card>
        <CardContent className="p-2">
          {articles.map((a) => (
            <Link
              key={a.slug}
              to={`/help/${a.slug}`}
              className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              {a.title}
              <ArrowRight className="size-3.5 shrink-0" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
