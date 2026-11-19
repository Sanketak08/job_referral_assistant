# Job Hunt UI

A small local web app that replaces the three Claude Code terminals (Search, Apply, Referral).
Each button press runs `claude -p` in the repo root, so the skills, `CLAUDE.md` and MCP servers
load exactly as they do in the terminal, and usage is billed to the Claude Max login, not the API.

Status: roadmap steps 0–1 are done (Search tab: Run, Stop, live stream, run history).
Chat replies, Apply and Referral tabs, results table and approvals come next.

## Architecture

```
Browser (laptop, or phone via Tailscale)
   │  REST  /api/tabs, /api/tabs/:tab/run, /api/tabs/:tab/stop
   │  WebSocket /ws  (snapshot on connect, then one message per event)
   ▼
Node server (ui/server, Express + ws, 127.0.0.1:3000)
   ├─ runner/   spawns `claude -p --output-format stream-json`, one process per run
   ├─ parser/   stream-json lines → typed RunEvents (ui/shared)
   ├─ store/    SQLite (node:sqlite) at ui/data/jobhunt.db: runs + events
   └─ live.ts   broadcasts each stored event to every open browser
   │
   ▼  cwd = repo root
Claude Code (headless) + .claude/skills + MCP servers
```

| Folder    | What it holds                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| `shared/` | Types used by both sides: `RunEvent`, `StoredEvent`, `ServerMessage`, `TabInfo`.                                   |
| `server/` | `config.ts` has every path, port, model and per-tab preset. Runs TypeScript directly with Node 24 (no build step). |
| `web/`    | React + Vite. One `TabView` component renders every tab from its `TabInfo`.                                        |

### Per-tab MCP servers

Each tab lists the MCP servers it needs in `server/src/config.ts`; every other server is turned
off with `--disallowedTools mcp__<server>`, so its tool definitions never enter the context.
`--strict-mcp-config` is not used: it also drops the claude.ai connectors, and Search needs the
Indeed connector. When you add a new connector to your Claude account, add its name to
`ALL_MCP_SERVERS` in `config.ts`, or its tools load into every tab.

Every run also disables `AskUserQuestion` and tells Claude to ask questions in plain text, since
there is no terminal to answer a picker.

## Prerequisites

- macOS with Node.js 24 or newer.
- Claude Code installed and logged in with the Max plan account (`claude` on the PATH).
- `ANTHROPIC_API_KEY` **not** set. If it is set, Claude Code bills the API instead of Max. The
  server strips it from every run anyway and warns at startup.
- The pipeline setup from the main [README](../README.md) (profile, resumes, `.venv`, keys).

## Run it

```sh
cd ui
npm install
npm start          # builds the web app and serves it at http://127.0.0.1:3000
```

For development, `npm run dev` serves the React app through Vite with hot reload. Restart the
server yourself after changing server code; it does not auto-restart, so a running Claude
process is never killed by a file save.

Optional settings go in `ui/.env` (see `.env.example`): `PORT`, `HOST`, `CLAUDE_BIN`.

| Script              | Does                                                        |
| ------------------- | ----------------------------------------------------------- |
| `npm run dev`       | Server + Vite hot reload on one port                        |
| `npm run build`     | Builds `web/dist`                                           |
| `npm start`         | Build, then serve the built app                             |
| `npm run typecheck` | `tsc --noEmit` for shared, server and web                   |
| `npm run lint`      | ESLint + Prettier check (`npm run format` fixes formatting) |

## Data

Run history (prompts, tool input/output, Claude's replies) is stored in `ui/data/jobhunt.db`.
It contains personal data and is gitignored. Delete the file to clear the history.
