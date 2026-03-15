type Props = { title: string; description: string; action?: React.ReactNode };

export const EmptyStateCard = ({ title, description, action }: Props) => (
  <article className="glass-panel money-empty stack-sm">
    <h3>{title}</h3>
    <p className="muted">{description}</p>
    {action}
  </article>
);
