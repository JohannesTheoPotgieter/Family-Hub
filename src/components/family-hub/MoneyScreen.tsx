import { FoundationBlock, RoutePill, ScreenIntro } from './BaselineScaffold';

export const MoneyScreen = () => (
  <section className="stack-lg">
    <ScreenIntro
      badge="Money"
      title="Money"
      subtitle="A clean overview of family finances, budgets, and recurring costs."
    />

    <div className="foundation-grid">
      <FoundationBlock
        title="Snapshot"
        description="Track balance and income rhythm in one calm glance."
      >
        <div className="chip-list">
          <RoutePill label="Balance" />
          <RoutePill label="Income flow" />
        </div>
      </FoundationBlock>
      <FoundationBlock
        title="Commitments"
        description="See budgets and recurring payments without clutter."
      >
        <div className="chip-list">
          <RoutePill label="Recurring" />
          <RoutePill label="Budget plan" />
        </div>
      </FoundationBlock>
    </div>
  </section>
);
