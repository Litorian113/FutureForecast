import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}

/** Centered pop-up over a blurred page. Rendered through a portal: the glass panels use
 * backdrop-filter, which would otherwise turn position:fixed into position:absolute. */
export default function Modal({ title, subtitle, onClose, children, wide }: Props) {
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
      <div className={`modal${wide ? ' wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <div className="modalTitle">{title}</div>
            {subtitle && <div className="modalSub">{subtitle}</div>}
          </div>
          <button className="modalClose" onClick={onClose} aria-label="close">
            <svg viewBox="0 0 16 16" width="14" height="14">
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

/** Small ⤢ button used in panel titles. */
export function ExpandButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      className="expandBtn"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 16 16" width="13" height="13">
        <path d="M9 2h5v5M14 2L9 7M7 14H2V9M2 14l5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    </button>
  );
}
