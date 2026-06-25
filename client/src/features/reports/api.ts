import type { DailyReportResponse, QualityResponse, ReportMessagesResponse } from '@thinkai/shared';
import { apiClient } from '../../lib/apiClient';

/** Filters for the API / Message Report (2.4). Dates are epoch ms. */
export interface MessageReportFilters {
  from?: number;
  to?: number;
  status?: string;
  category?: string;
  channel?: string;
  direction?: string;
  q?: string;
  limit?: number;
}

/** GET /api/reports/messages — filtered, capped message log for the tenant. */
export function getMessageReport(f: MessageReportFilters = {}): Promise<ReportMessagesResponse> {
  const qs = new URLSearchParams();
  if (f.from != null) qs.set('from', String(f.from));
  if (f.to != null) qs.set('to', String(f.to));
  if (f.status) qs.set('status', f.status);
  if (f.category) qs.set('category', f.category);
  if (f.channel) qs.set('channel', f.channel);
  if (f.direction) qs.set('direction', f.direction);
  if (f.q) qs.set('q', f.q);
  if (f.limit != null) qs.set('limit', String(f.limit));
  qs.set('t', String(Date.now())); // cache-buster (the API layer also sets no-store)
  return apiClient.get<ReportMessagesResponse>(`/reports/messages?${qs.toString()}`);
}

/** GET /api/reports/daily — per-day funnel + spend for the selected range. */
export function getDailyReport(
  f: { from?: number; to?: number; channel?: string } = {},
): Promise<DailyReportResponse> {
  const qs = new URLSearchParams();
  if (f.from != null) qs.set('from', String(f.from));
  if (f.to != null) qs.set('to', String(f.to));
  if (f.channel) qs.set('channel', f.channel);
  qs.set('t', String(Date.now()));
  return apiClient.get<DailyReportResponse>(`/reports/daily?${qs.toString()}`);
}

/** GET /api/quality — per-number quality rating + tier + history. `refresh` pulls live from Meta. */
export function getQuality(refresh = false): Promise<QualityResponse> {
  const qs = new URLSearchParams({ t: String(Date.now()) });
  if (refresh) qs.set('refresh', '1');
  return apiClient.get<QualityResponse>(`/quality?${qs.toString()}`);
}
