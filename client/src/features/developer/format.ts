/** Display helpers for the Developer Hub webhook UI. */
import type { WebhookDeliveryStatus, WebhookEventType } from '@thinkai/shared';

/** Human labels for the subscribable event types (checkbox labels + log rows). */
export const EVENT_LABELS: Record<WebhookEventType, string> = {
  incoming_message: 'Incoming messages',
  message_status: 'Message status updates',
  template_status: 'Template status updates',
};

/** Short, locale-aware timestamp for the delivery log. */
export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Tailwind chip classes per delivery status. */
export function statusBadgeClass(status: WebhookDeliveryStatus): string {
  switch (status) {
    case 'delivered':
      return 'bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'bg-rose-50 text-rose-700';
    case 'delivering':
      return 'bg-amber-50 text-amber-700';
    default:
      return 'bg-gray-100 text-gray-600'; // queued
  }
}
