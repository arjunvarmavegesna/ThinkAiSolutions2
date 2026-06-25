/**
 * User Attributes — tenant settings for custom contact fields (name + optional default) and the
 * tag palette (name + color). Attribute definitions drive the optional Contacts columns and the
 * future campaign personalization mapping. Saved via PUT /api/contact-attributes (replaces both).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContactAttributeDef, ContactTag } from '@thinkai/shared';

import { ApiError } from '../lib/apiClient';
import { Card } from '../components/ui/legacy-card';
import { getContactSettings, updateContactSettings } from '../features/contacts/api';

const inputCls =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

export function UserAttributes(): JSX.Element {
  const [attributes, setAttributes] = useState<ContactAttributeDef[]>([]);
  const [tags, setTags] = useState<ContactTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getContactSettings();
      setAttributes(s.attributes);
      setTags(s.tags);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const cleanAttrs = attributes
        .map((a) => ({ name: a.name.trim(), defaultValue: a.defaultValue?.trim() || undefined }))
        .filter((a) => a.name.length > 0);
      const cleanTags = tags
        .map((t) => ({ name: t.name.trim(), color: t.color }))
        .filter((t) => t.name.length > 0);
      const s = await updateContactSettings({ attributes: cleanAttrs, tags: cleanTags });
      setAttributes(s.attributes);
      setTags(s.tags);
      setNotice('Saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }, [attributes, tags]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-baseline gap-2 text-sm text-gray-500">
        <Link to="/contacts" className="text-brand-600 hover:underline">
          Contacts
        </Link>
        <span>›</span>
        <span className="text-lg font-semibold text-gray-800">User Attributes</span>
      </div>

      {notice && <div className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      <Card title="Custom attributes">
        <p className="mb-3 text-sm text-gray-500">
          Define fields like FName, Company, City. They become optional columns on Contacts and can
          personalize campaign variables.
        </p>
        <div className="space-y-2">
          {attributes.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={a.name}
                onChange={(e) =>
                  setAttributes((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
                placeholder="Attribute name (e.g. FName)"
                className={inputCls}
              />
              <input
                value={a.defaultValue ?? ''}
                onChange={(e) =>
                  setAttributes((p) =>
                    p.map((x, j) => (j === i ? { ...x, defaultValue: e.target.value } : x)),
                  )
                }
                placeholder="Default value (optional)"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setAttributes((p) => p.filter((_, j) => j !== i))}
                className="shrink-0 text-gray-400 hover:text-rose-600"
                aria-label="Remove attribute"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAttributes((p) => [...p, { name: '', defaultValue: '' }])}
          className="mt-2 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          + Add attribute
        </button>
      </Card>

      <Card title="Tags">
        <p className="mb-3 text-sm text-gray-500">Manage tags and their chip colors.</p>
        <div className="space-y-2">
          {tags.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={t.color}
                onChange={(e) => setTags((p) => p.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))}
                className="h-9 w-10 shrink-0 cursor-pointer rounded border border-gray-300"
                aria-label="Tag color"
              />
              <input
                value={t.name}
                onChange={(e) => setTags((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                placeholder="Tag name"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setTags((p) => p.filter((_, j) => j !== i))}
                className="shrink-0 text-gray-400 hover:text-rose-600"
                aria-label="Remove tag"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setTags((p) => [...p, { name: '', color: '#2563eb' }])}
          className="mt-2 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          + Add tag
        </button>
      </Card>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || loading}
          className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-gray-300"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
