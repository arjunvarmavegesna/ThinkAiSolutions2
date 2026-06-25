/**
 * Prisma client singleton — the Postgres data handle that replaced Firestore.
 *
 * Every server-side data access goes through this client (directly in the db/ repositories).
 * A single instance is reused across the process (and across hot reloads in dev) so we don't
 * exhaust Postgres connections. Firebase Admin is still initialized separately in
 * ./firebase, but ONLY for Auth (token verification + custom claims) — never for data.
 */

import { PrismaClient } from '@prisma/client';

import { config } from './env';

// Reuse a single client across dev hot-reloads (tsx watch) to avoid connection storms.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.isProd ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!config.isProd) globalForPrisma.prisma = prisma;
