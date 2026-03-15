import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

export const Chip = ({ className = '', children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) => (
  <button type="button" {...props} className={`chip ${className}`.trim()}>
    {children}
  </button>
);
