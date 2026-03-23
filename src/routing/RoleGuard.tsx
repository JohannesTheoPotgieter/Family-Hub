import type { ReactNode } from 'react';

export const RoleGuard = ({ allowed, fallback = null, children }: { allowed: boolean; fallback?: ReactNode; children: ReactNode }) => {
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
};
