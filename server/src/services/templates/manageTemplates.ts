/**
 * Author / edit / delete tenant WhatsApp templates (feature 1.1).
 *
 * Flow: validate (done in the route via zod) -> resolve the tenant's WABA + provider through the
 * BSP isolation layer -> call the provider (create/edit/delete on Meta) -> upsert the local
 * `Template` doc. The doc is keyed by the template NAME (unique per WABA, and the send path
 * looks templates up by name), matching syncTemplates.
 *
 * On create/edit we mark the doc `status: 'pending'` + stamp `submittedAt`; Meta's real verdict
 * arrives asynchronously via the message_template_status_update webhook (applyTemplateStatusUpdate).
 * The full Meta `components` array is filled in by the next /sync — create returns only id+status.
 */

import type { CreateTemplateRequest, Template, UpdateTemplateRequest } from '@thinkai/shared';

import { prisma } from '../../config/db';
import { msBig } from '../../db/serde';
import { AppError } from '../../lib/AppError';
import { logger } from '../../lib/logger';
import { getBspProvider, resolveTenantBspContext } from '../bsp';
import type { TemplateDefinition, TemplateMutationResult } from '../bsp/types';

/** Count distinct positional {{n}} placeholders in a body string. */
function countVariables(body: string): number {
  const matches = body.match(/\{\{\s*\d+\s*\}\}/g);
  if (!matches) return 0;
  return new Set(matches.map((m) => m.replace(/[^\d]/g, ''))).size;
}

/** Build the provider-neutral TemplateDefinition from an API request. */
function toDefinition(
  name: string,
  input: CreateTemplateRequest | UpdateTemplateRequest,
): TemplateDefinition {
  return {
    name,
    category: input.category,
    language: input.language,
    body: input.body,
    header: input.header,
    headerFormat: input.headerFormat,
    headerHandle: input.headerHandle,
    footer: input.footer,
    buttons: input.buttons,
    variableSamples: input.variableSamples,
  };
}

/** Upsert the local Template doc to reflect a just-submitted (pending) template. */
async function persistSubmitted(
  tenantId: string,
  name: string,
  input: CreateTemplateRequest | UpdateTemplateRequest,
  result: TemplateMutationResult,
): Promise<Template> {
  const now = Date.now();
  const doc: Template = {
    name,
    category: input.category,
    language: input.language,
    body: input.body,
    status: result.status,
    channel: 'whatsapp',
    variableCount: countVariables(input.body),
    submittedAt: now,
    updatedAt: now,
    ...(result.bspTemplateId !== undefined ? { bspTemplateId: result.bspTemplateId } : {}),
  };
  // upsert so a later /sync can layer in Meta's full `components` without wiping our fields.
  const persisted = {
    name,
    category: input.category,
    language: input.language,
    body: input.body,
    status: result.status,
    channel: 'whatsapp',
    variableCount: countVariables(input.body),
    submittedAt: msBig(now),
    updatedAt: msBig(now),
    ...(result.bspTemplateId !== undefined ? { bspTemplateId: result.bspTemplateId } : {}),
  };
  await prisma.template.upsert({
    where: { tenantId_id: { tenantId, id: name } },
    create: { tenantId, id: name, ...persisted },
    update: persisted,
  });
  return doc;
}

/** Create a brand-new template and submit it to Meta for review. */
export async function createTemplate(
  tenantId: string,
  input: CreateTemplateRequest,
): Promise<Template> {
  const existing = await prisma.template.findUnique({
    where: { tenantId_id: { tenantId, id: input.name } },
  });
  if (existing) {
    throw AppError.conflict(`A template named "${input.name}" already exists`, 'template_exists');
  }

  const { ctx, provider: providerName } = await resolveTenantBspContext(tenantId);
  const provider = getBspProvider(providerName);

  const result = await provider.createTemplate(ctx, toDefinition(input.name, input));
  const doc = await persistSubmitted(tenantId, input.name, input, result);
  logger.info({ tenantId, name: input.name, status: result.status }, 'createTemplate: submitted');
  return doc;
}

/** Edit an existing template (re-submits to Meta). Requires a known Meta template id. */
export async function editTemplate(
  tenantId: string,
  name: string,
  input: UpdateTemplateRequest,
): Promise<Template> {
  const current = await prisma.template.findUnique({
    where: { tenantId_id: { tenantId, id: name } },
  });
  if (!current) {
    throw AppError.notFound('Template not found', 'template_not_found');
  }
  if (!current.bspTemplateId) {
    throw AppError.badRequest(
      'This template has no Meta id yet; sync from WhatsApp before editing',
      'template_no_meta_id',
    );
  }

  const { ctx, provider: providerName } = await resolveTenantBspContext(tenantId);
  const provider = getBspProvider(providerName);

  const result = await provider.editTemplate(ctx, current.bspTemplateId, toDefinition(name, input));
  const doc = await persistSubmitted(tenantId, name, input, result);
  logger.info({ tenantId, name, status: result.status }, 'editTemplate: re-submitted');
  return doc;
}

/** Delete a template from Meta and remove the local doc. */
export async function deleteTemplate(tenantId: string, name: string): Promise<void> {
  const snap = await prisma.template.findUnique({
    where: { tenantId_id: { tenantId, id: name } },
  });
  if (!snap) {
    throw AppError.notFound('Template not found', 'template_not_found');
  }

  const { ctx, provider: providerName } = await resolveTenantBspContext(tenantId);
  const provider = getBspProvider(providerName);

  await provider.deleteTemplate(ctx, name);
  await prisma.template.delete({ where: { tenantId_id: { tenantId, id: name } } });
  logger.info({ tenantId, name }, 'deleteTemplate: removed');
}
