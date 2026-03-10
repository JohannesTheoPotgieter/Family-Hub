import { FoundationBlock, RoutePill, ScreenIntro } from './BaselineScaffold';

export const TasksScreen = () => (
  <section className="stack-lg">
    <ScreenIntro
      badge="Baseline"
      title="Tasks"
      subtitle="Task route retains stable scaffolding for list, filter, and composer redesign."
    />

    <FoundationBlock
      title="Task workspace"
      description="Reserved for segmented filters, grouped lists, and completion interactions."
    >
      <div className="chip-list">
        <RoutePill label="Filters" />
        <RoutePill label="List" />
        <RoutePill label="Composer" />
      </div>
    </FoundationBlock>
  </section>
);
