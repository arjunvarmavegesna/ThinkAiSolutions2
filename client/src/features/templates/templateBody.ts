/**
 * Read-only helpers to derive preview-friendly fields from a stored template.
 *
 * Locally-authored templates keep their text in `body`; templates synced from Meta store the
 * full component set JSON-encoded in `components` (a string, because Meta's example arrays can't
 * live in Firestore). These helpers normalize both shapes so the gallery + preview can render a
 * faithful approximation without any network calls. Pure + presentational — no side effects.
 */
import type { TemplateDTO } from '@thinkai/shared';
import type { ButtonDraft, HeaderType } from './TemplatePreview';

interface RawButton {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
}

interface RawComponent {
  type?: string;
  format?: string;
  text?: string;
  buttons?: RawButton[];
  /** Media-header sample: Meta returns a CDN URL to the uploaded example here. */
  example?: { header_handle?: string[] };
}

/** Parse the JSON-encoded `components` field into an array (empty on absence/malformed input). */
function parseComponents(t: TemplateDTO): RawComponent[] {
  const raw = t.components;
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? (parsed as RawComponent[]) : [];
  } catch {
    return [];
  }
}

function findComponent(comps: RawComponent[], type: string): RawComponent | undefined {
  return comps.find((c) => String(c.type).toUpperCase() === type);
}

/**
 * BODY text for previews: prefer a locally-stored `body`, else extract the BODY component text
 * from the synced Meta components.
 */
export function templateBodyText(t: TemplateDTO | null | undefined): string {
  if (!t) return '';
  if (t.body && t.body.trim()) return t.body;
  const body = findComponent(parseComponents(t), 'BODY');
  return typeof body?.text === 'string' ? body.text : '';
}

export interface TemplatePreviewModel {
  headerType: HeaderType;
  headerText: string;
  /** Meta CDN URL of the sample image for an IMAGE header (may expire / 404). */
  headerImageUrl?: string;
  body: string;
  footer: string;
  buttons: ButtonDraft[];
  placeholders: number[];
}

/** Distinct positional placeholders in body order, e.g. "Hi {{1}}, {{2}}" -> [1, 2]. */
function placeholderNumbers(body: string): number[] {
  const matches = body.match(/\{\{\s*\d+\s*\}\}/g);
  if (!matches) return [];
  const nums = matches.map((m) => Number(m.replace(/[^\d]/g, '')));
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}

const HEADER_FORMAT: Record<string, HeaderType> = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  DOCUMENT: 'document',
};

/** Build a full preview model (header / body / footer / buttons) from a stored template. */
export function toPreviewModel(t: TemplateDTO): TemplatePreviewModel {
  const comps = parseComponents(t);
  const header = findComponent(comps, 'HEADER');
  const footer = findComponent(comps, 'FOOTER');
  const buttonsComp = findComponent(comps, 'BUTTONS');

  const body = templateBodyText(t);
  const headerType: HeaderType = header ? (HEADER_FORMAT[String(header.format).toUpperCase()] ?? 'none') : 'none';
  const headerImageUrl =
    headerType === 'image' ? header?.example?.header_handle?.[0] : undefined;

  const buttons: ButtonDraft[] = (buttonsComp?.buttons ?? []).map((b) => {
    const type = String(b.type).toUpperCase();
    if (type === 'URL') return { type: 'URL', text: b.text ?? '', url: b.url };
    if (type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text ?? '', phone: b.phone_number };
    return { type: 'QUICK_REPLY', text: b.text ?? '' };
  });

  return {
    headerType,
    headerText: headerType === 'text' ? (header?.text ?? '') : '',
    headerImageUrl,
    body,
    footer: footer?.text ?? '',
    buttons,
    placeholders: placeholderNumbers(body),
  };
}
