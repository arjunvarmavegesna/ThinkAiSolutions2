import type {
  ListMediaResponse,
  UploadMediaRequest,
  UploadMediaResponse,
} from '@thinkai/shared';
import { apiClient } from '../../lib/apiClient';

/** List the tenant's media assets (newest first). */
export const listMedia = (): Promise<ListMediaResponse> =>
  apiClient.get<ListMediaResponse>(`/media?t=${Date.now()}`);

/** Upload a base64-encoded file to the media library. */
export const uploadMedia = (body: UploadMediaRequest): Promise<UploadMediaResponse> =>
  apiClient.post<UploadMediaResponse>('/media', body);

/** Delete a media asset (Meta + local record). */
export const deleteMedia = (id: string): Promise<void> =>
  apiClient.del<void>(`/media/${encodeURIComponent(id)}`);

/** Fetch a media asset's bytes (authenticated) as an object URL for inline preview. */
export const fetchMediaPreviewUrl = async (id: string): Promise<string> => {
  const blob = await apiClient.getBlob(`/media/${encodeURIComponent(id)}/preview`);
  return URL.createObjectURL(blob);
};

/** Read a File as base64 (without the data: URI prefix), for the upload payload. */
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
