import { z } from 'zod';

/**
 * Media upload schema (feature 2.1). The file arrives base64-encoded in JSON (no multipart dep).
 * We allow only WhatsApp-supported media types and cap the decoded size; the route mount also
 * enforces a JSON body limit as a second line of defence.
 */

/** WhatsApp Cloud API supported media MIME types (images, documents, audio, video, stickers). */
export const ALLOWED_MEDIA_MIME: ReadonlySet<string> = new Set<string>([
  // images
  'image/jpeg',
  'image/png',
  // stickers
  'image/webp',
  // documents
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // audio
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/amr',
  'audio/ogg',
  // video
  'video/mp4',
  'video/3gpp',
]);

/** Hard cap on the decoded file size (bytes). 16 MB comfortably covers images/docs/most video. */
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export const uploadMediaSchema = z.object({
  fileName: z.string().trim().min(1, 'A file name is required').max(255),
  mimeType: z
    .string()
    .trim()
    .refine((m) => ALLOWED_MEDIA_MIME.has(m), { message: 'Unsupported media type' }),
  dataBase64: z.string().min(1, 'File data is required'),
});
