import { containsMergeTag } from '@thinkai/shared';
import { z } from 'zod';

/**
 * POST /api/campaigns — enqueue a broadcast (queued + metered background send).
 *
 * Audience: provide EITHER an explicit `recipients` list OR a `segment` (tags / opt-in) that the
 * server resolves from contacts. At least one is required; an explicit list takes precedence.
 * `scheduledAt` (epoch ms) defers the send; omit for immediate.
 */
const segmentSchema = z.object({
  // array-contains-any caps at 10 values.
  tags: z.array(z.string().trim().min(1)).max(10, 'At most 10 tags in a segment').optional(),
  optInOnly: z.boolean().optional(),
});

/** POST /api/campaigns/preview-audience — resolve a segment to a recipient count (no write). */
export const previewAudienceSchema = z.object({
  segment: segmentSchema,
});

export const createCampaignSchema = z
  .object({
    title: z.string().trim().min(1, 'Campaign title is required'),
    templateName: z.string().trim().min(1, 'A template is required'),
    languageCode: z.string().trim().min(1).default('en_US'),
    variables: z.array(z.string()).default([]),
    recipients: z
      .array(z.string().trim().min(1))
      .max(5000, 'Too many recipients in one campaign')
      .optional(),
    segment: segmentSchema.optional(),
    scheduledAt: z.number().int().positive().optional(),
  })
  .refine((v) => (v.recipients && v.recipients.length > 0) || v.segment !== undefined, {
    message: 'Provide either a recipients list or an audience segment',
    path: ['recipients'],
  })
  .superRefine((v, ctx) => {
    // A pasted-numbers ("recipients") audience has no contact records, so {{contact.*}} merge tags
    // can never resolve. Reject at the boundary rather than queue a campaign that would deliver raw
    // "{{...}}" text. (createCampaign re-checks for direct service callers.)
    const isListAudience = !!(v.recipients && v.recipients.length > 0);
    if (isListAudience && v.variables.some(containsMergeTag)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variables'],
        message:
          'Merge tags like {{contact.name}} need a contact segment — pasted numbers have no contacts to personalize from.',
      });
    }
  });
