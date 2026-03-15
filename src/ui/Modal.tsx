import type { PropsWithChildren } from 'react';

export const Modal = ({ open, title, onClose, children }: PropsWithChildren<{ open: boolean; title: string; onClose: () => void }>) => {
  if (!open) return null;
  return (
    <div className="calendar-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="glass-panel calendar-modal stack" role="dialog" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </section>
    </div>
  );
};
