import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Centered pop-up rendered through a portal into document.body so that no ancestor's
 * filter / transform can turn position:fixed into position:absolute. */
export default function Modal({ title, subtitle, onClose, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="modalBackdrop" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <div className="modalTitle">{title}</div>
            {subtitle && <div className="modalSub">{subtitle}</div>}
          </div>
          <button className="modalClose" onClick={onClose} aria-label="Close" autoFocus>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" fill="none" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
