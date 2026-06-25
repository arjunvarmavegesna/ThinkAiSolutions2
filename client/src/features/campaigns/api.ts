import type {
  AudiencePreviewRequest,
  AudiencePreviewResponse,
  CampaignDetailResponse,
  CampaignReportResponse,
  CreateCampaignRequest,
  CreateCampaignResponse,
  ListCampaignsResponse,
} from '@thinkai/shared';
import { apiClient } from '../../lib/apiClient';

export const listCampaigns = (): Promise<ListCampaignsResponse> =>
  apiClient.get<ListCampaignsResponse>(`/campaigns?t=${Date.now()}`);

export const createCampaign = (body: CreateCampaignRequest): Promise<CreateCampaignResponse> =>
  apiClient.post<CreateCampaignResponse>('/campaigns', body);

/** Resolve a segment to a live recipient count (no write) for the create-campaign preview. */
export const previewAudience = (body: AudiencePreviewRequest): Promise<AudiencePreviewResponse> =>
  apiClient.post<AudiencePreviewResponse>('/campaigns/preview-audience', body);

/** Campaign detail + per-recipient progress. */
export const getCampaign = (id: string): Promise<CampaignDetailResponse> =>
  apiClient.get<CampaignDetailResponse>(`/campaigns/${encodeURIComponent(id)}?t=${Date.now()}`);

/** Campaign delivery funnel + a page of recipient rows (cursor-paginated). */
export const getCampaignReport = (
  id: string,
  cursor?: string,
): Promise<CampaignReportResponse> => {
  const params = new URLSearchParams({ t: String(Date.now()) });
  if (cursor) params.set('cursor', cursor);
  return apiClient.get<CampaignReportResponse>(
    `/campaigns/${encodeURIComponent(id)}/report?${params.toString()}`,
  );
};
