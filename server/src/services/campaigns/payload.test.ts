/**
 * Executor-level test: prove the campaign send loop produces a DIFFERENT Meta payload per
 * recipient. We exercise the exact two steps the loop runs per recipient — resolve the campaign's
 * raw variables for that contact, then build the Meta template body — without standing up
 * Firestore (no DB-mock infra in the repo; the per-recipient divergence is what matters here).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRecipientVariables } from '@thinkai/shared';

import { buildTemplateBody } from '../bsp/metaCloud.mapping';

/** Pull the first body parameter text out of a built Meta template send body. */
function bodyParam(built: Record<string, unknown>): unknown {
  const tpl = built.template as
    | { components?: Array<{ parameters?: Array<{ text?: string }> }> }
    | undefined;
  return tpl?.components?.[0]?.parameters?.[0]?.text;
}

test('two contacts with different names produce two different template payloads', () => {
  const rawVars = ['{{contact.name}}'];

  const asha = resolveRecipientVariables(rawVars, { name: 'Asha', phone: '+911111111111' });
  const bhagavan = resolveRecipientVariables(rawVars, { name: 'Bhagavan', phone: '+912222222222' });
  assert.equal(asha.unresolved, false);
  assert.equal(bhagavan.unresolved, false);

  const ashaBody = buildTemplateBody({
    toPhone: '+911111111111',
    templateName: 'refill_reminder',
    languageCode: 'en_US',
    variables: asha.variables,
  });
  const bhagavanBody = buildTemplateBody({
    toPhone: '+912222222222',
    templateName: 'refill_reminder',
    languageCode: 'en_US',
    variables: bhagavan.variables,
  });

  assert.notDeepEqual(ashaBody, bhagavanBody);
  assert.equal(bodyParam(ashaBody), 'Asha');
  assert.equal(bodyParam(bhagavanBody), 'Bhagavan');
});

test('a missing name resolves to the "there" fallback in the payload', () => {
  const { variables } = resolveRecipientVariables(['{{contact.name}}'], { phone: '+913333333333' });
  const built = buildTemplateBody({
    toPhone: '+913333333333',
    templateName: 'refill_reminder',
    languageCode: 'en_US',
    variables,
  });
  assert.equal(bodyParam(built), 'there');
});

test('an unknown merge tag flips unresolved so the executor skips the recipient before any debit', () => {
  const { unresolved } = resolveRecipientVariables(['{{contact.email}}'], {
    name: 'Asha',
    phone: '+911111111111',
  });
  assert.equal(unresolved, true);
});
