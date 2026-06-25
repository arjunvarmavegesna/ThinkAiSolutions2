/**
 * Right pane: a compact contact profile for the selected conversation. Renders
 * only from data we actually have on the conversation (name, phone, window state,
 * unread) — no fabricated CRM fields.
 */
import { Clock, Phone } from 'lucide-react';
import type { ConversationDTO } from '@thinkai/shared';
import { ContactAvatar } from '@/components/ui/avatar';
import { HealthDot } from '@/components/patterns/health-dot';
import { cn } from '@/lib/utils';

export function ContactProfile({
  conversation,
  className,
}: {
  conversation: ConversationDTO;
  className?: string;
}): JSX.Element {
  const title = conversation.contactName?.length ? conversation.contactName : conversation.contactPhone;

  return (
    <aside className={cn('flex-col bg-card', className)}>
      <div className="flex flex-col items-center gap-3 border-b border-border px-5 py-6 text-center">
        <ContactAvatar name={conversation.contactName} phone={conversation.contactPhone} className="size-16 text-xl" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{conversation.contactPhone}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
            conversation.windowOpen
              ? 'border-success/20 bg-success/10 text-success-emphasis'
              : 'border-border bg-secondary/60 text-muted-foreground',
          )}
        >
          <HealthDot status={conversation.windowOpen ? 'healthy' : 'offline'} />
          {conversation.windowOpen ? 'Window open' : 'Window closed'}
        </span>
      </div>

      <dl className="space-y-4 px-5 py-5 text-sm">
        <Row icon={<Phone className="size-4" />} label="Phone" value={conversation.contactPhone} mono />
        <Row
          icon={<Clock className="size-4" />}
          label="Last activity"
          value={new Date(conversation.lastMessageAt).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        />
        {conversation.unreadCount > 0 && (
          <Row icon={<span className="size-2 rounded-full bg-primary" />} label="Unread" value={`${conversation.unreadCount} message(s)`} />
        )}
      </dl>
    </aside>
  );
}

function Row({ icon, label, value, mono }: { icon: JSX.Element; label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-4 items-center justify-center text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={cn('truncate text-sm text-foreground', mono && 'font-mono')}>{value}</dd>
      </div>
    </div>
  );
}
