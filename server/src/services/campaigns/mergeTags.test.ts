/**
 * Unit tests for the shared merge-tag resolver (@thinkai/shared campaigns/mergeTags).
 * Run via `npm test` in the server workspace (node:test through tsx; see package.json).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MERGE_FALLBACK,
  containsMergeTag,
  hasUnresolvedTag,
  resolveRecipientVariables,
  resolveVariable,
  sanitizeParam,
} from '@thinkai/shared';

const contact = { name: 'Bhagavan Pasala', phone: '+919876543210' };

test('literal passthrough: a plain literal is returned verbatim', () => {
  assert.equal(resolveVariable('Refill reminder', contact), 'Refill reminder');
});

test('{{contact.name}} resolves to the contact name', () => {
  assert.equal(resolveVariable('{{contact.name}}', contact), 'Bhagavan Pasala');
});

test('{{contact.phone}} resolves to the contact phone', () => {
  assert.equal(resolveVariable('{{contact.phone}}', contact), '+919876543210');
});

test('a merge tag is whitespace- and case-tolerant', () => {
  assert.equal(resolveVariable('{{ CONTACT.Name }}', contact), 'Bhagavan Pasala');
});

test('missing/empty name falls back to "there"', () => {
  assert.equal(resolveVariable('{{contact.name}}', { phone: '+910000000000' }), 'there');
  assert.equal(
    resolveVariable('{{contact.name}}', { name: '   ', phone: '+910000000000' }),
    'there',
  );
  assert.equal(MERGE_FALLBACK, 'there');
});

test('a blank literal becomes the non-empty fallback (Meta HTTP 400s on empty params)', () => {
  assert.equal(resolveVariable('', contact), 'there');
  assert.equal(resolveVariable('   ', contact), 'there');
});

test('sanitize collapses newlines, tabs and 4+ spaces to single spaces, then trims', () => {
  assert.equal(sanitizeParam('line1\nline2\tx     y'), 'line1 line2 x y');
  assert.equal(sanitizeParam('  padded  '), 'padded');
});

test('sanitize truncates to 60 chars', () => {
  assert.equal(sanitizeParam('a'.repeat(80)).length, 60);
});

test('a resolved name is sanitized (a newline in a stored name does not leak through)', () => {
  assert.equal(resolveVariable('{{contact.name}}', { name: 'Asha\nRao', phone: '+91' }), 'Asha Rao');
});

test('hasUnresolvedTag detects a leftover {{...}} placeholder', () => {
  assert.equal(hasUnresolvedTag('Hi {{contact.email}}'), true);
  assert.equal(hasUnresolvedTag('Hi Asha'), false);
});

test('an unknown tag falls through as a literal and is flagged unresolved', () => {
  const { variables, unresolved } = resolveRecipientVariables(['{{contact.email}}'], contact);
  assert.equal(unresolved, true);
  assert.equal(variables[0], '{{contact.email}}');
});

test('resolveRecipientVariables resolves a name+literal mix with unresolved=false', () => {
  const { variables, unresolved } = resolveRecipientVariables(
    ['{{contact.name}}', 'static value'],
    contact,
  );
  assert.deepEqual(variables, ['Bhagavan Pasala', 'static value']);
  assert.equal(unresolved, false);
});

test('containsMergeTag distinguishes merge tags from literals and positional {{1}} placeholders', () => {
  assert.equal(containsMergeTag('{{contact.name}}'), true);
  assert.equal(containsMergeTag('Hello {{contact.phone}}!'), true);
  assert.equal(containsMergeTag('plain text'), false);
  assert.equal(containsMergeTag('{{1}}'), false);
});
