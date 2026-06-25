/**
 * Runbook step 0 — bootstrap the first reseller admin.
 *
 * Finds (or creates) a Firebase Auth user for the given email, grants the reseller_admin
 * custom claims (tenantId = null), and writes the users/{uid} profile document so the API
 * and dashboard recognize the account.
 *
 * Usage (from /server):
 *   npx tsx src/scripts/bootstrap-admin.ts <email> [name] [password]
 * or via env:
 *   BOOTSTRAP_ADMIN_EMAIL=you@example.com \
 *   BOOTSTRAP_ADMIN_NAME="Owner" \
 *   BOOTSTRAP_ADMIN_PASSWORD="..." \
 *   npx tsx src/scripts/bootstrap-admin.ts
 *
 * The user must sign in (or refresh their ID token) for the new claims to take effect.
 */

import { adminAuth } from '../config/firebase';
import { prisma } from '../config/db';
import { msBig } from '../db/serde';
import { setUserClaims } from '../auth/claims';

interface BootstrapArgs {
  email: string;
  name: string;
  password?: string;
}

/** Resolve the script inputs from argv first, then environment variables. */
function readArgs(): BootstrapArgs {
  const [emailArg, nameArg, passwordArg] = process.argv.slice(2);

  const email = (emailArg ?? process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim();
  const name = (nameArg ?? process.env.BOOTSTRAP_ADMIN_NAME ?? '').trim() || 'Reseller Admin';
  const password = passwordArg ?? process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email) {
    throw new Error(
      'An admin email is required. Pass it as the first argument or set BOOTSTRAP_ADMIN_EMAIL.',
    );
  }
  return { email, name, password: password?.trim() || undefined };
}

/** Look up the Auth user by email; create one if it does not yet exist. */
async function findOrCreateAuthUser(args: BootstrapArgs): Promise<{ uid: string; created: boolean }> {
  try {
    const existing = await adminAuth.getUserByEmail(args.email);
    return { uid: existing.uid, created: false };
  } catch (err: unknown) {
    // Only "user not found" is recoverable here; anything else is a real failure.
    const code = (err as { code?: string } | null)?.code;
    if (code !== 'auth/user-not-found') throw err;

    const created = await adminAuth.createUser({
      email: args.email,
      displayName: args.name,
      emailVerified: false,
      // If no password is supplied, the admin can set one via a reset email later.
      ...(args.password ? { password: args.password } : {}),
    });
    return { uid: created.uid, created: true };
  }
}

async function main(): Promise<void> {
  const args = readArgs();

  const { uid, created } = await findOrCreateAuthUser(args);

  // Grant reseller_admin claims (tenantId is forced to null inside setUserClaims).
  await setUserClaims(uid, { role: 'reseller_admin', tenantId: null });

  // Write/merge the users/{uid} profile so the API + dashboard recognize the account.
  // upsert preserves an existing createdAt (the update clause leaves it untouched).
  await prisma.user.upsert({
    where: { id: uid },
    create: {
      id: uid,
      role: 'reseller_admin',
      tenantId: null,
      name: args.name,
      email: args.email,
      createdAt: msBig(Date.now()),
    },
    update: {
      role: 'reseller_admin',
      tenantId: null,
      name: args.name,
      email: args.email,
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      'Reseller admin bootstrapped.',
      `  uid:    ${uid}`,
      `  email:  ${args.email}`,
      `  status: ${created ? 'created new Auth user' : 'used existing Auth user'}`,
      `  role:   reseller_admin (tenantId=null)`,
      '',
      created && !args.password
        ? 'No password was set. Send a password-reset email from the Firebase console so the admin can sign in.'
        : 'The admin can sign in now. They must sign in (or refresh their ID token) for the new claims to apply.',
      '',
    ].join('\n'),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Bootstrap failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
