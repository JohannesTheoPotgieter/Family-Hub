import { FoundationBlock, RoutePill, ScreenIntro } from './BaselineScaffold';

export const CalendarScreen = () => (
  <section className="stack-lg">
    <ScreenIntro
      badge="Baseline"
      title="Calendar"
      subtitle="Clean calendar module shell with section anchors and no unstable scheduling handlers."
    />

    <FoundationBlock
      title="Timeline container"
      description="Reserved for month/week/day visual navigation and date context controls."
    >
      <div className="chip-list">
        <RoutePill label="Date picker" />
        <RoutePill label="Views" />
        <RoutePill label="Agenda" />
      </div>
    </FoundationBlock>
  </section>
);
