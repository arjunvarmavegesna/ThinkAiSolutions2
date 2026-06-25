/**
 * Center pane for the selected conversation: header (contact + live window
 * countdown), the polled message list, the window-status banner, and the
 * window-gated composer. Empty-state hint when nothing is selected.
 */
import { ChevronLeft, MessageSquare } from 'lucide-react';
import type { ConversationDTO, MessageDTO } from '@thinkai/shared';
import { useServiceWindow, formatWindowRemaining } from '../hooks/useServiceWindow';
import { ContactAvatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { MessageList } from './MessageList';
import { ReplyComposer } from './ReplyComposer';
import { WindowStatusBanner } from './WindowStatusBanner';

interface ConversationThreadProps {
  conversation: ConversationDTO | null;
  messages: MessageDTO[];
  messagesLoading: boolean;
  messagesError: string | null;
  sending: boolean;
  sendError: string | null;
  onSendText: (body: string) => Promise<void>;
  onBack?: () => void;
}

export function ConversationThread({
  conversation,
  messages,
  messagesLoading,
  messagesError,
  sending,
  sendError,
  onSendText,
  onBack,
}: ConversationThreadProps): JSX.Element {
  const window = useServiceWindow(conversation);

  if (!conversation) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 bg-background text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <MessageSquare className="size-6" />
        </div>
        <p className="text-sm font-medium text-foreground">Select a conversation</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Pick a conversation from the list, or start a new one with an approved template.
        </p>
      </div>
    );
  }

  const title = conversation.contactName?.length ? conversation.contactName : conversation.contactPhone;

  return (
    <div className="flex h-full flex-1 flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="md:hidden -ml-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Back to conversations"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          <ContactAvatar name={conversation.contactName} phone={conversation.contactPhone} className="size-9 text-xs" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{conversation.contactPhone}</p>
          </div>
        </div>
        <Badge variant={window.open ? 'success' : 'outline'}>
          {window.open ? formatWindowRemaining(window.msRemaining) : 'Window closed'}
        </Badge>
      </div>

      <MessageList messages={messages} loading={messagesLoading} error={messagesError} />

      <WindowStatusBanner window={window} />

      <ReplyComposer windowOpen={window.open} sending={sending} error={sendError} onSend={onSendText} />
    </div>
  );
}
