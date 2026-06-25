/**
 * API keys card: create scoped keys for the client-facing /api/v1, view them (masked), and
 * revoke. A newly created key's secret is shown ONCE (same one-time-reveal pattern as the webhook
 * signing secret) — after that only the prefix is ever displayed.
 */
import { useCallback, useEffect, useState } from 'react';
import { API_SCOPES } from '@thinkai/shared';
import type { ApiKeyDTO, ApiScope, CreateApiKeyResponse } from '@thinkai/shared';

import { ApiError } from '../../lib/apiClient';
import { Card } from '../../components/ui/legacy-card';
import { createApiKey, listApiKeys, revokeApiKey } from './api';
import { formatTimestamp } from './format';
import { CopyButton } from './CopyButton';

const inputCls =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function ApiKeysCard(): JSX.Element {
  const [keys, setKeys] = useState<ApiKeyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiScope[]>([...API_SCOPES]);
  /** The freshly-created key — shown once, never re-fetchable. */
  const [newKey, setNewKey] = useState<CreateApiKeyResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listApiKeys();
      setKeys(res.keys);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load API keys.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleScope = (scope: ApiScope) => {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  };

  const create = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await createApiKey({ name: name.trim(), scopes });
      setNewKey(res);
      setName('');
      setScopes([...API_SCOPES]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create API key.');
    } finally {
      setCreating(false);
    }
  }, [name, scopes, load]);

  const revoke = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await revokeApiKey(id);
        await load();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not revoke API key.');
      }
    },
    [load],
  );

  const canCreate = name.trim().length > 0 && scopes.length > 0 && !creating;

  return (
    <Card title="API keys">
      <p className="mb-4 text-sm text-gray-500">
        Authenticate your server-to-server calls to <code>/api/v1</code> with a key:
        <code className="ml-1">Authorization: Bearer &lt;key&gt;</code>. Keys are scoped and shown once.
      </p>

      {error && <div className="mb-4 rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      {newKey && (
        <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Copy your new key now — it won’t be shown again.</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="grow break-all rounded bg-white px-2 py-1 font-mono text-xs text-gray-800">
              {newKey.apiKey}
            </code>
            <CopyButton value={newKey.apiKey} />
          </div>
        </div>
      )}

      {/* Create form */}
      <div className="rounded-lg border border-gray-200 p-4">
        <label className="mb-1 block text-sm font-medium text-gray-700">Key name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Production backend"
          className={inputCls}
        />
        <div className="mt-3">
          <p className="mb-2 text-sm font-medium text-gray-700">Scopes</p>
          <div className="grid grid-cols-2 gap-2">
            {API_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <code className="text-xs">{scope}</code>
              </label>
            ))}
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void create()}
            disabled={!canCreate}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-gray-300"
          >
            {creating ? 'Creating…' : 'Create key'}
          </button>
        </div>
      </div>

      {/* Existing keys */}
      <div className="mt-5">
        {keys.length === 0 && !loading ? (
          <p className="text-sm text-gray-500">No API keys yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Key</th>
                  <th className="py-2 pr-4 font-medium">Scopes</th>
                  <th className="py-2 pr-4 font-medium">Created</th>
                  <th className="py-2 pr-4 font-medium">Last used</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 text-gray-700">{k.name}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-gray-500">{k.keyPrefix}…</td>
                    <td className="py-2 pr-4 text-xs text-gray-500">{k.scopes.join(', ')}</td>
                    <td className="whitespace-nowrap py-2 pr-4 text-gray-600">{formatTimestamp(k.createdAt)}</td>
                    <td className="whitespace-nowrap py-2 pr-4 text-gray-600">
                      {k.lastUsedAt ? formatTimestamp(k.lastUsedAt) : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {k.revoked ? (
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">revoked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void revoke(k.id)}
                          className="text-xs font-medium text-rose-600 hover:underline"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
