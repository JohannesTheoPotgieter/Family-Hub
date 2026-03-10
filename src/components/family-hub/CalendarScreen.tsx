import { FoundationBlock, RoutePill, ScreenIntro } from './BaselineScaffold';

export const CalendarScreen = () => (
  <section className="stack-lg">
    <ScreenIntro
      badge="Planning"
      title="Calendar"
      subtitle="Keep everyone in sync with a clear and gentle family schedule."
    />

    <FoundationBlock
      title="Upcoming moments"
      description="Switch views and stay aligned on family events and commitments."
    >
      <div className="chip-list">
        <RoutePill label="This week" />
        <RoutePill label="School & work" />
        <RoutePill label="Family time" />
      </div>
    </FoundationBlock>
  </section>
);
