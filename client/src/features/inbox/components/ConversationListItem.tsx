/**
 * One conversation row: avatar, contact name/phone, last-message preview, relative
 * time, an unread count, and a service-window dot. Highlighted when selected.
 */
import type { ConversationDTO } from '@thinkai/shared';
import { ContactAvatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface ConversationListItemProps {
  conversation: ConversationDTO;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** Compact relative time label (e.g. "now", "5m", "2h", "3d"). */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function ConversationListItem({ conversation, selected, onSelect }: ConversationListItemProps): JSX.Element {
  const title = conversation.contactName?.length ? conversation.contactName : conversation.contactPhone;
  const hasUnread = conversation.unreadCount > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={cn(
        'group relative flex w-full items-start gap-3 px-3 py-3 text-left transition-colors',
        selected ? 'bg-accent' : 'hover:bg-secondary/60',
      )}
    >
      {/* Selected-row accent bar */}
      <span
        className={cn(
          'absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary transition-opacity',
          selected ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      />
      <div className="relative shrink-0">
        <ContactAvatar name={conversation.contactName} phone={conversation.contactPhone} className="size-9 text-xs" />
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card',
            conversation.windowOpen ? 'bg-success' : 'bg-muted-foreground/40',
          )}
          title={conversation.windowOpen ? 'Window open' : 'Window closed'}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('truncate text-sm', hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground')}>
            {title}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(conversation.lastMessageAt)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn('truncate text-xs', hasUnread ? 'text-foreground' : 'text-muted-foreground')}>
            {conversation.lastMessagePreview ?? 'No messages yet'}
          </span>
          {hasUnread && (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
