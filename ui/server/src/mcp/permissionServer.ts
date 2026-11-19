import { Router, type Request, type Response } from 'express';
import { findRunTab } from '../store/db.ts';
import { decide, requestApproval } from './approvals.ts';

// A minimal MCP server (Streamable HTTP, JSON-RPC 2.0) with one tool, `approve`, that Claude Code
// calls through --permission-prompt-tool whenever a tool needs permission. Each run gets its own
// URL (/mcp/<runId>) so a request is tied to the run and tab it came from.

export const MCP_SERVER_NAME = 'jobhunt_ui';
export const PERMISSION_TOOL = `mcp__${MCP_SERVER_NAME}__approve`;

/** Claude Code drops a tool call that shows no progress for 300 s; report progress well before. */
const PROGRESS_EVERY_MS = 30_000;

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: {
    protocolVersion?: string;
    name?: string;
    arguments?: { tool_name?: string; input?: unknown; tool_use_id?: string };
    _meta?: { progressToken?: string | number };
  };
}

export const mcpRouter = Router();

mcpRouter.post('/:runId', (req: Request<{ runId: string }, unknown, RpcRequest>, res: Response) => {
  const msg = req.body;
  // Notifications (no id) need no answer.
  if (msg.id === undefined) return void res.status(202).end();

  const reply = (result: unknown): void => void res.json({ jsonrpc: '2.0', id: msg.id, result });

  switch (msg.method) {
    case 'initialize':
      return reply({
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: MCP_SERVER_NAME, version: '1.0.0' },
      });
    case 'tools/list':
      return reply({
        tools: [
          {
            name: 'approve',
            description: 'Asks the user in the Job Hunt web UI to allow or deny a tool call.',
            inputSchema: {
              type: 'object',
              properties: {
                tool_name: { type: 'string' },
                input: { type: 'object' },
                tool_use_id: { type: 'string' },
              },
              required: ['tool_name', 'input'],
            },
          },
        ],
      });
    case 'tools/call':
      return void handleApprove(Number(req.params.runId), msg, res);
    case 'ping':
      return reply({});
    default:
      res.json({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: `Unknown method ${msg.method}` },
      });
  }
});

// No server-initiated stream and no session to end.
mcpRouter.all('/:runId', (_req, res) => void res.status(405).end());

/**
 * Answers as an SSE stream so the response can stay open for as long as the user takes, with
 * progress notifications to keep Claude Code from timing the call out.
 */
async function handleApprove(runId: number, msg: RpcRequest, res: Response): Promise<void> {
  const tab = findRunTab(runId);
  const args = msg.params?.arguments;
  if (!tab || msg.params?.name !== 'approve' || !args?.tool_name) {
    res.json({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32602, message: 'Invalid approval request' },
    });
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const send = (payload: unknown): void =>
    void res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);

  const { id, decision } = requestApproval({
    runId,
    tab,
    toolName: args.tool_name,
    input: args.input,
  });
  // If Claude goes away (run stopped, timeout), nobody is waiting for this answer any more.
  res.on('close', () => decide(id, 'cancelled'));

  const token = msg.params?._meta?.progressToken;
  let progress = 0;
  const timer = setInterval(() => {
    progress++;
    if (token === undefined) res.write(': waiting\n\n');
    else
      send({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: { progressToken: token, progress, message: 'Waiting for approval in the web UI' },
      });
  }, PROGRESS_EVERY_MS);

  const outcome = await decision;
  clearInterval(timer);
  const answer =
    outcome === 'allowed'
      ? { behavior: 'allow', updatedInput: args.input ?? {} }
      : {
          behavior: 'deny',
          message:
            outcome === 'denied'
              ? 'The user denied this in the web UI.'
              : 'The request was cancelled.',
        };
  send({
    jsonrpc: '2.0',
    id: msg.id,
    result: { content: [{ type: 'text', text: JSON.stringify(answer) }] },
  });
  res.end();
}
