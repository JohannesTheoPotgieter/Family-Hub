import { FoundationBlock, RoutePill, ScreenIntro } from './BaselineScaffold';

export const HomeScreen = () => (
  <section className="stack-lg">
    <ScreenIntro
      badge="Today"
      title="Home"
      subtitle="A calm family snapshot with quick access to what matters most."
    />

    <div className="foundation-grid">
      <FoundationBlock
        title="Family pulse"
        description="At-a-glance highlights for routines, reminders, and shared focus."
      >
        <div className="chip-list">
          <RoutePill label="Morning checklist" />
          <RoutePill label="Evening plan" />
        </div>
      </FoundationBlock>
      <FoundationBlock
        title="Quick actions"
        description="Fast taps for common family updates and next steps."
      >
        <div className="chip-list">
          <RoutePill label="Add reminder" />
          <RoutePill label="Plan weekend" />
        </div>
      </FoundationBlock>
    </div>
  </section>
);
