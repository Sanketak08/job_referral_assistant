import type { RunEvent } from '@jobhunt/shared';
import { MAX_TOOL_TEXT } from '../config.ts';

// The subset of Claude Code's stream-json lines that the UI uses. Every field is optional
// because the format belongs to the CLI and can gain or drop fields between versions.
interface StreamLine {
  type?: string;
  subtype?: string;
  session_id?: string;
  model?: string;
  parent_tool_use_id?: string | null;
  message?: { content?: string | ContentBlock[]; usage?: Usage };
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
}

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
}

interface Usage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Returns a parser for one run. It keeps the last context size so repeats are not re-sent. */
export function createParser(): (line: string) => RunEvent[] {
  let lastContextTokens = 0;

  return (line) => {
    if (!line.trim()) return [];
    const msg = parseLine(line);
    if (!msg) return [{ type: 'log', text: line }];

    switch (msg.type) {
      case 'system':
        return msg.subtype === 'init' && msg.session_id
          ? [{ type: 'session', sessionId: msg.session_id, model: msg.model ?? '' }]
          : [];

      case 'assistant': {
        const events = blocks(msg).flatMap(assistantBlock);
        // Subagent calls have their own, smaller context; only the main agent's matters.
        const tokens = msg.parent_tool_use_id ? 0 : contextTokens(msg.message?.usage);
        if (tokens > 0 && tokens !== lastContextTokens) {
          lastContextTokens = tokens;
          events.push({ type: 'usage', contextTokens: tokens });
        }
        return events;
      }

      case 'user':
        return blocks(msg).flatMap(toolResultBlock);

      case 'result':
        return [
          {
            type: 'run_finished',
            status: msg.is_error ? 'error' : 'success',
            result: msg.result ?? msg.subtype ?? null,
            costUsd: msg.total_cost_usd ?? null,
            durationMs: msg.duration_ms ?? null,
            numTurns: msg.num_turns ?? null,
          },
        ];

      default:
        return [];
    }
  };
}

function parseLine(line: string): StreamLine | null {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null ? (value as StreamLine) : null;
  } catch {
    return null;
  }
}

function blocks(msg: StreamLine): ContentBlock[] {
  const content = msg.message?.content;
  return Array.isArray(content) ? content : [];
}

function assistantBlock(block: ContentBlock): RunEvent[] {
  if (block.type === 'text' && block.text?.trim()) return [{ type: 'text', text: block.text }];
  if (block.type === 'tool_use' && block.id && block.name) {
    return [
      {
        type: 'tool_use',
        toolUseId: block.id,
        name: block.name,
        summary: summarize(block.input),
        input: truncate(JSON.stringify(block.input ?? {}, null, 2)),
      },
    ];
  }
  return [];
}

function toolResultBlock(block: ContentBlock): RunEvent[] {
  if (block.type !== 'tool_result' || !block.tool_use_id) return [];
  return [
    {
      type: 'tool_result',
      toolUseId: block.tool_use_id,
      content: truncate(resultText(block.content)),
      isError: block.is_error === true,
    },
  ];
}

function resultText(content: ContentBlock['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (part.type === 'text' ? (part.text ?? '') : `[${part.type}]`))
    .join('\n');
}

/** A one-line hint for the collapsed tool row: the first short string in the input. */
function summarize(input: unknown): string {
  if (typeof input !== 'object' || input === null) return '';
  const first = Object.values(input).find((v): v is string => typeof v === 'string');
  if (!first) return '';
  const oneLine = first.replace(/\s+/g, ' ').trim();
  return oneLine.length > 100 ? `${oneLine.slice(0, 100)}…` : oneLine;
}

function contextTokens(usage: Usage | undefined): number {
  if (!usage) return 0;
  return (
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}

function truncate(text: string): string {
  if (text.length <= MAX_TOOL_TEXT) return text;
  return `${text.slice(0, MAX_TOOL_TEXT)}\n… (${text.length - MAX_TOOL_TEXT} more characters)`;
}
