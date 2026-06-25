/**
 * Validation tests for createCampaignSchema — the API boundary that rejects merge tags for a
 * pasted-numbers audience (which has no contact records to resolve them against). Pure zod parse,
 * no Firestore.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createCampaignSchema } from './campaigns.schema';

const base = {
  title: 'June refill',
  templateName: 'refill_reminder',
  languageCode: 'en_US',
};

test('rejects a merge tag when the audience is a pasted-numbers list', () => {
  const res = createCampaignSchema.safeParse({
    ...base,
    variables: ['{{contact.name}}'],
    recipients: ['+919876543210'],
  });
  assert.equal(res.success, false);
  if (!res.success) {
    assert.ok(
      res.error.issues.some((i) => i.path.includes('variables')),
      'expected an issue on the variables path',
    );
  }
});

test('accepts a merge tag when the audience is a contact segment', () => {
  const res = createCampaignSchema.safeParse({
    ...base,
    variables: ['{{contact.name}}'],
    segment: { tags: ['vip'] },
  });
  assert.equal(res.success, true);
});

test('accepts a static literal with a pasted-numbers list', () => {
  const res = createCampaignSchema.safeParse({
    ...base,
    variables: ['Refill due'],
    recipients: ['+919876543210'],
  });
  assert.equal(res.success, true);
});
