import type { HTMLAttributes, PropsWithChildren } from 'react';

export const Card = ({ className = '', children, ...props }: PropsWithChildren<HTMLAttributes<HTMLElement>>) => (
  <section {...props} className={`glass-panel ${className}`.trim()}>
    {children}
  </section>
);
