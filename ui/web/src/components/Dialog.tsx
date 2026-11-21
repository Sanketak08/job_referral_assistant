import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.tsx';

interface Props {
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

export function Dialog({ title, wide, onClose, children, footer }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Portalled to <body>: a glass panel ancestor (backdrop-filter) would otherwise trap the
  // fixed backdrop inside itself.
  return createPortal(
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={wide ? 'dialog dialog-wide' : 'dialog'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="dialog-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        <footer className="dialog-foot">{footer}</footer>
      </div>
    </div>,
    document.body,
  );
}
