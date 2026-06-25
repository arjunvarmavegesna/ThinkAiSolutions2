import type {
  BulkActionRequest,
  BulkActionResponse,
  ContactDTO,
  ContactSettingsResponse,
  CreateContactRequest,
  ImportContactsRequest,
  ImportContactsResponse,
  ListContactsResponse,
  UpdateContactRequest,
  UpdateContactSettingsRequest,
} from '@thinkai/shared';
import { apiClient } from '../../lib/apiClient';

export interface ListContactsParams {
  search?: string;
  tag?: string;
  optInStatus?: string;
  source?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

/** GET /api/contacts — filtered/searched, cursor-paginated list. */
export const listContacts = (p: ListContactsParams = {}): Promise<ListContactsResponse> => {
  const qs = new URLSearchParams();
  if (p.search) qs.set('search', p.search);
  if (p.tag) qs.set('tag', p.tag);
  if (p.optInStatus) qs.set('optInStatus', p.optInStatus);
  if (p.source) qs.set('source', p.source);
  if (p.status) qs.set('status', p.status);
  if (p.cursor) qs.set('cursor', p.cursor);
  if (p.limit) qs.set('limit', String(p.limit));
  qs.set('t', String(Date.now()));
  return apiClient.get<ListContactsResponse>(`/contacts?${qs.toString()}`);
};

/** POST /api/contacts — add (upsert by phone). */
export const createContact = (body: CreateContactRequest): Promise<ContactDTO> =>
  apiClient.post<ContactDTO>('/contacts', body);

/** PATCH /api/contacts/:id — edit. */
export const updateContact = (id: string, body: UpdateContactRequest): Promise<ContactDTO> =>
  apiClient.patch<ContactDTO>(`/contacts/${encodeURIComponent(id)}`, body);

/** DELETE /api/contacts/:id. */
export const deleteContact = (id: string): Promise<void> =>
  apiClient.del<void>(`/contacts/${encodeURIComponent(id)}`);

/** DELETE /api/contacts — removes ALL contacts for the tenant. */
export const deleteAllContacts = (): Promise<{ deleted: number }> =>
  apiClient.del<{ deleted: number }>('/contacts');

/** POST /api/contacts/import — one chunk of mapped rows. */
export const importContacts = (body: ImportContactsRequest): Promise<ImportContactsResponse> =>
  apiClient.post<ImportContactsResponse>('/contacts/import', body);

/** POST /api/contacts/bulk-action — tag/untag/delete a selection. */
export const bulkAction = (body: BulkActionRequest): Promise<BulkActionResponse> =>
  apiClient.post<BulkActionResponse>('/contacts/bulk-action', body);

/** GET /api/contact-attributes — attribute defs + tag palette. */
export const getContactSettings = (): Promise<ContactSettingsResponse> =>
  apiClient.get<ContactSettingsResponse>(`/contact-attributes?t=${Date.now()}`);

/** PUT /api/contact-attributes — replace attribute defs + tag palette. */
export const updateContactSettings = (
  body: UpdateContactSettingsRequest,
): Promise<ContactSettingsResponse> =>
  apiClient.put<ContactSettingsResponse>('/contact-attributes', body);
