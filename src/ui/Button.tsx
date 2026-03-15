import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type Props = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: 'primary' | 'ghost' | 'danger';
};

export const Button = ({ variant = 'primary', className = '', children, ...props }: Props) => (
  <button {...props} className={`btn btn-${variant} ${className}`.trim()}>
    {children}
  </button>
);
