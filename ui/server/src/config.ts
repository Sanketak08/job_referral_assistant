import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { JobRef, TabId } from '@jobhunt/shared';

const serverSrc = path.dirname(fileURLToPath(import.meta.url));

// Optional overrides. Loaded here rather than with `node --env-file-if-exists`, which logs a
// warning on every start when the file is missing.
const envFile = path.resolve(serverSrc, '../../.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

/** Claude runs from the repo root so CLAUDE.md, .claude/skills and .mcp.json load as in the terminal. */
export const REPO_ROOT = path.resolve(serverSrc, '../../..');
export const WEB_ROOT = path.resolve(serverSrc, '../../web');
export const DB_PATH = process.env.DB_PATH ?? path.resolve(serverSrc, '../../data/jobhunt.db');

export const PROFILE_PATH = process.env.PROFILE_PATH ?? path.join(REPO_ROOT, 'input/profile.yaml');
/** Where the skills write their CSVs (daily_jobs_*.csv, applied_jobs.csv, contacted_people.csv). */
export const OUTPUT_DIR = path.join(REPO_ROOT, 'output');

export const PORT = Number(process.env.PORT ?? 3000);
export const HOST = process.env.HOST ?? '127.0.0.1';
export const CLAUDE_BIN = process.env.CLAUDE_BIN ?? 'claude';
export const IS_DEV = process.env.NODE_ENV !== 'production';

/** How many runs the History page lists. */
export const HISTORY_LIMIT = 500;
/** How many past runs per tab the browser receives when it connects. */
export const HISTORY_RUNS_PER_TAB = 20;
/** Tool inputs and results longer than this are cut before they are stored and shown. */
export const MAX_TOOL_TEXT = 4000;
/** Images in tool results larger than this (base64 characters, about 3 MB) are not stored. */
export const MAX_IMAGE_CHARS = 4_000_000;

/**
 * Every MCP server this Claude Code install can load, as the name used in tool ids
 * (mcp__<name>__<tool>): the servers in .mcp.json plus the claude.ai connectors on the account.
 * Each tab disables the ones it does not need with --disallowedTools. --strict-mcp-config is
 * not used because it also drops the claude.ai connectors, and Search needs Indeed.
 * Add new connectors here, otherwise their tools load into every tab.
 */
const ALL_MCP_SERVERS = [
  'playwright',
  'apify',
  'apollo-io',
  'tavily',
  'jobspy',
  'gmail',
  'claude_ai_Indeed',
  'claude_ai_Gmail',
  'claude_ai_Google_Drive',
  'claude_ai_Google_Sheets',
  'claude_ai_Google_Calendar',
  'claude_ai_Claude_Docs',
  'claude_ai_Notion',
  'claude_ai_Atlassian_MCP',
  'claude_ai_Microsoft_365',
] as const;

export type McpServer = (typeof ALL_MCP_SERVERS)[number];

export interface TabPreset {
  id: TabId;
  label: string;
  /** Model alias or full id passed to --model. */
  model: string;
  presetLabel: string;
  presetPrompt: string;
  description: string;
  mcpServers: readonly McpServer[];
  /** Tools that always need an Approve click in the UI, even though settings allow them. */
  askTools?: readonly string[];
  /** Builds the prompt when jobs are sent here from the Matches table. */
  handoffPrompt?: (jobs: JobRef[]) => string;
}

const jobList = (jobs: JobRef[]): string =>
  jobs.map((j, i) => `${i + 1}. ${j.title} | ${j.company} | ${j.link}`).join('\n');

// Preset prompts use the slash form so they resolve to the repo skill, not the older
// anthropic-skills: copy on the account.
export const TABS: readonly TabPreset[] = [
  {
    id: 'search',
    label: 'Search',
    model: 'opus',
    presetLabel: 'Run daily search',
    presetPrompt: '/job-search-phase',
    description: 'Finds jobs posted in the last 24 hours and ranks them against your profile.',
    // Indeed (Tier 3b), JobSpy (Tier 4), and Tavily/Playwright/Apify for direct-form resolution.
    mcpServers: ['claude_ai_Indeed', 'jobspy', 'tavily', 'playwright', 'apify'],
  },
  {
    id: 'apply',
    label: 'Apply',
    model: 'sonnet',
    presetLabel: 'Apply to top matches',
    presetPrompt: '/job-application-phase',
    description:
      'Fills each application form from your profile and waits for your OK before submitting.',
    // Playwright fills the forms; Tavily finds the company's own page for aggregator links.
    mcpServers: ['playwright', 'tavily'],
    handoffPrompt: (jobs) =>
      `/job-application-phase Apply only to these jobs from the latest daily_jobs CSV, in this order:\n${jobList(jobs)}`,
  },
  {
    id: 'referral',
    label: 'Referral',
    model: 'sonnet',
    presetLabel: 'Find referrals',
    presetPrompt: '/job-referral-phase',
    description:
      'Checks visa and relocation, finds engineers at the company and drafts emails for your approval.',
    // No Playwright: Apply uses it, and both tabs would fight over the same browser profile.
    mcpServers: ['gmail', 'tavily'],
    // Every email waits for an Approve click showing recipient, subject and body.
    askTools: ['mcp__gmail__send_email_with_attachment'],
    handoffPrompt: (jobs) =>
      `/job-referral-phase Find referral contacts for these jobs, one company at a time:\n${jobList(jobs)}`,
  },
];

/**
 * How long Claude Code waits for an MCP tool, here the approval tool (ms). The default is far
 * too short for approving from a phone later; progress notifications keep the call alive.
 */
export const APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** Prompt that asks Claude to compact the session it is resumed into. */
export const COMPACT_PROMPT = '/compact';

export function findTab(id: string): TabPreset | undefined {
  return TABS.find((tab) => tab.id === id);
}

export function disallowedMcpServers(tab: TabPreset): McpServer[] {
  return ALL_MCP_SERVERS.filter((server) => !tab.mcpServers.includes(server));
}
