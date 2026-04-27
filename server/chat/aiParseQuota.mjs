// Per-family daily AI parse quota (Phase 3.7).
//
// Limits per plan (set in entitlementsFor):
//   free        60 parses/day
//   family     300 parses/day
//   family_pro 600 parses/day
//
// Enforced via UPSERT on (family_id, day_iso). The integer counter is
// bumped atomically so a burst of concurrent /api/chat/parse requests
// can't all sneak in under the limit.

import { withFamilyContext } from '../db/pool.mjs';
import { quotasFor } from '../billing/entitlements.mjs';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Reserve one AI parse credit for the active family. Returns
 * { allowed, used, limit }. When `allowed` is false, the route returns
 * 429 and the client falls back to the slash-command form.
 */
export const reserveAiParse = async ({ familyId, plan }) => {
  const limit = quotasFor(plan).aiParseDaily;
  const day = today();
  return withFamilyContext(familyId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO ai_parse_quota (family_id, day_iso, used_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (family_id, day_iso)
       DO UPDATE SET used_count = ai_parse_quota.used_count + 1
       RETURNING used_count`,
      [familyId, day]
    );
    const used = rows[0].used_count;
    if (used > limit) {
      // Roll back the increment so a 429 doesn't permanently consume the
      // quota.
      await client.query(
        `UPDATE ai_parse_quota
            SET used_count = used_count - 1
          WHERE family_id = $1 AND day_iso = $2`,
        [familyId, day]
      );
      return { allowed: false, used: limit, limit };
    }
    return { allowed: true, used, limit };
  });
};
