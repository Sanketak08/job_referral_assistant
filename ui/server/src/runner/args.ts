import { disallowedMcpServers, type TabPreset } from '../config.ts';

// Claude runs headless, so it cannot show the terminal's question picker.
const HEADLESS_NOTE = [
  'You are running non-interactively, started from a local web UI.',
  'When you need a decision, an approval or missing information from the user,',
  'ask in plain text at the end of your reply and end your turn.',
  'The answer arrives as the next message in this session.',
].join(' ');

/** CLI arguments for one run. The prompt itself goes to stdin, so it can never be read as a flag. */
export function buildArgs(tab: TabPreset, resumeSessionId: string | null): string[] {
  const disallowed = ['AskUserQuestion', ...disallowedMcpServers(tab).map((s) => `mcp__${s}`)];
  const resume = resumeSessionId ? ['--resume', resumeSessionId] : [];
  return [
    ...resume,
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    tab.model,
    '--disallowedTools',
    disallowed.join(','),
    '--append-system-prompt',
    HEADLESS_NOTE,
  ];
}
