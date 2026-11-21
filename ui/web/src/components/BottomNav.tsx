import type { TabId, TabInfo } from '@jobhunt/shared';
import { WAITING, type TabStatus } from '../tabs/runs.ts';
import { TAB_ICONS } from '../tabs/tabIcons.ts';
import { Icon, type IconName } from './Icon.tsx';

interface Props {
  tabs: TabInfo[];
  statuses: Partial<Record<TabId, TabStatus>>;
  counts: Partial<Record<TabId, number>>;
  view: string;
  onNavigate: (view: string) => void;
}

/** Phone navigation: every page one thumb-tap away, with the same badges as the sidebar. */
export function BottomNav({ tabs, statuses, counts, view, onNavigate }: Props) {
  const items: { id: string; label: string; icon: IconName; tab?: TabId }[] = [
    ...tabs.map((t) => ({ id: t.id, label: t.label, icon: TAB_ICONS[t.id], tab: t.id })),
    { id: 'history', label: 'History', icon: 'history' },
    { id: 'profile', label: 'Profile', icon: 'user' },
  ];

  return (
    <nav className="bottom-nav" aria-label="Pages">
      {items.map((item) => {
        const status = item.tab ? statuses[item.tab] : undefined;
        const count = item.tab ? counts[item.tab] : undefined;
        const waiting = status !== undefined && WAITING.includes(status);
        return (
          <button
            key={item.id}
            className={view === item.id ? 'bottom-item active' : 'bottom-item'}
            onClick={() => onNavigate(item.id)}
            aria-current={view === item.id ? 'page' : undefined}
          >
            <span className="bottom-icon">
              <Icon name={item.icon} size={21} />
              {waiting && <span className="bottom-badge bottom-badge-alert">!</span>}
              {!waiting && status === 'running' && <span className="bottom-dot" />}
              {!waiting && status !== 'running' && !!count && (
                <span className="bottom-badge">{count}</span>
              )}
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
