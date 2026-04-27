// Resend email send (Phase 0.7).
//
// Single transactional sender wrapped around the Resend SDK. Fail-soft when
// RESEND_API_KEY isn't set: returns { ok: false, reason: 'not_configured' }
// instead of throwing, so the caller can persist the invite row and surface
// "email failed to send — share this link manually" to the inviter.

import { Resend } from 'resend';

let cachedClient = null;

export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY);

const getClient = () => {
  if (cachedClient) return cachedClient;
  if (!isEmailConfigured()) return null;
  cachedClient = new Resend(process.env.RESEND_API_KEY);
  return cachedClient;
};

const fromAddress = () =>
  process.env.RESEND_FROM ?? 'Family-Hub <invites@family-hub.app>';

/**
 * @param {{ to: string, subject: string, html: string, text: string, replyTo?: string }} params
 */
export const sendEmail = async ({ to, subject, html, text, replyTo }) => {
  const client = getClient();
  if (!client) return { ok: false, reason: 'not_configured' };
  try {
    const result = await client.emails.send({
      from: fromAddress(),
      to,
      subject,
      html,
      text,
      reply_to: replyTo
    });
    return { ok: true, id: result.data?.id ?? null };
  } catch (err) {
    return { ok: false, reason: 'send_failed', error: err?.message ?? String(err) };
  }
};

export const inviteEmailTemplate = ({ inviterName, familyName, acceptUrl }) => {
  const subject = `${inviterName} invited you to join ${familyName} on Family-Hub`;
  const text = `${inviterName} invited you to join ${familyName} on Family-Hub.

Accept the invite: ${acceptUrl}

This link expires in 14 days. If you weren't expecting it, you can ignore this email.`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1 style="font-size:20px;margin:0 0 16px">You're invited to ${escapeHtml(familyName)}</h1>
  <p style="margin:0 0 16px;line-height:1.5">${escapeHtml(inviterName)} added you to the <b>${escapeHtml(familyName)}</b> family on Family-Hub. Tap the button below to set up your account and start sharing the calendar, tasks, and chat.</p>
  <p style="margin:24px 0"><a href="${escapeHtml(acceptUrl)}" style="background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block">Accept invite</a></p>
  <p style="margin:0;font-size:12px;color:#666">This link expires in 14 days. If you weren't expecting it, you can ignore this email.</p>
</body></html>`;
  return { subject, html, text };
};

const escapeHtml = (raw) =>
  String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
