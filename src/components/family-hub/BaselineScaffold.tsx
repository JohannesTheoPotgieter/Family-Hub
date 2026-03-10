import type { ReactNode } from 'react';

type ScreenIntroProps = {
  title: string;
  subtitle: string;
  badge?: string;
};

export const ScreenIntro = ({ title, subtitle, badge }: ScreenIntroProps) => (
  <header className="glass-panel screen-intro">
    {badge ? <p className="eyebrow">{badge}</p> : null}
    <h2>{title}</h2>
    <p className="muted">{subtitle}</p>
  </header>
);

type FoundationBlockProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

export const FoundationBlock = ({ title, description, children }: FoundationBlockProps) => (
  <article className="glass-panel foundation-block stack-sm">
    <h3>{title}</h3>
    <p className="muted">{description}</p>
    {children}
  </article>
);

type RoutePillProps = {
  label: string;
};

export const RoutePill = ({ label }: RoutePillProps) => <span className="route-pill">{label}</span>;
