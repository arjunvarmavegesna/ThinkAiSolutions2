import { z } from 'zod';

/**
 * Template authoring schemas (feature 1.1 + media headers / interactive buttons).
 * Mirrors Meta's create-template constraints so we reject bad input before a Graph round-trip:
 *  - name: lowercase letters / digits / underscores only (Meta requirement), unique per WABA.
 *  - body: required, with positional {{n}} placeholders; one sample per placeholder.
 *  - header: text (<=60) OR a media header (IMAGE/VIDEO/DOCUMENT) carried as an uploaded handle.
 *  - buttons: call-to-action (URL/PHONE_NUMBER, max 2) OR quick-reply (max 3), never mixed.
 */

const buttonSchema = z
  .object({
    type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
    text: z.string().trim().min(1, 'Button text is required').max(25, 'Button text max 25 chars'),
    url: z.string().trim().url('Button URL must be a valid URL').max(2000).optional(),
    phoneNumber: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{6,15}$/, 'Phone number must be 6–15 digits, optionally starting with +')
      .optional(),
  })
  .refine((b) => b.type !== 'URL' || (b.url && b.url.length > 0), {
    message: 'A URL button requires a url',
    path: ['url'],
  })
  .refine((b) => b.type !== 'PHONE_NUMBER' || (b.phoneNumber && b.phoneNumber.length > 0), {
    message: 'A phone-number button requires a phone number',
    path: ['phoneNumber'],
  });

/**
 * Array-level button rules (apply to create + edit): the two families are mutually exclusive,
 * with at most 2 call-to-action buttons and at most 3 quick replies.
 */
const buttonsSchema = z
  .array(buttonSchema)
  .max(10)
  .superRefine((buttons, ctx) => {
    const cta = buttons.filter((b) => b.type === 'URL' || b.type === 'PHONE_NUMBER').length;
    const qr = buttons.filter((b) => b.type === 'QUICK_REPLY').length;
    if (cta > 0 && qr > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A template cannot mix call-to-action and quick-reply buttons',
      });
    }
    if (cta > 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At most 2 call-to-action buttons' });
    }
    if (qr > 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At most 3 quick-reply buttons' });
    }
  })
  .optional();

/** Fields shared by create + edit. */
const templateBodyFields = {
  category: z.enum(['marketing', 'utility', 'authentication']),
  language: z.string().trim().min(1, 'Language is required').max(20),
  body: z.string().trim().min(1, 'Body text is required').max(1024, 'Body max 1024 chars'),
  header: z.string().trim().max(60, 'Header max 60 chars').optional(),
  /** Media header format; paired with `headerHandle` (a resumable-upload file handle). */
  headerFormat: z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
  headerHandle: z.string().trim().min(1).max(4000).optional(),
  footer: z.string().trim().max(60, 'Footer max 60 chars').optional(),
  buttons: buttonsSchema,
  variableSamples: z.array(z.string()).max(50).optional(),
};

/** A media header needs its uploaded handle, and a template has either a text OR a media header. */
function refineHeader(
  data: { header?: string; headerFormat?: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; headerHandle?: string },
  ctx: z.RefinementCtx,
): void {
  if (data.headerFormat && !(data.headerHandle && data.headerHandle.length > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['headerHandle'],
      message: 'A media header requires an uploaded sample file',
    });
  }
  if (data.headerFormat && data.header && data.header.trim().length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['header'],
      message: 'A template has either a text header or a media header, not both',
    });
  }
}

export const createTemplateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Template name is required')
      .max(512)
      .regex(/^[a-z0-9_]+$/, 'Name may contain only lowercase letters, digits and underscores'),
    ...templateBodyFields,
  })
  .superRefine(refineHeader);

/** Edit takes the same fields minus the (immutable) name — it comes from the URL param. */
export const updateTemplateSchema = z.object(templateBodyFields).superRefine(refineHeader);

/** Media types Meta accepts for a template HEADER sample (image / video / document). */
export const TEMPLATE_HEADER_MIME: ReadonlySet<string> = new Set<string>([
  'image/jpeg',
  'image/png',
  'video/mp4',
  'application/pdf',
]);

/** Hard cap on the decoded sample-file size (bytes). */
export const MAX_TEMPLATE_SAMPLE_BYTES = 16 * 1024 * 1024;

/** POST /api/templates/sample-media — upload a sample header file (base64) for a resumable handle. */
export const sampleMediaSchema = z.object({
  fileName: z.string().trim().min(1, 'A file name is required').max(255),
  mimeType: z
    .string()
    .trim()
    .refine((m) => TEMPLATE_HEADER_MIME.has(m), {
      message: 'Unsupported header media type (use a JPEG/PNG image, MP4 video, or PDF document)',
    }),
  dataBase64: z.string().min(1, 'File data is required'),
});
