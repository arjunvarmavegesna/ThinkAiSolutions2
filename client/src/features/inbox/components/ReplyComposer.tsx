/**
 * Free-text reply composer. Disabled (input + button) whenever the service
 * window is closed or a send is in flight, per the client contract. Submits on
 * Enter (Shift+Enter inserts a newline). The parent owns the actual send and the
 * window state; this component is purely presentational + input handling.
 *
 * Quick replies are a purely client-side convenience: tapping a chip splices the
 * canned text into the field at the caret. No API, no persistence — they never
 * change what gets sent beyond inserting text the agent can still edit.
 */
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { SendHorizontal, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ReplyComposerProps {
  windowOpen: boolean;
  sending: boolean;
  error: string | null;
  onSend: (body: string) => Promise<void>;
}

/** Canned one-tap replies (client-only). */
const QUICK_REPLIES = [
  'Hi! How can I help you today?',
  'Thanks for reaching out 🙏',
  'Could you share a few more details?',
  'Your request is being processed.',
  'Is there anything else I can help with?',
];

export function ReplyComposer({ windowOpen, sending, error, onSend }: ReplyComposerProps): JSX.Element {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const disabled = !windowOpen || sending;
  const trimmed = value.trim();
  const canSend = !disabled && trimmed.length > 0;

  /** Splice a quick reply at the caret (or end), then restore focus + caret. */
  function insertQuickReply(text: string): void {
    const el = textareaRef.current;
    const cur = value;
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const needsSpace = start > 0 && !/\s$/.test(cur.slice(0, start));
    const snippet = (needsSpace ? ' ' : '') + text;
    const next = cur.slice(0, start) + snippet + cur.slice(end);
    setValue(next);
    const caret = start + snippet.length;
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (node) {
        node.focus();
        node.setSelectionRange(caret, caret);
      }
    });
  }

  async function submit(): Promise<void> {
    if (!canSend) return;
    const body = trimmed;
    // Optimistically clear so the agent can keep typing; the thread poll will
    // reflect the sent message. If the send fails the error banner explains.
    setValue('');
    await onSend(body);
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    void submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-border bg-card px-3 py-3">
      {error && <p className="mb-2 text-xs text-destructive-emphasis">{error}</p>}

      {windowOpen && (
        <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Zap className="size-3" />
            Quick
          </span>
          {QUICK_REPLIES.map((q) => (
            <button
              key={q}
              type="button"
              disabled={disabled}
              onClick={() => insertQuickReply(q)}
              className="shrink-0 whitespace-nowrap rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary-emphasis disabled:pointer-events-none disabled:opacity-50"
            >
              {q.length > 28 ? `${q.slice(0, 28)}…` : q}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={windowOpen ? 'Type a reply…' : 'Window closed — send a template to reply'}
          className={cn(
            'max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-sm shadow-xs transition-colors',
            'placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
            'disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground',
          )}
        />
        <Button type="submit" size="lg" disabled={!canSend} className="h-10 shrink-0">
          <SendHorizontal />
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  );
}
