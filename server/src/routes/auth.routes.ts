/**
 * Auth routes (mounted at /api/auth).
 *
 * GET /me — returns the caller's identity for the client. Role + tenantId come from the
 * verified token (source of truth); name + email are read from users/{uid} with a fallback
 * to the Firebase Auth record when the Firestore profile is missing.
 */

import { Router } from 'express';

import type { AuthMeResponse } from '@thinkai/shared';

import { adminAuth } from '../config/firebase';
import { prisma } from '../config/db';
import { AppError } from '../lib/AppError';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyAuth } from '../middleware/authMiddleware';
import { verifyFirebaseUser } from '../middleware/verifyFirebaseUser';
import { rateLimit } from '../middleware/rateLimit';
import { provisionSelfServe } from '../controllers/auth/provisionController';

export const authRouter = Router();

/**
 * Abuse guard for the public signup endpoint: cap tenant-provisioning attempts per IP. Cheap,
 * so it runs BEFORE token verification. Generous enough for retries (verify-then-continue,
 * transient errors) but stops scripted account creation.
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many signup attempts. Please wait a while and try again.',
});

/**
 * POST /api/auth/register — self-serve provisioning. Uses the PERMISSIVE `verifyFirebaseUser`
 * (not `verifyAuth`) because a brand-new signup has a valid token but no role claim yet.
 */
authRouter.post('/register', registerLimiter, verifyFirebaseUser, asyncHandler(provisionSelfServe));

authRouter.get(
  '/me',
  verifyAuth,
  asyncHandler(async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      // verifyAuth guarantees req.auth, but keep the type-narrowing explicit.
      throw AppError.unauthorized();
    }

    // Prefer the Firestore profile for display fields; fall back to the Auth user record.
    let name = '';
    let email = '';

    const user = await prisma.user.findUnique({ where: { id: auth.uid } });
    if (user) {
      name = user.name ?? '';
      email = user.email ?? '';
    }

    if (!name || !email) {
      const authUser = await adminAuth.getUser(auth.uid);
      if (!name) name = authUser.displayName ?? '';
      if (!email) email = authUser.email ?? '';
    }

    const body: AuthMeResponse = {
      uid: auth.uid,
      role: auth.role,
      tenantId: auth.tenantId,
      name,
      email,
    };
    res.json(body);
  }),
);
