/**
 * Tenant dashboard stats — feeds the Twincles-style home (stat cards + charts).
 *
 *   GET /api/dashboard/stats  (verifyAuth + requireTenant)
 *
 * Returns outbound message counts (submitted / sent / delivered / failed) for TODAY and the
 * LAST 30 DAYS, plus a 14-day daily series for the line chart. Counts are derived from the
 * tenant's messages. We query a single ts range (auto-indexed) and filter direction/status
 * in memory — fine for Phase-1 volumes.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';

import type { Message } from '@thinkai/shared';

import { prisma } from '../config/db';
import { msBig } from '../db/serde';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyAuth } from '../middleware/authMiddleware';
import { requireTenant } from '../middleware/guards';

export const dashboardRouter = Router();

interface Counts {
  submitted: number;
  sent: number;
  delivered: number;
  failed: number;
}
const empty = (): Counts => ({ submitted: 0, sent: 0, delivered: 0, failed: 0 });

function tally(c: Counts, status: Message['status']): void {
  c.submitted += 1;
  if (status === 'sent' || status === 'delivered' || status === 'read') c.sent += 1;
  if (status === 'delivered' || status === 'read') c.delivered += 1;
  if (status === 'failed') c.failed += 1;
}

dashboardRouter.get(
  '/stats',
  verifyAuth,
  requireTenant,
  asyncHandler(async (_req: Request, res: Response) => {
    const tenantId = res.locals.tenantId as string;
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const start30 = now - 30 * DAY;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startTodayMs = startOfToday.getTime();

    const messages = await prisma.message.findMany({
      where: { tenantId, ts: { gte: msBig(start30) }, direction: 'out' },
      select: { status: true, ts: true },
    });

    const today = empty();
    const last30 = empty();
    const byDay = new Map<string, Counts>();

    for (const row of messages) {
      const status = row.status as Message['status'];
      const ts = Number(row.ts);
      tally(last30, status);
      if (ts >= startTodayMs) tally(today, status);
      const key = new Date(ts).toISOString().slice(0, 10);
      const bucket = byDay.get(key) ?? empty();
      tally(bucket, status);
      byDay.set(key, bucket);
    }

    // 14-day daily series (oldest -> newest) for the line chart.
    const daily: Array<{ date: string } & Counts> = [];
    for (let i = 13; i >= 0; i--) {
      const key = new Date(now - i * DAY).toISOString().slice(0, 10);
      daily.push({ date: key.slice(5), ...(byDay.get(key) ?? empty()) });
    }

    res.json({ today, last30, daily });
  }),
);
