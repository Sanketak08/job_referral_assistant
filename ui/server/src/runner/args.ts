import { disallowedMcpServers, PORT, type TabPreset } from '../config.ts';
import { MCP_SERVER_NAME, PERMISSION_TOOL } from '../mcp/permissionServer.ts';

// Claude runs headless, so it cannot show the terminal's question picker.
const HEADLESS_NOTE = [
  'You are running non-interactively, started from a local web UI.',
  'When you need a decision, an approval or missing information from the user,',
  'ask in plain text at the end of your reply and end your turn.',
  'The answer arrives as the next message in this session.',
  'The user may also send messages while you work; take them into account at your next step.',
].join(' ');

/** CLI arguments for one run. Prompts go to stdin as stream-json, so they can never be read as flags. */
export function buildArgs(tab: TabPreset, runId: number, resumeSessionId: string | null): string[] {
  const disallowed = ['AskUserQuestion', ...disallowedMcpServers(tab).map((s) => `mcp__${s}`)];
  // The tab's own servers are pre-approved; anything else that needs permission comes to the UI.
  const allowed = tab.mcpServers.map((s) => `mcp__${s}`);
  const permissionServer = {
    mcpServers: {
      [MCP_SERVER_NAME]: { type: 'http', url: `http://127.0.0.1:${PORT}/mcp/${runId}` },
    },
  };

  return [
    ...(resumeSessionId ? ['--resume', resumeSessionId] : []),
    '--print',
    // Messages go in as stream-json on stdin, so more can be sent while Claude works.
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    tab.model,
    // Overrides bypassPermissions from .claude/settings.json, so permission checks reach the UI.
    '--permission-mode',
    'manual',
    '--mcp-config',
    JSON.stringify(permissionServer),
    '--permission-prompt-tool',
    PERMISSION_TOOL,
    '--allowedTools',
    allowed.join(','),
    '--disallowedTools',
    disallowed.join(','),
    ...(tab.askTools?.length
      ? ['--settings', JSON.stringify({ permissions: { ask: tab.askTools } })]
      : []),
    '--append-system-prompt',
    HEADLESS_NOTE,
  ];
}
