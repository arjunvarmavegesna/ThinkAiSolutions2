/**
 * Reports (Phase 2) — tenant-scoped, derived entirely from stored `messages` / `campaigns`
 * (NO Meta/Graph calls). Mounted at /api/reports; every route is verifyAuth + requireTenant.
 *
 *   GET /api/reports/messages   -> API / Message Report (2.4): filtered, paged message log
 *
 * Daily Report (2.3) and Campaign Tracking (2.2) land in later steps.
 *
 * Query strategy mirrors the dashboard: a single range query on `ts` (auto-indexed, so no
 * composite index) capped for safety, then filter status/category/channel/direction/search in
 * memory. `truncated` is surfaced honestly when the cap is hit so we never silently drop rows.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type {
  DailyReportResponse,
  DailyReportRow,
  ReportMessageRow,
  ReportMessagesResponse,
} from '@thinkai/shared';

import { prisma } from '../config/db';
import { toMessage } from '../db/mappers';
import { msBig } from '../db/serde';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireTenant } from '../middleware/guards';

export const reportsRouter = Router();

const DAY = 24 * 60 * 60 * 1000;
const SCAN_CAP = 5000; // max docs scanned per range query (safety bound; surfaced as `truncated`)
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/** Parse a numeric query param (epoch ms / count); undefined when absent or non-numeric. */
function parseNum(v: unknown): number | undefined {
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Read a string query param, trimmed; undefined when absent/empty. */
function parseStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

// ---- 2.4 API / Message Report ----
reportsRouter.get(
  '/messages',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const now = Date.now();

    const from = parseNum(req.query.from) ?? now - 30 * DAY;
    const to = parseNum(req.query.to) ?? now;
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseNum(req.query.limit) ?? DEFAULT_LIMIT));
    const status = parseStr(req.query.status);
    const category = parseStr(req.query.category);
    const channel = parseStr(req.query.channel);
    const direction = parseStr(req.query.direction);
    const q = (parseStr(req.query.q) ?? '').toLowerCase();

    // Range on `ts` only. Cap the scan; filter the rest in memory.
    const scanned = await prisma.message.findMany({
      where: { tenantId, ts: { gte: msBig(from), lte: msBig(to) } },
      orderBy: { ts: 'desc' },
      take: SCAN_CAP,
    });
    const truncated = scanned.length >= SCAN_CAP;

    const rows: ReportMessageRow[] = [];
    let total = 0;

    for (const row of scanned) {
      const m = toMessage(row);
      const ch = m.channel ?? 'whatsapp'; // legacy docs predate the channel field
      if (status && m.status !== status) continue;
      if (category && m.category !== category) continue;
      if (channel && ch !== channel) continue;
      if (direction && m.direction !== direction) continue;
      if (
        q &&
        !(m.contactPhone ?? '').toLowerCase().includes(q) &&
        !(m.templateName ?? '').toLowerCase().includes(q)
      ) {
        continue;
      }

      total += 1;
      if (rows.length < limit) {
        rows.push({
          id: m.id,
          ts: m.ts,
          direction: m.direction,
          channel: ch,
          contactPhone: m.contactPhone,
          type: m.type,
          ...(m.templateName ? { templateName: m.templateName } : {}),
          status: m.status,
          category: m.category,
          costPaise: m.costPaise ?? 0,
          ...(m.error ? { error: m.error } : {}),
        });
      }
    }

    const body: ReportMessagesResponse = { rows, total, truncated };
    res.json(body);
  }),
);

/** UTC day key (yyyy-mm-dd) for an epoch-ms timestamp. */
function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Mutable accumulator per day; serialised into a DailyReportRow at the end. */
interface DayAccum {
  submitted: number;
  sent: number;
  delivered: number;
  failed: number;
  received: number;
  costPaise: number;
}
const emptyDay = (): DayAccum => ({
  submitted: 0,
  sent: 0,
  delivered: 0,
  failed: 0,
  received: 0,
  costPaise: 0,
});

const MAX_DAYS = 366; // cap the filled series so a huge range can't blow up the response

// ---- 2.3 Daily Report ----
reportsRouter.get(
  '/daily',
  verifyAuth,
  requireTenant,
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const now = Date.now();

    const from = parseNum(req.query.from) ?? now - 30 * DAY;
    const to = parseNum(req.query.to) ?? now;
    const channel = parseStr(req.query.channel);

    const scanned = await prisma.message.findMany({
      where: { tenantId, ts: { gte: msBig(from), lte: msBig(to) } },
      orderBy: { ts: 'desc' },
      take: SCAN_CAP,
    });
    const truncated = scanned.length >= SCAN_CAP;

    // Tally each message into its UTC day bucket. Outbound feeds the send funnel + spend;
    // inbound feeds `received`. Mirrors the dashboard's status semantics.
    const buckets = new Map<string, DayAccum>();
    for (const row of scanned) {
      const m = toMessage(row);
      const ch = m.channel ?? 'whatsapp';
      if (channel && ch !== channel) continue;
      const key = dayKey(m.ts);
      const acc = buckets.get(key) ?? emptyDay();
      if (m.direction === 'in') {
        acc.received += 1;
      } else {
        acc.submitted += 1;
        if (m.status === 'sent' || m.status === 'delivered' || m.status === 'read') acc.sent += 1;
        if (m.status === 'delivered' || m.status === 'read') acc.delivered += 1;
        if (m.status === 'failed') acc.failed += 1;
        acc.costPaise += m.costPaise ?? 0;
      }
      buckets.set(key, acc);
    }

    // Fill a continuous day series across [from, to] (zeros for empty days), capped at MAX_DAYS.
    const rows: DailyReportRow[] = [];
    const totals = emptyDay();
    let cursor = Date.parse(`${dayKey(from)}T00:00:00.000Z`);
    const endDay = Date.parse(`${dayKey(to)}T00:00:00.000Z`);
    let guard = 0;
    while (cursor <= endDay && guard < MAX_DAYS) {
      const key = dayKey(cursor);
      const a = buckets.get(key) ?? emptyDay();
      rows.push({ date: key, ...a });
      totals.submitted += a.submitted;
      totals.sent += a.sent;
      totals.delivered += a.delivered;
      totals.failed += a.failed;
      totals.received += a.received;
      totals.costPaise += a.costPaise;
      cursor += DAY;
      guard += 1;
    }

    const body: DailyReportResponse = { rows, totals, truncated };
    res.json(body);
  }),
);
