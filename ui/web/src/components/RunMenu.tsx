import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';

interface Props {
  presetLabel: string;
  disabled: boolean;
  onPreset: () => void;
  onCustom: () => void;
}

/** "Run ▾": the dark split button. The left half runs the preset, the arrow opens more options. */
export function RunMenu({ presetLabel, disabled, onPreset, onCustom }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="split" ref={ref}>
      <button className="btn btn-dark split-main" disabled={disabled} onClick={onPreset}>
        <Icon name="play" size={14} />
        {presetLabel}
      </button>
      <button
        className="btn btn-dark split-arrow"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label="More run options"
        aria-expanded={open}
      >
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={pick(onPreset)}>
            <Icon name="play" size={14} /> {presetLabel}
          </button>
          <button role="menuitem" onClick={pick(onCustom)}>
            <Icon name="sparkle" size={14} /> Run with custom input…
          </button>
        </div>
      )}
    </div>
  );
}
