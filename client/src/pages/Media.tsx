/**
 * Manage Media (feature 2.1) — upload reusable images/documents/video to the tenant's media
 * library (stored in Meta's media store; we keep the media id + metadata). Lists assets with
 * an inline thumbnail for images (fetched through the authenticated preview proxy), the Meta
 * media id (handy for sends), and a delete action.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MediaAssetDTO } from '@thinkai/shared';
import { ApiError } from '../lib/apiClient';
import { Card } from '../components/ui/legacy-card';
import {
  deleteMedia,
  fetchMediaPreviewUrl,
  fileToBase64,
  listMedia,
  uploadMedia,
} from '../features/media/api';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmt(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Media(): JSX.Element {
  const [media, setMedia] = useState<MediaAssetDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMedia();
      setMedia(res.media);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load media.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      setNotice(null);
      try {
        const dataBase64 = await fileToBase64(file);
        await uploadMedia({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          dataBase64,
        });
        setNotice(`Uploaded ${file.name}.`);
        await load();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Upload failed.');
      } finally {
        setUploading(false);
      }
    },
    [load],
  );

  const handleDelete = useCallback(
    async (m: MediaAssetDTO) => {
      if (!window.confirm(`Delete “${m.fileName}”? This removes it from WhatsApp too.`)) return;
      setError(null);
      try {
        await deleteMedia(m.id);
        setNotice(`Deleted ${m.fileName}.`);
        await load();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Delete failed.');
      }
    },
    [load],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-baseline gap-2 text-sm text-gray-500">
        <span className="text-lg font-semibold text-gray-800">Media</span>
        <span>›</span>
        <span>Manage Media</span>
      </div>

      {notice && <div className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{notice}</div>}
      {error && <div className="rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      <Card title="Upload media" icon={<UploadIcon />}>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-6 py-8 text-center hover:border-brand-400">
          <UploadIcon />
          <span className="text-sm text-gray-600">
            {uploading ? 'Uploading…' : 'Click to choose an image, document or video'}
          </span>
          <span className="text-xs text-gray-400">JPG, PNG, PDF, MP4… up to 16 MB</span>
          <input
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = ''; // allow re-selecting the same file
            }}
          />
        </label>
      </Card>

      <Card title="Media library" icon={<ImageIcon />}>
        {loading ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading media…</p>
        ) : media.length === 0 ? (
          <p className="bg-gray-50 py-8 text-center text-sm text-gray-500">
            No media yet. Upload an image or document to reuse it in sends and templates.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {media.map((m) => (
              <MediaCard key={m.id} media={m} onDelete={() => void handleDelete(m)} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function MediaCard({ media, onDelete }: { media: MediaAssetDTO; onDelete: () => void }): JSX.Element {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = media.mimeType.startsWith('image/');

  useEffect(() => {
    if (!isImage) return;
    let url: string | null = null;
    let active = true;
    fetchMediaPreviewUrl(media.id)
      .then((u) => {
        if (active) {
          url = u;
          setPreviewUrl(u);
        } else {
          URL.revokeObjectURL(u);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [media.id, isImage]);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200">
      <div className="flex h-32 items-center justify-center bg-gray-50">
        {isImage && previewUrl ? (
          <img src={previewUrl} alt={media.fileName} className="h-full w-full object-cover" />
        ) : (
          <FileGlyph mime={media.mimeType} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-sm font-medium text-gray-800" title={media.fileName}>
          {media.fileName}
        </p>
        <p className="text-[11px] text-gray-400">
          {media.mimeType} · {humanSize(media.sizeBytes)}
        </p>
        <p className="truncate text-[11px] text-gray-400" title={media.metaMediaId}>
          id: {media.metaMediaId}
        </p>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">{fmt(media.createdAt)}</span>
          <button onClick={onDelete} className="text-xs font-medium text-rose-600 hover:text-rose-700">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function FileGlyph({ mime }: { mime: string }): JSX.Element {
  const label = mime.startsWith('video/') ? 'VIDEO' : mime.startsWith('audio/') ? 'AUDIO' : 'FILE';
  return (
    <div className="flex flex-col items-center gap-1 text-gray-400">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
      <span className="text-[10px] font-medium tracking-wide">{label}</span>
    </div>
  );
}

function UploadIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}
function ImageIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}
