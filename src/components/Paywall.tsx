// Inline paywall card (Phase 0.6).
//
// Wrap any feature region with <Paywall feature="bank_linking">…children…</Paywall>.
// When the active plan unlocks the feature, children render unchanged. When
// it doesn't, the children are blurred + click-blocked behind a friendly
// upgrade card. No dark patterns: copy explains what the feature does and
// links to the pricing page; cancellation remains one click away.

import type { ReactNode } from 'react';
import { useEntitlement } from '../hooks/useEntitlement.ts';

const FEATURE_COPY: Record<string, { title: string; explainer: string }> = {
  calendar_two_way_sync: {
    title: 'Sync with Google or Outlook',
    explainer: 'Two-way sync keeps the family calendar and your work calendar in step.'
  },
  push_reminders: {
    title: 'Push reminders',
    explainer: 'Get a quiet nudge before events and bills.'
  },
  bank_linking: {
    title: 'Link your bank',
    explainer: 'Pull transactions automatically — no more CSV imports.'
  },
  debt_coach: {
    title: 'Debt payoff coach',
    explainer: 'See exactly how much sooner you can be debt-free with a small extra payment.'
  },
  spending_insights: {
    title: 'Spending insights',
    explainer: 'Plain-English nudges when you start drifting from the plan.'
  },
  multi_currency: {
    title: 'Multi-currency',
    explainer: 'Track ZAR, USD, GBP, and EUR side by side.'
  },
  receipt_scanning: {
    title: 'Receipt scanning',
    explainer: 'Snap a photo, we attach it to the right transaction.'
  },
  loadshedding_overlay: {
    title: 'Load-shedding overlay',
    explainer: 'EskomSePush stages on your calendar, with a 30-min heads-up.'
  }
};

export type PaywallProps = {
  feature: string;
  children: ReactNode;
  /** Optional override for the paywall card heading. */
  title?: string;
};

export const Paywall = ({ feature, children, title }: PaywallProps) => {
  const allowed = useEntitlement(feature);
  if (allowed) return <>{children}</>;

  const copy = FEATURE_COPY[feature];
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        border: '1px solid var(--paywall-border, rgba(0,0,0,0.08))'
      }}
    >
      <div aria-hidden style={{ filter: 'blur(4px)', pointerEvents: 'none', opacity: 0.55 }}>
        {children}
      </div>
      <div
        role="region"
        aria-label={`${title ?? copy?.title ?? feature} — upgrade required`}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: 24,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.0) 0%, rgba(255,255,255,0.85) 30%, rgba(255,255,255,0.95) 100%)',
          textAlign: 'center'
        }}
      >
        <strong style={{ fontSize: 16 }}>{title ?? copy?.title ?? 'Upgrade required'}</strong>
        {copy?.explainer ? (
          <p style={{ margin: 0, fontSize: 14, maxWidth: 320, lineHeight: 1.45 }}>{copy.explainer}</p>
        ) : null}
        <a
          href="/pricing"
          style={{
            marginTop: 12,
            background: '#1a1a1a',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 14
          }}
        >
          See plans
        </a>
      </div>
    </div>
  );
};
