import { FoundationBlock, RoutePill, ScreenIntro } from './BaselineScaffold';

export const MoreScreen = () => (
  <section className="stack-lg">
    <ScreenIntro
      badge="Baseline"
      title="More"
      subtitle="Utility hub kept lightweight so preferences and settings can be rebuilt safely."
    />

    <FoundationBlock
      title="Secondary modules"
      description="Reserved for profile, preferences, and app-level controls after redesign planning."
    >
      <div className="chip-list">
        <RoutePill label="Profiles" />
        <RoutePill label="Preferences" />
        <RoutePill label="System" />
      </div>
    </FoundationBlock>
  </section>
);
