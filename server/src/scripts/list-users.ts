/**
 * One-off helper — list all Firebase Auth users with their custom-claim role.
 * Usage (from /server):  npx tsx src/scripts/list-users.ts
 */
import { adminAuth } from '../config/firebase';

async function main(): Promise<void> {
  let pageToken: string | undefined;
  const rows: string[] = [];
  do {
    const res = await adminAuth.listUsers(1000, pageToken);
    for (const u of res.users) {
      const role = (u.customClaims as { role?: string } | undefined)?.role ?? '(none)';
      const tenantId = (u.customClaims as { tenantId?: string | null } | undefined)?.tenantId ?? '-';
      rows.push(`${role.padEnd(16)} | ${(u.email ?? '(no email)').padEnd(40)} | tenant=${tenantId} | uid=${u.uid}`);
    }
    pageToken = res.pageToken;
  } while (pageToken);

  // eslint-disable-next-line no-console
  console.log('\nrole             | email                                    | tenant | uid');
  // eslint-disable-next-line no-console
  console.log(rows.join('\n') || '(no users)');
}

main().then(() => process.exit(0)).catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
