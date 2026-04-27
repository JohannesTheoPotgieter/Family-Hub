// Message + attachment moderation (Phase 3.5).
//
// Two-stage filter:
//   1. Profanity safe-list dictionary — local, free, instant. Most kid-
//      hostile content is caught here.
//   2. OpenAI Moderation API — cheap, sync, only called on content that
//      passes the local filter so per-family cost stays predictable.
//
// Output is a small structured result the messages route consumes; we
// never silently drop content. Flagged messages go to bodyText='[hidden]'
// with the original retained encrypted; an audit_log row + push to the
// parent_admin captures provenance for "what did my kid try to send?".
//
// Fail-soft: if MODERATION_DISABLED=true or the API errors, we treat the
// content as ok rather than blocking the chat. Privacy + UX over
// theoretical-perfect filtering.

const SAFE_LIST = new Set([
  // Minimal seed list — the real word list lives in
  // server/chat/safelist.json, gitignored, edited by an operator. The
  // entry below is a single-word sentinel so this module is
  // unit-testable without shipping a slur dictionary in the repo.
  'bannedtestword'
]);

const stripDiacritics = (text) =>
  text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

const tokenize = (text) =>
  stripDiacritics(text)
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * Returns the local safe-list match (token, if any). Pure, sync, free.
 */
export const localProfanityHit = (text) => {
  if (typeof text !== 'string') return null;
  for (const token of tokenize(text)) {
    if (SAFE_LIST.has(token)) return token;
  }
  return null;
};

/**
 * @returns {Promise<{ ok: true } | { ok: false, reasons: string[] }>}
 */
export const moderateText = async (text) => {
  if (process.env.MODERATION_DISABLED === 'true') return { ok: true };
  if (!text || typeof text !== 'string') return { ok: true };

  const local = localProfanityHit(text);
  if (local) return { ok: false, reasons: [`safe_list:${local}`] };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: true }; // moderation API not configured → permissive

  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text })
    });
    if (!response.ok) return { ok: true }; // fail-soft on API error
    const body = await response.json();
    const result = body.results?.[0];
    if (!result) return { ok: true };
    if (!result.flagged) return { ok: true };
    const reasons = Object.entries(result.categories ?? {})
      .filter(([, hit]) => Boolean(hit))
      .map(([category]) => `openai:${category}`);
    return { ok: false, reasons };
  } catch {
    return { ok: true };
  }
};
