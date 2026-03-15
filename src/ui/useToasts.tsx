import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastItem = { id: string; message: string };

const ToastContext = createContext<{ toasts: ToastItem[]; push: (message: string) => void; remove: (id: string) => void } | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const value = useMemo(
    () => ({
      toasts,
      push: (message: string) => {
        const id = crypto.randomUUID();
        setToasts((current) => [...current, { id, message }]);
        setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3200);
      },
      remove: (id: string) => setToasts((current) => current.filter((toast) => toast.id !== id))
    }),
    [toasts]
  );
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

export const useToasts = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts must be used within ToastProvider');
  return ctx;
};
