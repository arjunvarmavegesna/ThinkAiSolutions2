/**
 * A single chat bubble. Outbound (direction 'out') aligns right with the brand
 * primary tint; inbound aligns left on a neutral card surface. Shows the body (or
 * a template label when no body text is present) plus time + a delivery-status
 * tick for outbound messages.
 */
import { Check, CheckCheck, Clock3, TriangleAlert } from 'lucide-react';
import type { MessageDTO, MessageStatus } from '@thinkai/shared';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: MessageDTO;
}

/** Short status label shown under outbound bubbles. */
const STATUS_LABEL: Record<MessageStatus, string> = {
  queued: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
};

/** Status glyph mirroring WhatsApp's tick semantics. */
function StatusIcon({ status }: { status: MessageStatus }): JSX.Element {
  switch (status) {
    case 'queued':
      return <Clock3 className="size-3" />;
    case 'sent':
      return <Check className="size-3" />;
    case 'delivered':
    case 'read':
      return <CheckCheck className="size-3" />;
    case 'failed':
      return <TriangleAlert className="size-3" />;
  }
}

/** Format an epoch-ms timestamp as a local HH:MM string. */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message }: MessageBubbleProps): JSX.Element {
  const isOut = message.direction === 'out';
  const failed = message.status === 'failed';

  // Templates may have no stored body; show a clear placeholder so the agent
  // still sees that something went out.
  const text =
    message.body && message.body.length > 0
      ? message.body
      : message.type === 'template'
        ? `Template: ${message.templateName ?? 'sent'}`
        : `[${message.type}]`;

  return (
    <div className={cn('flex px-1 animate-slide-up', isOut ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-xs',
          isOut
            ? failed
              ? 'rounded-br-sm border border-destructive/30 bg-destructive/10 text-destructive-emphasis'
              : 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm border border-border bg-card text-foreground',
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-snug">{text}</p>
        <div
          className={cn(
            'mt-1 flex items-center justify-end gap-1 text-[11px]',
            isOut && !failed ? 'text-primary-foreground/75' : 'text-muted-foreground',
          )}
        >
          <span className="tabular-nums">{formatTime(message.ts)}</span>
          {isOut && (
            <span className="inline-flex items-center gap-0.5">
              <StatusIcon status={message.status} />
              <span>{STATUS_LABEL[message.status]}</span>
            </span>
          )}
        </div>
        {failed && message.error?.detail && (
          <p className="mt-1 text-[11px] text-destructive-emphasis">{message.error.detail}</p>
        )}
      </div>
    </div>
  );
}
