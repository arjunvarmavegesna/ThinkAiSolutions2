/**
 * Webhook configuration card: register the HTTPS callback URL, choose which event types to
 * receive, manage the HMAC signing secret (generated show-once), and enable/disable forwarding.
 *
 * Enabling requires a signing secret (we never deliver unsigned), so the enable toggle is locked
 * until one is generated — and the server enforces the same rule.
 */
import { useCallback, useEffect, useState } from 'react';
import { WEBHOOK_EVENT_TYPES } from '@thinkai/shared';
import type { WebhookEventType } from '@thinkai/shared';

import { ApiError } from '../../lib/apiClient';
import { Card } from '../../components/ui/legacy-card';
import { getWebhookConfig, rotateWebhookSecret, updateWebhookConfig } from './api';
import { EVENT_LABELS } from './format';
import { CopyButton } from './CopyButton';

const inputCls =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function WebhookConfigCard(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [eventTypes, setEventTypes] = useState<WebhookEventType[]>([]);
  const [secretLast4, setSecretLast4] = useState<string | undefined>(undefined);
  /** The freshly-generated secret — shown ONCE, never re-fetchable. */
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { config } = await getWebhookConfig();
      if (config) {
        setEnabled(config.enabled);
        setCallbackUrl(config.callbackUrl);
        setEventTypes(config.eventTypes);
        setSecretLast4(config.secretLast4);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load webhook settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEvent = (type: WebhookEventType) => {
    setEventTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { config } = await updateWebhookConfig({ enabled, callbackUrl, eventTypes });
      setSecretLast4(config.secretLast4);
      setNotice('Webhook settings saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save webhook settings.');
    } finally {
      setSaving(false);
    }
  }, [enabled, callbackUrl, eventTypes]);

  const rotate = useCallback(async () => {
    setRotating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await rotateWebhookSecret();
      setNewSecret(res.signingSecret);
      setSecretLast4(res.secretLast4);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate signing secret.');
    } finally {
      setRotating(false);
    }
  }, []);

  const hasSecret = Boolean(secretLast4);

  return (
    <Card title="Webhook endpoint">
      <p className="mb-4 text-sm text-gray-500">
        We POST a clean, signed JSON payload to your HTTPS URL when the selected events happen. Verify
        each request with the <code>X-ThinkAi-Signature</code> header (HMAC-SHA256 of the raw body).
      </p>

      {notice && (
        <div className="mb-4 rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}</div>
      )}
      {error && <div className="mb-4 rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      <label className="mb-1 block text-sm font-medium text-gray-700">Callback URL</label>
      <input
        value={callbackUrl}
        onChange={(e) => setCallbackUrl(e.target.value)}
        placeholder="https://example.com/webhooks/thinkai"
        className={inputCls}
      />

      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-gray-700">Events to receive</p>
        <div className="space-y-2">
          {WEBHOOK_EVENT_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={eventTypes.includes(type)}
                onChange={() => toggleEvent(type)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              {EVENT_LABELS[type]}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-gray-200 p-4">
        <p className="text-sm font-medium text-gray-700">Signing secret</p>
        {newSecret ? (
          <div className="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Copy this secret now — it won’t be shown again.</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="grow break-all rounded bg-white px-2 py-1 font-mono text-xs text-gray-800">
                {newSecret}
              </code>
              <CopyButton value={newSecret} />
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm text-gray-500">
            {hasSecret ? `A secret is set (ends in …${secretLast4}).` : 'No signing secret generated yet.'}
          </p>
        )}
        <button
          type="button"
          onClick={() => void rotate()}
          disabled={rotating}
          className="mt-3 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {rotating ? 'Generating…' : hasSecret ? 'Rotate secret' : 'Generate secret'}
        </button>
      </div>

      <label className="mt-5 flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!hasSecret}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
        />
        Enable webhook delivery
      </label>
      {!hasSecret && (
        <p className="mt-1 text-xs text-gray-400">Generate a signing secret to enable delivery.</p>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-gray-300"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </Card>
  );
}
