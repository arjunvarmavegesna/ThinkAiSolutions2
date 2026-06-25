/**
 * One-off helper — reset a Firebase Auth user's password by email.
 * Usage (from /server):  npx tsx src/scripts/reset-password.ts <email> <newPassword>
 */
import { adminAuth } from '../config/firebase';

async function main(): Promise<void> {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) throw new Error('Usage: reset-password.ts <email> <newPassword>');

  const user = await adminAuth.getUserByEmail(email);
  await adminAuth.updateUser(user.uid, { password });

  // eslint-disable-next-line no-console
  console.log(`Password reset for ${email} (uid=${user.uid}).`);
}

main().then(() => process.exit(0)).catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Reset failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
