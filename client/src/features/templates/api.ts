import type {
  CreateTemplateRequest,
  CreateTemplateResponse,
  ListTemplatesResponse,
  UpdateTemplateRequest,
  UploadTemplateSampleRequest,
  UploadTemplateSampleResponse,
} from '@thinkai/shared';
import { apiClient } from '../../lib/apiClient';

/** All templates for the tenant (any status). Cache-buster keeps it fresh. */
export const listTemplates = (): Promise<ListTemplatesResponse> =>
  apiClient.get<ListTemplatesResponse>(`/templates?t=${Date.now()}`);

/** Pull templates from WhatsApp (Meta) into Firestore; returns how many were upserted. */
export const syncTemplatesFromBsp = (): Promise<{ synced: number }> =>
  apiClient.post<{ synced: number }>('/templates/sync');

/** Author a template and submit it to Meta for review. */
export const createTemplate = (req: CreateTemplateRequest): Promise<CreateTemplateResponse> =>
  apiClient.post<CreateTemplateResponse>('/templates', req);

/** Edit a template (re-submits to Meta). */
export const updateTemplate = (
  name: string,
  req: UpdateTemplateRequest,
): Promise<CreateTemplateResponse> =>
  apiClient.put<CreateTemplateResponse>(`/templates/${encodeURIComponent(name)}`, req);

/** Delete a template (Meta + local). */
export const deleteTemplate = (name: string): Promise<void> =>
  apiClient.del<void>(`/templates/${encodeURIComponent(name)}`);

/**
 * Upload a sample media file for a media header (base64) and get back the resumable-upload
 * handle to pass as CreateTemplateRequest.headerHandle. Distinct from the media library.
 */
export const uploadTemplateSampleMedia = (
  body: UploadTemplateSampleRequest,
): Promise<UploadTemplateSampleResponse> =>
  apiClient.post<UploadTemplateSampleResponse>('/templates/sample-media', body);

/** Read a File as base64 (without the data: URI prefix), for the sample-media upload payload. */
export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
