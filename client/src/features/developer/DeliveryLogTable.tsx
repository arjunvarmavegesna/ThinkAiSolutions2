/**
 * Recent webhook deliveries — the client-facing debugging log. Shows each attempt's event type,
 * status (+ HTTP code), attempts, and the most recent error, newest first, with "Load more".
 */
import { useCallback, useEffect, useState } from 'react';
import type { WebhookDeliveryDTO } from '@thinkai/shared';

import { ApiError } from '../../lib/apiClient';
import { Card } from '../../components/ui/legacy-card';
import { listWebhookDeliveries } from './api';
import { EVENT_LABELS, formatTimestamp, statusBadgeClass } from './format';

export function DeliveryLogTable(): JSX.Element {
  const [items, setItems] = useState<WebhookDeliveryDTO[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (next?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listWebhookDeliveries(next);
      setItems((prev) => (next ? [...prev, ...res.items] : res.items));
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load delivery log.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card
      title="Delivery log"
      actions={
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          Refresh
        </button>
      }
    >
      {error && <div className="mb-3 rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      {items.length === 0 && !loading ? (
        <p className="text-sm text-gray-500">No deliveries yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-4 font-medium">When</th>
                <th className="py-2 pr-4 font-medium">Event</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Attempts</th>
                <th className="py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-b border-gray-100">
                  <td className="whitespace-nowrap py-2 pr-4 text-gray-600">{formatTimestamp(d.createdAt)}</td>
                  <td className="py-2 pr-4 text-gray-700">{EVENT_LABELS[d.eventType]}</td>
                  <td className="py-2 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(d.status)}`}>
                      {d.status}
                      {d.lastStatusCode !== undefined ? ` · ${d.lastStatusCode}` : ''}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-gray-600">
                    {d.attempts}/{d.maxAttempts}
                  </td>
                  <td className="py-2 text-xs text-gray-500">{d.lastError ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => void load(cursor)}
            disabled={loading}
            className="rounded border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </Card>
  );
}
