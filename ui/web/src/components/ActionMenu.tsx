import { useCallback, useRef, useState, type CSSProperties } from 'react';
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

/** A "⋯" button with a menu. The menu is fixed-positioned so scrolling containers cannot clip it. */
export function ActionMenu({
  actions,
  label,
  className = 'btn btn-sm btn-icon row-menu-button',
}: Props) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setStyle(null), []);
  useDismiss(ref, style !== null, close);

  const open = (button: HTMLButtonElement): void => {
    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom > 200;
    setStyle({
      position: 'fixed',
      right: window.innerWidth - rect.right,
      ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
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
      {style && (
        <div className="menu" role="menu" style={style}>
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
        </div>
      )}
    </div>
  );
}
