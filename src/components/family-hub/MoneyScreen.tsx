import { FoundationBlock, RoutePill, ScreenIntro } from './BaselineScaffold';

export const MoneyScreen = () => (
  <section className="stack-lg">
    <ScreenIntro
      badge="Baseline"
      title="Money"
      subtitle="Financial module reset to a safe shell with no duplicate payment/OCR/file-input logic."
    />

    <div className="foundation-grid">
      <FoundationBlock
        title="Overview lane"
        description="Reserved for balances, commitments, and monthly trend cards."
      >
        <div className="chip-list">
          <RoutePill label="Overview" />
          <RoutePill label="Cashflow" />
        </div>
      </FoundationBlock>
      <FoundationBlock
        title="Records lane"
        description="Reserved for transaction and payment list redesign with safe event boundaries."
      >
        <div className="chip-list">
          <RoutePill label="Transactions" />
          <RoutePill label="Payments" />
        </div>
      </FoundationBlock>
    </div>
  </section>
);
