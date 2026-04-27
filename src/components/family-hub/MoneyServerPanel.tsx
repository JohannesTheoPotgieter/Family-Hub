// MoneyServerPanel — current-month spare + net-worth headline + top
// outflow categories (Phase 5 money cutover).
//
// Surfaces three plain-language numbers the prototype Money screen
// can't compute (cross-currency totals + audit-of-truth deltas):
//   - Spare this month (in vs out)
//   - Net worth (assets - debts) with this-week delta
//   - Top three "where did the money go" outflow categories with
//     month-over-month deltas
//
// Returns null in guest mode + 403 mode so kids who don't have
// money_view never see the panel; the prototype layout below stays.

import { useSession } from '../../lib/auth/SessionProvider.tsx';
import { useMoneyInsights } from '../../hooks/useMoneyInsights.ts';
import type { RollupCategory } from '../../lib/api/money.ts';

const formatMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    cents / 100
  );

const formatDelta = (cat: RollupCategory) => {
  if (cat.deltaCents === 0) return null;
  const sign = cat.deltaCents > 0 ? '+' : '';
  const abs = Math.abs(cat.deltaCents);
  if (cat.deltaPct == null) {
    return `${sign}${formatMoney(cat.deltaCents, cat.currency)} vs last month`;
  }
  return `${sign}${formatMoney(cat.deltaCents, cat.currency)} (${sign}${cat.deltaPct}%) vs last month`;
};

export const MoneyServerPanel = () => {
  const session = useSession();
  const enabled = session.kind === 'authenticated';
  const money = useMoneyInsights({ enabled });

  if (!enabled) return null;
  if (money.kind === 'loading') return <Shell>Adding it all up…</Shell>;
  if (money.kind === 'guest' || money.kind === 'forbidden') return null;
  if (money.kind === 'error') {
    return <Shell tone="error">Couldn't load money summary: {money.message}</Shell>;
  }

  const { insights, netWorth } = money;
  const { summary, displayCurrency } = insights;

  // Top three outflow categories by total spent this month.
  const topOutflows = insights.categories
    .filter((c) => c.kind === 'outflow' && c.totalCentsDisplay != null)
    .sort((a, b) => (b.totalCentsDisplay ?? 0) - (a.totalCentsDisplay ?? 0))
    .slice(0, 3);

  const spareTone =
    summary.spareCents > 0 ? 'good' : summary.spareCents === 0 ? 'flat' : 'tight';

  return (
    <Shell>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 12
        }}
      >
        <strong style={{ fontSize: 16 }}>Money this month</strong>
        <span style={{ fontSize: 12, opacity: 0.65 }}>{insights.monthIso}</span>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
          gap: 12,
          marginBottom: 12
        }}
      >
        <Stat
          label={summary.spareCents >= 0 ? 'Spare this month' : 'Over by'}
          value={formatMoney(Math.abs(summary.spareCents), displayCurrency)}
          accent={spareTone === 'good' ? '#0a7d3a' : spareTone === 'tight' ? '#a31d2c' : undefined}
        />
        <Stat
          label="Net worth"
          value={formatMoney(netWorth.current.netCents, netWorth.current.displayCurrency)}
          subtext={`${formatMoney(netWorth.current.assetsCents, netWorth.current.displayCurrency)} − ${formatMoney(netWorth.current.debtsCents, netWorth.current.displayCurrency)} debts`}
        />
      </div>

      {topOutflows.length > 0 && (
        <div>
          <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>Where it went</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topOutflows.map((cat) => (
              <li
                key={`${cat.category}-${cat.currency}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: '#fff',
                  borderRadius: 12,
                  boxShadow: '0 1px 0 rgba(0,0,0,0.04)'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{cat.category}</div>
                  {formatDelta(cat) ? (
                    <div style={{ fontSize: 12, opacity: 0.65 }}>{formatDelta(cat)}</div>
                  ) : null}
                </div>
                <div style={{ fontWeight: 600 }}>
                  {formatMoney(cat.totalCentsDisplay ?? 0, displayCurrency)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Shell>
  );
};

const Stat = ({
  label,
  value,
  subtext,
  accent
}: {
  label: string;
  value: string;
  subtext?: string;
  accent?: string;
}) => (
  <div
    style={{
      padding: 12,
      background: '#fff',
      borderRadius: 12,
      boxShadow: '0 1px 0 rgba(0,0,0,0.04)'
    }}
  >
    <div style={{ fontSize: 12, opacity: 0.65 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: accent ?? '#1a1a1a' }}>{value}</div>
    {subtext ? <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{subtext}</div> : null}
  </div>
);

const Shell = ({
  children,
  tone
}: {
  children: React.ReactNode;
  tone?: 'error';
}) => (
  <section
    aria-label="Money summary"
    style={{
      padding: 16,
      borderRadius: 16,
      marginBottom: 16,
      background: tone === 'error' ? 'rgba(220,53,69,0.08)' : 'rgba(0,0,0,0.03)'
    }}
  >
    {children}
  </section>
);
