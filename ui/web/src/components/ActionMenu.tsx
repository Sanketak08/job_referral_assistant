import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useDismiss } from '../hooks/useDismiss.ts';
import { Icon, type IconName } from './Icon.tsx';

export interface MenuAction {
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
}

interface Props {
  actions: MenuAction[];
  /** Accessible name of the "⋯" button. */
  label: string;
  className?: string;
}

/**
 * A "⋯" button with a menu. The menu is portalled to <body> and fixed-positioned, so neither
 * scrolling containers nor glass panels (backdrop-filter makes them the containing block for
 * fixed elements) can clip or offset it.
 */
export function ActionMenu({
  actions,
  label,
  className = 'btn btn-sm btn-icon row-menu-button',
}: Props) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setStyle(null), []);
  useDismiss([ref, menuRef], style !== null, close);

  const open = (button: HTMLButtonElement): void => {
    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom > 200;
    setStyle({
      position: 'fixed',
      right: window.innerWidth - rect.right,
      top: below ? rect.bottom + 4 : 'auto',
      bottom: below ? 'auto' : window.innerHeight - rect.top + 4,
    });
  };

  return (
    <div ref={ref} className="action-menu">
      <button
        className={className}
        onClick={(e) => (style ? close() : open(e.currentTarget))}
        aria-label={label}
        aria-expanded={style !== null}
      >
        <Icon name="dots" size={16} />
      </button>
      {style &&
        createPortal(
          <div ref={menuRef} className="menu" role="menu" style={style}>
            {actions.map((action) => (
              <button
                key={action.label}
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  close();
                  action.onClick();
                }}
              >
                <Icon name={action.icon} size={15} /> {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
