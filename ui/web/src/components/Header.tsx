import type { ThemePref } from '../hooks/useTheme.ts';
import { Icon } from './Icon.tsx';

interface Props {
  userName: string | null;
  connected: boolean;
  theme: ThemePref;
  onCycleTheme: () => void;
  onOpenMenu: () => void;
}

const THEME_ICON = { system: 'monitor', light: 'sun', dark: 'moon' } as const;

export function Header({ userName, connected, theme, onCycleTheme, onOpenMenu }: Props) {
  const today = new Date();
  return (
    <header className="header">
      <button className="btn btn-ghost btn-icon menu-button" onClick={onOpenMenu} aria-label="Menu">
        <Icon name="menu" />
      </button>
      <div className="greeting">
        <h1>
          {greeting(today.getHours())}
          {userName ? `, ${userName}` : ''}
        </h1>
        <p>
          {today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
      <div className="header-actions">
        <span className={connected ? 'conn conn-on' : 'conn conn-off'}>
          <span className="status-dot" />
          <span className="conn-text">{connected ? 'Connected' : 'Reconnecting…'}</span>
        </span>
        <button
          className="btn btn-icon"
          onClick={onCycleTheme}
          aria-label={`Theme: ${theme}. Click to change.`}
          title={`Theme: ${theme}`}
        >
          <Icon name={THEME_ICON[theme]} size={17} />
        </button>
      </div>
    </header>
  );
}

function greeting(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
