import type { TabId, TabInfo } from '@jobhunt/shared';
import { formatCost, WAITING, type TabStatus } from '../tabs/runs.ts';
import { TAB_ICONS } from '../tabs/tabIcons.ts';
import { Icon, type IconName } from './Icon.tsx';

export interface TodayUsage {
  runs: number;
  costUsd: number;
}

interface Props {
  tabs: TabInfo[];
  statuses: Partial<Record<TabId, TabStatus>>;
  /** Extra count per tab shown as a badge, e.g. new matches. */
  counts: Partial<Record<TabId, number>>;
  view: string;
  onNavigate: (view: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  today: TodayUsage;
}

export function Sidebar(props: Props) {
  const { tabs, statuses, counts, view, onNavigate, collapsed, onToggleCollapsed, today } = props;

  return (
    <aside className={collapsed ? 'sidebar collapsed' : 'sidebar'}>
      <div className="brand">
        <span className="brand-mark">
          <Icon name="briefcase" size={18} />
        </span>
        <span className="brand-text">
          <span className="brand-name">Job Hunt</span>
          <span className="brand-sub">Powered by Claude</span>
        </span>
        <button
          className="btn btn-ghost btn-icon collapse-toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name="panel" size={17} />
        </button>
      </div>

      <nav>
        <p className="nav-label">Pipeline</p>
        {tabs.map((tab) => (
          <NavItem
            key={tab.id}
            icon={TAB_ICONS[tab.id]}
            label={tab.label}
            active={view === tab.id}
            onClick={() => onNavigate(tab.id)}
            status={statuses[tab.id]}
            count={counts[tab.id]}
          />
        ))}
        <p className="nav-label nav-label-gap">Workspace</p>
        <NavItem
          icon="history"
          label="History"
          active={view === 'history'}
          onClick={() => onNavigate('history')}
        />
        <NavItem
          icon="user"
          label="Profile"
          active={view === 'profile'}
          onClick={() => onNavigate('profile')}
        />
      </nav>

      <div className="usage-card">
        <span className="usage-icon">
          <Icon name="sparkle" size={16} />
        </span>
        <strong>Max plan</strong>
        <p>
          Today: {today.runs} {today.runs === 1 ? 'run' : 'runs'} · {formatCost(today.costUsd)} at
          API rates, covered by your subscription.
        </p>
      </div>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  status,
  count,
}: {
  icon: IconName;
  label: string;
  active: boolean;
  onClick: () => void;
  status?: TabStatus;
  count?: number;
}) {
  return (
    <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick} title={label}>
      <Icon name={icon} />
      <span className="nav-text">{label}</span>
      {status === 'running' && <span className="nav-running" title="Running" />}
      {status && WAITING.includes(status) && (
        <span className="nav-badge nav-badge-alert" title="Waiting for you">
          !
        </span>
      )}
      {status !== 'running' && !(status && WAITING.includes(status)) && !!count && (
        <span className="nav-badge">{count}</span>
      )}
    </button>
  );
}
