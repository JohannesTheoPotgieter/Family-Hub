import { FoundationBlock, RoutePill, ScreenIntro } from './BaselineScaffold';

export const HomeScreen = () => (
  <section className="stack-lg">
    <ScreenIntro
      badge="Baseline"
      title="Home"
      subtitle="Core home shell is stabilized and ready for visual hierarchy redesign."
    />

    <div className="foundation-grid">
      <FoundationBlock
        title="Header zone"
        description="Reserved for greeting, quick status, and high-priority family snapshot."
      >
        <div className="chip-list">
          <RoutePill label="Summary" />
          <RoutePill label="Alerts" />
        </div>
      </FoundationBlock>
      <FoundationBlock
        title="Action rail"
        description="Reserved for top shortcuts and progressive disclosure actions."
      >
        <div className="chip-list">
          <RoutePill label="Quick actions" />
          <RoutePill label="Deep links" />
        </div>
      </FoundationBlock>
    </div>
  </section>
);
