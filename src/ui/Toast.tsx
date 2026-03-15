import { useToasts } from './useToasts';

export const ToastViewport = () => {
  const { toasts, remove } = useToasts();
  return (
    <div className="toast-viewport" aria-live="polite">
      {toasts.map((toast) => (
        <button key={toast.id} className="toast" onClick={() => remove(toast.id)}>
          {toast.message}
        </button>
      ))}
    </div>
  );
};
