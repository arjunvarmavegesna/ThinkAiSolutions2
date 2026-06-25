/**
 * Live WhatsApp-style preview for the template editor. Pure + presentational: it reads the
 * current form state and renders a message bubble (header text/media placeholder, body with
 * {{n}} substituted by sample values, footer, and CTA / quick-reply buttons). No network, no
 * side effects — it mirrors what the recipient roughly sees so authors can iterate as they type.
 */

export type HeaderType = 'none' | 'text' | 'image' | 'video' | 'document';

/** Editor-local button draft (the modal owns it; preview + submit read it). */
export interface ButtonDraft {
  type: 'URL' | 'PHONE_NUMBER' | 'QUICK_REPLY';
  text: string;
  /** URL buttons. */
  url?: string;
  /** PHONE_NUMBER buttons — split into dial code + number for the form. */
  countryCode?: string;
  phone?: string;
}

interface TemplatePreviewProps {
  headerType: HeaderType;
  headerText: string;
  headerMediaName?: string;
  /** Object URL for an image sample, when available (image headers only). */
  headerPreviewUrl?: string;
  body: string;
  /** Distinct {{n}} placeholders in body order. */
  placeholders: number[];
  /** Sample value for each placeholder (same order as `placeholders`). */
  samples: string[];
  footer: string;
  buttons: ButtonDraft[];
}

/** Substitute each {{n}} with its sample value (falls back to the raw {{n}} when unset). */
function renderBody(body: string, placeholders: number[], samples: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, digits) => {
    const idx = placeholders.indexOf(Number(digits));
    const sample = idx >= 0 ? (samples[idx] ?? '').trim() : '';
    return sample.length > 0 ? sample : match;
  });
}

const MEDIA_ICON: Record<'image' | 'video' | 'document', string> = {
  image: '🖼️',
  video: '🎬',
  document: '📄',
};

const MEDIA_LABEL: Record<'image' | 'video' | 'document', string> = {
  image: 'Image',
  video: 'Video',
  document: 'Document',
};

function MediaHeader({
  type,
  fileName,
  previewUrl,
}: {
  type: 'image' | 'video' | 'document';
  fileName?: string;
  previewUrl?: string;
}): JSX.Element {
  if (type === 'image' && previewUrl) {
    return (
      <img
        src={previewUrl}
        alt={fileName ?? 'Header image'}
        className="mb-1.5 h-36 w-full rounded-lg object-cover"
      />
    );
  }
  return (
    <div className="mb-1.5 flex h-36 w-full flex-col items-center justify-center gap-1 rounded-lg bg-gray-100 text-gray-400">
      <span className="text-3xl">{MEDIA_ICON[type]}</span>
      <span className="max-w-[90%] truncate text-[11px]">{fileName ?? `${MEDIA_LABEL[type]} header`}</span>
    </div>
  );
}

export function TemplatePreview({
  headerType,
  headerText,
  headerMediaName,
  headerPreviewUrl,
  body,
  placeholders,
  samples,
  footer,
  buttons,
}: TemplatePreviewProps): JSX.Element {
  const bodyText = renderBody(body, placeholders, samples);
  const quickReplies = buttons.filter((b) => b.type === 'QUICK_REPLY');
  const ctaButtons = buttons.filter((b) => b.type === 'URL' || b.type === 'PHONE_NUMBER');

  return (
    <div className="flex flex-col">
      <span className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Preview</span>
      <div
        className="rounded-xl p-3"
        style={{ backgroundColor: '#efeae2' }}
        aria-label="WhatsApp message preview"
      >
        {/* Message bubble */}
        <div className="max-w-[85%] rounded-lg rounded-tl-none bg-white px-2.5 py-2 shadow-sm">
          {headerType === 'image' || headerType === 'video' || headerType === 'document' ? (
            <MediaHeader type={headerType} fileName={headerMediaName} previewUrl={headerPreviewUrl} />
          ) : null}

          {headerType === 'text' && headerText.trim().length > 0 && (
            <p className="mb-1 text-sm font-semibold text-gray-900">{headerText}</p>
          )}

          {bodyText.trim().length > 0 ? (
            <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{bodyText}</p>
          ) : (
            <p className="text-sm italic text-gray-400">Your message body will appear here…</p>
          )}

          {footer.trim().length > 0 && (
            <p className="mt-1 text-[11px] text-gray-400">{footer}</p>
          )}

          <span className="mt-1 block text-right text-[10px] text-gray-400">12:00</span>

          {/* Quick replies render as chips below the bubble content. */}
          {quickReplies.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 border-t border-gray-100 pt-1.5">
              {quickReplies.map((b, i) => (
                <span
                  key={i}
                  className="rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-sky-600"
                >
                  {b.text.trim() || 'Quick reply'}
                </span>
              ))}
            </div>
          )}

          {/* CTA buttons render as full-width rows with an icon. */}
          {ctaButtons.length > 0 && (
            <div className="mt-1.5 border-t border-gray-100">
              {ctaButtons.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center justify-center gap-1.5 border-b border-gray-50 py-1.5 text-sm font-medium text-sky-600 last:border-b-0"
                >
                  <span aria-hidden>{b.type === 'PHONE_NUMBER' ? '📞' : '🔗'}</span>
                  <span className="truncate">
                    {b.text.trim() || (b.type === 'PHONE_NUMBER' ? 'Call' : 'Visit')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
