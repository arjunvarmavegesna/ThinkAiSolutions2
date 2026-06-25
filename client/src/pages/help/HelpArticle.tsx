/**
 * Documentation article reader — sticky category sidebar + article body, with a
 * "was this helpful" footer and support fallback. Records recently-viewed.
 */
import { useEffect } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, FileQuestion, Mail } from 'lucide-react';
import {
  DOC_CATEGORIES,
  articlesByCategory,
  categoryById,
  getArticle,
  recordRecent,
} from '../../features/help/docs';
import { EmptyState } from '@/components/patterns/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function HelpArticle(): JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>();
  const article = getArticle(slug);

  useEffect(() => {
    if (article) recordRecent(article.slug);
  }, [article]);

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
      {/* Sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-5">
          <Link
            to="/help"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Help Center
          </Link>
          {DOC_CATEGORIES.map((cat) => (
            <div key={cat.id}>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <cat.icon className="size-3.5" />
                {cat.title}
              </div>
              <ul className="space-y-0.5 border-l border-border">
                {articlesByCategory(cat.id).map((a) => (
                  <li key={a.slug}>
                    <NavLink
                      to={`/help/${a.slug}`}
                      className={({ isActive }) =>
                        cn(
                          '-ml-px block border-l-2 py-1 pl-3 text-sm transition-colors',
                          isActive
                            ? 'border-primary font-medium text-foreground'
                            : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                        )
                      }
                    >
                      {a.title}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </aside>

      {/* Content */}
      <article className="min-w-0">
        {!article ? (
          <EmptyState
            icon={<FileQuestion />}
            title="Article not found"
            description="This article may have moved. Head back to the Help Center to find what you need."
            action={
              <Button asChild>
                <Link to="/help">Back to Help Center</Link>
              </Button>
            }
          />
        ) : (
          <>
            {/* Breadcrumb */}
            <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <Link to="/help" className="hover:text-foreground">Help Center</Link>
              <ChevronRight className="size-3" />
              <span>{categoryById(article.category)?.title}</span>
              <ChevronRight className="size-3" />
              <span className="text-foreground">{article.title}</span>
            </nav>

            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{article.title}</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">{article.summary}</p>

            <div className="mt-6 border-t border-border pt-6">
              {article.body ? (
                <div className="space-y-4 text-[15px] leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-primary-emphasis [&_a]:underline [&_code]:rounded [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                  {article.body}
                </div>
              ) : (
                <EmptyState
                  icon={<FileQuestion />}
                  title="This guide is coming soon"
                  description="We're still writing the full walkthrough. In the meantime, our team is happy to help directly."
                  action={
                    <Button asChild variant="outline">
                      <a href={`mailto:support@thinkaisolutions.com?subject=Docs%3A%20${encodeURIComponent(article.title)}`}>
                        <Mail />
                        Ask support
                      </a>
                    </Button>
                  }
                />
              )}
            </div>

            {/* Helpful + support */}
            <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">Was this helpful?</span>
                <Button variant="outline" size="sm">Yes</Button>
                <Button variant="outline" size="sm">No</Button>
              </div>
              <a
                href={`mailto:support@thinkaisolutions.com?subject=Question%3A%20${encodeURIComponent(article.title)}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-emphasis hover:underline"
              >
                <Mail className="size-4" />
                Still need help?
              </a>
            </div>
          </>
        )}
      </article>
    </div>
  );
}
