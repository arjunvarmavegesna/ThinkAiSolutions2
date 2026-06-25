/**
 * Local view types for the team inbox feature.
 *
 * The canonical wire shapes come from '@thinkai/shared' (ConversationDTO,
 * MessageDTO, TemplateDTO, etc.). These local aliases / helper types exist only
 * to keep component props readable and to model a few UI-only states that never
 * cross the network (e.g. an optimistic "sending" flag).
 */
import type {
  ConversationDTO,
  MessageDTO,
  TemplateDTO,
} from '@thinkai/shared';

/** A conversation row as rendered in the list pane. */
export type InboxConversation = ConversationDTO;

/** A single message as rendered in a thread. */
export type InboxMessage = MessageDTO;

/** An approved template available in the send-template modal. */
export type InboxTemplate = TemplateDTO;

/** Polling intervals (ms) per the client contract. */
export const CONVERSATIONS_POLL_MS = 5000;
export const MESSAGES_POLL_MS = 3000;

/**
 * Result of attempting a send action from a hook. `pending` is the in-flight
 * flag the composer/modal use to disable inputs and show progress.
 */
export interface SendState {
  pending: boolean;
  error: string | null;
}
