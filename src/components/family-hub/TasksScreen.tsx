import { FoundationBlock, RoutePill, ScreenIntro } from './BaselineScaffold';

export const TasksScreen = () => (
  <section className="stack-lg">
    <ScreenIntro
      badge="Focus"
      title="Tasks"
      subtitle="Shared to-dos for smooth handoffs and fewer forgotten details."
    />

    <FoundationBlock
      title="Family task space"
      description="Organize responsibilities with clear priority and progress signals."
    >
      <div className="chip-list">
        <RoutePill label="Today" />
        <RoutePill label="This week" />
        <RoutePill label="Completed" />
      </div>
    </FoundationBlock>
  </section>
);
