/**
 * Scrollable list of message bubbles for the open thread. Auto-scrolls to the
 * bottom when new messages arrive (the server returns ts-ascending order, so the
 * newest is last). Handles loading / empty / error states.
 */
import { useEffect, useRef } from 'react';
import type { MessageDTO } from '@thinkai/shared';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: MessageDTO[];
  loading: boolean;
  error: string | null;
}

export function MessageList({ messages, loading, error }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Scroll to the newest message whenever the count changes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  if (loading && messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-secondary/40 text-sm text-muted-foreground">
        Loading messages…
      </div>
    );
  }

  if (error && messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-secondary/40 px-4 text-center text-sm text-destructive-emphasis">
        {error}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-secondary/40 text-sm text-muted-foreground">
        No messages yet.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-secondary/40 px-3 py-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
