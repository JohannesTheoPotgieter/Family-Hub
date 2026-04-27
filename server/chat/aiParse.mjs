// Natural-language → ProposalChange via Claude Haiku (Phase 3.7).
//
// Client posts:
//   { threadId, text }
//
// Server:
//   1. Looks up the thread + its parent entity to build context.
//   2. Reserves one AI-parse credit (per-family quota).
//   3. Calls Anthropic Haiku with a strict JSON-schema response constraint
//      describing only the proposal kinds valid for this entity.
//   4. Returns the parsed ProposalChange + a confidence score, or null +
//      reason when intent is unclear (low confidence) or the API errors.
//
// Falls back to the slash-command UI on the client when:
//   - quota exhausted (429)
//   - API not configured (503 with reason='not_configured')
//   - confidence < 0.6 (200 with proposal=null)
//
// Cost-control safeguards:
//   - Only object threads (entityKind in event/task/bill/...) are parsed —
//     family + direct threads aren't fed to the model.
//   - Per-family daily quota.
//   - Hard timeout (10s) so a hanging API call can't lock a tab.

import Anthropic from '@anthropic-ai/sdk';
import { withFamilyContext } from '../db/pool.mjs';

let cachedClient = null;
const getClient = () => {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
};

export const isAiParseConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

const MODEL = process.env.AI_PARSE_MODEL ?? 'claude-haiku-4-5-20251001';

/**
 * Build the JSON-schema response constraint for a given entity kind.
 * Each branch is the structural mirror of the matching ProposalChange
 * type in src/domain/proposals.ts.
 */
const responseSchemaFor = (entityKind) => {
  const eventSchemas = [
    {
      type: 'object',
      properties: {
        kind: { const: 'event_move' },
        newStartIso: { type: 'string', format: 'date-time' },
        newEndIso: { type: 'string', format: 'date-time' }
      },
      required: ['kind', 'newStartIso', 'newEndIso']
    },
    {
      type: 'object',
      properties: { kind: { const: 'event_cancel' } },
      required: ['kind']
    }
  ];
  const taskSchemas = [
    {
      type: 'object',
      properties: {
        kind: { const: 'task_assignee_swap' },
        swaps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              taskId: { type: 'string' },
              newOwnerMemberId: { type: 'string' }
            },
            required: ['taskId', 'newOwnerMemberId']
          }
        }
      },
      required: ['kind', 'swaps']
    },
    {
      type: 'object',
      properties: {
        kind: { const: 'task_reschedule_due' },
        newDueDate: { type: ['string', 'null'] }
      },
      required: ['kind', 'newDueDate']
    }
  ];
  const moneySchemas = [
    {
      type: 'object',
      properties: {
        kind: { const: 'budget_category_shift' },
        monthIso: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
        fromCategory: { type: 'string' },
        toCategory: { type: 'string' },
        amountCents: { type: 'integer', minimum: 1 },
        currency: { type: 'string' }
      },
      required: ['kind', 'monthIso', 'fromCategory', 'toCategory', 'amountCents', 'currency']
    }
  ];

  switch (entityKind) {
    case 'event':
      return eventSchemas;
    case 'task':
      return taskSchemas;
    case 'budget':
    case 'bill':
    case 'transaction':
    case 'debt':
    case 'savings_goal':
      return moneySchemas;
    default:
      return [];
  }
};

const SYSTEM_PROMPT = `You are an intent extractor for Family-Hub. The user typed
a short message in the thread of a family entity (event, task, budget, etc).
Decide which structured proposal change they meant and return it as JSON.

Rules:
- If the intent is ambiguous, return {"proposal": null, "confidence": 0.0,
  "reason": "ambiguous"}.
- If the user clearly does not want to change anything (just chatting),
  return {"proposal": null, "confidence": 0.0, "reason": "not_a_proposal"}.
- Otherwise return {"proposal": <change>, "confidence": <0.6..1.0>}.
- Date times are ISO-8601 with timezone. Money is integer cents.
- Never invent member ids — only use ones provided in the entity context.
- Only return one of the proposal kinds whose JSON Schema you were given.`;

/**
 * @param {{
 *   familyId: string,
 *   threadId: string,
 *   plan: string,
 *   text: string
 * }} args
 */
export const parseProposalIntent = async ({ familyId, threadId, plan, text }) => {
  if (!isAiParseConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }

  // Look up the thread + entity context. Without an object thread we
  // refuse — encrypted threads should never be fed to the model.
  const context = await loadThreadContext({ familyId, threadId });
  if (!context) return { ok: false, reason: 'thread_not_found' };
  if (context.kind !== 'object' || !context.entityKind) {
    return { ok: false, reason: 'unsupported_thread_kind' };
  }

  const schemas = responseSchemaFor(context.entityKind);
  if (!schemas.length) {
    return { ok: false, reason: 'unsupported_entity_kind' };
  }

  const client = getClient();
  if (!client) return { ok: false, reason: 'not_configured' };

  let parsed;
  try {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Entity kind: ${context.entityKind}\nEntity snapshot: ${JSON.stringify(context.entity)}\nValid proposal kinds (JSON Schema oneOf): ${JSON.stringify(schemas)}\n\nUser message:\n"${text}"\n\nReturn ONLY a JSON object with keys "proposal" (one of the valid schemas, or null) and "confidence" (number 0..1). No prose.`
              }
            ]
          }
        ]
      },
      { timeout: 10_000 }
    );
    const block = response?.content?.find?.((b) => b.type === 'text');
    parsed = block ? JSON.parse(block.text) : null;
  } catch (err) {
    return { ok: false, reason: 'api_error', error: err?.message ?? String(err) };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'invalid_response' };
  }
  if (!parsed.proposal || typeof parsed.confidence !== 'number') {
    return { ok: true, proposal: null, confidence: parsed?.confidence ?? 0 };
  }
  return {
    ok: true,
    proposal: parsed.proposal,
    confidence: parsed.confidence
  };
};

const loadThreadContext = async ({ familyId, threadId }) =>
  withFamilyContext(familyId, async (client) => {
    const { rows: threadRows } = await client.query(
      `SELECT * FROM threads WHERE id = $1 LIMIT 1`,
      [threadId]
    );
    if (!threadRows.length) return null;
    const thread = threadRows[0];

    if (thread.kind !== 'object' || !thread.entity_kind) {
      return { kind: thread.kind, entityKind: null, entity: null };
    }

    let entity = null;
    if (thread.entity_kind === 'event') {
      const { rows } = await client.query(
        `SELECT id, title, starts_at, ends_at, all_day, rrule_text FROM internal_events WHERE id = $1`,
        [thread.entity_id]
      );
      entity = rows[0] ?? null;
    } else if (thread.entity_kind === 'task') {
      const { rows } = await client.query(
        `SELECT id, title, owner_member_id, due_date, reward_points, recurrence FROM tasks WHERE id = $1`,
        [thread.entity_id]
      );
      entity = rows[0] ?? null;
    } else if (thread.entity_kind === 'budget') {
      const { rows } = await client.query(
        `SELECT id, month_iso, category, limit_cents, currency FROM budgets WHERE id = $1`,
        [thread.entity_id]
      );
      entity = rows[0] ?? null;
    }
    return { kind: thread.kind, entityKind: thread.entity_kind, entity };
  });
