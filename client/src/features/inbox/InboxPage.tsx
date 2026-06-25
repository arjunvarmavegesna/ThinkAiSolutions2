/**
 * Team inbox — Intercom-style three-pane layout.
 *
 * Left:   searchable, polled conversation list (~5s, paused when tab hidden).
 * Center: the selected thread with a live service-window badge + window-gated composer.
 * Right:  contact profile (shown on xl).
 * Modal:  send an approved template to start / re-open a conversation.
 *
 * Data flows through lib/apiClient; tenant scoping is enforced server-side.
 */
import { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { SendTemplateRequest } from '@thinkai/shared';
import { PageHeader } from '@/components/patterns/page-header';
import { Button } from '@/components/ui/button';
import { ConversationList } from './components/ConversationList';
import { ConversationThread } from './components/ConversationThread';
import { ContactProfile } from './components/ContactProfile';
import { SendTemplateModal } from './components/SendTemplateModal';
import { useConversations } from './hooks/useConversations';
import { useMessages } from './hooks/useMessages';
import { useSendMessage } from './hooks/useSendMessage';

export function InboxPage(): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  const {
    conversations,
    loading: conversationsLoading,
    error: conversationsError,
    refresh: refreshConversations,
  } = useConversations();

  const {
    messages,
    loading: messagesLoading,
    error: messagesError,
    refresh: refreshMessages,
  } = useMessages(selectedId);

  const { pending: sending, error: sendError, clearError, sendText, sendTemplateMessage } = useSendMessage();

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const handleSelect = useCallback(
    (id: string) => {
      clearError();
      setSelectedId(id);
    },
    [clearError],
  );

  const handleSendText = useCallback(
    async (body: string) => {
      if (!selectedId) return;
      const res = await sendText(selectedId, body);
      if (res) await Promise.all([refreshMessages(), refreshConversations()]);
    },
    [selectedId, sendText, refreshMessages, refreshConversations],
  );

  const handleSendTemplate = useCallback(
    async (req: SendTemplateRequest) => {
      const res = await sendTemplateMessage(req);
      if (res) {
        setTemplateModalOpen(false);
        setSelectedId(res.conversationId);
        await Promise.all([refreshConversations(), refreshMessages()]);
      }
    },
    [sendTemplateMessage, refreshConversations, refreshMessages],
  );

  const openTemplateModal = useCallback(() => {
    clearError();
    setTemplateModalOpen(true);
  }, [clearError]);

  const closeTemplateModal = useCallback(() => {
    setTemplateModalOpen(false);
    clearError();
  }, [clearError]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inbox"
        description="Two-way conversations inside the 24-hour service window."
        actions={
          <Button onClick={openTemplateModal}>
            <Plus />
            New conversation
          </Button>
        }
      />

      <div className="flex h-[calc(100vh-13rem)] min-h-[480px] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {/* Left panel: always visible on md+; on mobile shows only when no conversation is open */}
        <div className={`flex w-full max-w-[20rem] shrink-0 border-r border-border ${selectedId ? 'hidden md:flex' : 'flex'}`}>
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            loading={conversationsLoading}
            error={conversationsError}
            onSelect={handleSelect}
            onNewMessage={openTemplateModal}
          />
        </div>

        {/* Right panel: always visible on md+; on mobile shows only when a conversation is open */}
        <div className={`min-w-0 flex-1 ${selectedId ? 'flex' : 'hidden md:flex'}`}>
          <ConversationThread
            conversation={selectedConversation}
            messages={messages}
            messagesLoading={messagesLoading}
            messagesError={messagesError}
            sending={sending}
            sendError={sendError}
            onSendText={handleSendText}
            onBack={() => setSelectedId(null)}
          />
        </div>

        {selectedConversation && (
          <ContactProfile conversation={selectedConversation} className="hidden w-72 shrink-0 border-l border-border xl:flex" />
        )}
      </div>

      <SendTemplateModal
        open={templateModalOpen}
        initialPhone={selectedConversation?.contactPhone}
        sending={sending}
        error={sendError}
        onClose={closeTemplateModal}
        onSubmit={handleSendTemplate}
      />
    </div>
  );
}

export default InboxPage;
