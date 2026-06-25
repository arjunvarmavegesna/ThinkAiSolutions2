/**
 * Classify a template into its billable message category.
 *
 * Meta bills outbound template messages by the template's category
 * (marketing / utility / authentication). A template's category is already
 * normalized to a MessageCategory when it is synced into Firestore (see
 * templates/syncTemplates.ts and the BSP mapping layer), so this is a thin,
 * defensive accessor rather than a re-derivation.
 */

import type { MessageCategory, Template } from '@thinkai/shared';
import { MESSAGE_CATEGORIES } from '@thinkai/shared';

/**
 * Return the billable category for an outbound template send.
 *
 * Templates carry a normalized `category` already (marketing/utility/authentication).
 * If a stored template somehow lacks a recognized billable category we fall back to
 * 'utility' — the conservative, lowest-risk paid bucket — so we never silently treat a
 * paid template as free 'service'. (A 'service' category on a template would be wrong:
 * 'service' is reserved for free-text replies inside the 24h window.)
 */
export function categoryForTemplate(t: Template): MessageCategory {
  const cat = t.category;
  if (cat && MESSAGE_CATEGORIES.includes(cat) && cat !== 'service') {
    return cat;
  }
  return 'utility';
}
