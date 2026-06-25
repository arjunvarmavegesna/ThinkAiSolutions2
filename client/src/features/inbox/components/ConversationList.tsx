/**
 * Left pane: header + search filter + the scrollable list of conversation rows.
 * Owns no network data — the page passes the polled list and selection in; the
 * search filter is purely client-side over the current list.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, MessagesSquare, Plus, Search, Send } from 'lucide-react';
import type { ConversationDTO } from '@thinkai/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationListItem } from './ConversationListItem';

interface ConversationListProps {
  conversations: ConversationDTO[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onNewMessage: () => void;
}

export function ConversationList({
  conversations,
  selectedId,
  loading,
  error,
  onSelect,
  onNewMessage,
}: ConversationListProps): JSX.Element {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (c.contactName ?? '').toLowerCase().includes(q) ||
        c.contactPhone.toLowerCase().includes(q) ||
        (c.lastMessagePreview ?? '').toLowerCase().includes(q),
    );
  }, [conversations, query]);

  return (
    <div className="flex h-full w-full flex-col bg-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">
          Conversations
          {conversations.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{conversations.length}</span>
          )}
        </h2>
        <button
          type="button"
          onClick={onNewMessage}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-3.5" />
          New
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && conversations.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-destructive-emphasis">{error}</p>
        )}
        {!error && loading && conversations.length === 0 && (
          <div className="space-y-1 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && !error && conversations.length === 0 && (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MessagesSquare className="size-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">Start your first conversation</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              WhatsApp requires an approved template to open a new chat. Send one to begin a 24-hour
              conversation window.
            </p>
            <div className="mt-5 flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={onNewMessage}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Send className="size-4" />
                Send a template
              </button>
              <Link
                to="/templates"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60"
              >
                <FileText className="size-4" />
                View templates
              </Link>
            </div>
          </div>
        )}
        {!loading && !error && conversations.length > 0 && filtered.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No matches for “{query}”.</p>
        )}
        {filtered.map((c) => (
          <ConversationListItem key={c.id} conversation={c} selected={c.id === selectedId} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
