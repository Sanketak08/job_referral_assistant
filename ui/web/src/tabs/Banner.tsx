import type { TabInfo } from '@jobhunt/shared';
import { Icon } from '../components/Icon.tsx';
import { useNow } from '../hooks/useNow.ts';
import {
  firstLine,
  formatCost,
  formatDuration,
  formatTokens,
  toolLabel,
  type RunView,
  type TabStatus,
} from './runs.ts';
import { TAB_ICONS } from './tabIcons.ts';

interface Props {
  info: TabInfo;
  status: TabStatus;
  latest: RunView | undefined;
}

/** The big blue status card at the top of a tab. */
export function Banner({ info, status, latest }: Props) {
  const now = useNow(status === 'running');
  const art = status === 'needs_approval' ? 'shield' : TAB_ICONS[info.id];
  const { chip, title, detail } = describe(info, status, latest, now);

  return (
    // A stopped run leaves the tab ready again, so it shares the green Ready look.
    <div className={`banner banner-${status === 'stopped' ? 'idle' : status}`}>
      <span className="banner-chip">
        {chip}
        {status === 'running' ? (
          <span className="spinner spinner-light" />
        ) : (
          <Icon name="sparkle" size={12} />
        )}
      </span>
      <h2 className="banner-title">{title}</h2>
      {detail && <p className="banner-detail">{detail}</p>}
      <span className="banner-art" aria-hidden="true">
        <Icon name={art} size={150} />
      </span>
    </div>
  );
}

function describe(
  info: TabInfo,
  status: TabStatus,
  latest: RunView | undefined,
  now: number,
): { chip: string; title: string; detail: string } {
  const ctx = latest?.contextTokens != null ? `ctx ${formatTokens(latest.contextTokens)}` : '';
  const result = latest?.finished;
  const stats = [
    result?.durationMs != null && formatDuration(result.durationMs),
    result?.costUsd != null && `${formatCost(result.costUsd)} at API rates`,
    ctx,
  ]
    .filter(Boolean)
    .join(' · ');

  switch (status) {
    case 'idle':
      return {
        chip: 'Ready',
        title: info.description,
        detail: `Model ${info.model} · ${info.mcpServers.map((s) => s.replace(/^claude_ai_/, '')).join(', ')}`,
      };
    case 'running':
      return {
        chip: latest?.kind === 'compact' ? 'Compacting' : 'Running',
        title: latest?.lastActivity ?? 'Starting Claude…',
        detail: [latest && `Running for ${formatDuration(now - Date.parse(latest.startedAt))}`, ctx]
          .filter(Boolean)
          .join(' · '),
      };
    case 'needs_approval': {
      const request = latest?.pendingApproval;
      return {
        chip: 'Needs your approval',
        title: `Allow ${request ? toolLabel(request.toolName) : 'a tool'}?`,
        detail: 'Claude is paused until you choose Allow or Deny below.',
      };
    }
    case 'needs_reply':
      return {
        chip: 'Needs your reply',
        title: firstLine(lastQuestion(latest?.lastText ?? ''), 160),
        detail: 'Answer in the box below. Claude continues the same session.',
      };
    case 'done':
      return {
        chip: latest?.kind === 'compact' ? 'Compacted' : 'Complete',
        title: firstLine(result?.result || latest?.lastText || 'Run finished', 160),
        detail: stats,
      };
    case 'failed':
      return {
        chip: 'Failed',
        title: 'The run did not finish',
        detail: firstLine(result?.result ?? 'Unknown error', 200),
      };
    case 'stopped':
      return {
        chip: 'Ready',
        title: info.description,
        detail:
          'Last run was stopped. Send a message to pick up where it left off, or start a new run.',
      };
  }
}

/** The last paragraph, which is where Claude puts its question. */
function lastQuestion(text: string): string {
  const paragraphs = text.trim().split(/\n\s*\n/);
  return paragraphs.at(-1) ?? text;
}
