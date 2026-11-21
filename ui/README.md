# Job Hunt UI

A local web app that replaces the three Claude Code terminals (Search, Apply, Referral). Every
button runs `claude -p` in the repo root, so the skills, `CLAUDE.md` and MCP servers load exactly
as in the terminal, and usage is billed to your Claude Max login, not the API.

Runs on macOS. Open it on the Mac at http://127.0.0.1:3000, or from your phone through Tailscale.

## What you can do

| Where                                         | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Search / Apply / Referral**                 | **Run ▾** starts the tab's skill in a new session; **Run with custom input** lets you add instructions. The chat box continues the same Claude session (`--resume`), so you can answer Claude's questions; while a run is working, a message goes straight to it and Claude reads it at its next step, as in the terminal. **New session** clears context, **Compact** runs `/compact`, **Stop** interrupts. The blue banner says what Claude is doing or waiting for. |
| **Search → Matches**                          | A `daily_jobs_*.csv` as a table (the newest by default; **Jobs from** picks an older one): match score, source, posted date, Applied/Contacted status. Select rows and press **Apply to selected** or **Get referrals** to start that tab with exactly those jobs.                                                                                                                                                                                                     |
| **Apply → Applied**, **Referral → Contacted** | `applied_jobs.csv` and `contacted_people.csv`. Form screenshots from Playwright show inline in Apply's activity so you can check a form before you approve it.                                                                                                                                                                                                                                                                                                         |
| **Approvals**                                 | When Claude wants a tool that needs permission, an **Allow / Deny** card appears and the run waits (for hours if needed). Referral asks before **every** Gmail send and shows recipient, subject, body and attachment.                                                                                                                                                                                                                                                 |
| **Edit skill** (Search / Apply / Referral)    | Describe a change and Claude edits that tab's skill in `.claude/skills/<skill>/`. The panel becomes a chat so Claude can ask back. It runs in a separate editor session, so it never blocks the tab.                                                                                                                                                                                                                                                                   |
| **History**                                   | Every run with status, duration and cost at API rates; click a prompt to replay the whole run.                                                                                                                                                                                                                                                                                                                                                                         |
| **Profile**                                   | Edit `input/profile.yaml` directly, or press **Ask Claude** and describe the change; the editor refreshes when the file changes on disk. Saving keeps the previous version as `profile.yaml.bak` and refuses if the file changed since you opened it.                                                                                                                                                                                                                  |

On phones a bottom tab bar replaces the sidebar and secondary buttons fold into a `⋯` menu. The sidebar shows a pulsing dot while a tab runs and a red **!** when it waits for your reply or
approval. The theme button in the header cycles system → light → dark.

## Architecture

```
Browser (Mac, or phone via Tailscale)
   │  REST  /api/...                     WebSocket /ws (snapshot on connect, then live events)
   ▼
Node server  ui/server  (Express + ws, 127.0.0.1:3000)
   ├─ runner/    spawns `claude -p --output-format stream-json` per run, prompt on stdin
   ├─ parser/    stream-json lines → typed RunEvents (ui/shared)
   ├─ store/     SQLite via node:sqlite (ui/data/jobhunt.db): runs, events, tab sessions
   ├─ files/     reads output/*.csv and input/profile.yaml; watches output/ for changes
   ├─ mcp/       /mcp/<runId>: tiny MCP server with one `approve` tool (--permission-prompt-tool)
   └─ live.ts    pushes every stored event to all open browsers
   │
   ▼  cwd = repo root
Claude Code (headless) + .claude/skills + MCP servers
```

| Folder    | What it holds                                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| `shared/` | Types used by both sides: `RunEvent`, `ServerMessage`, `TabInfo`, CSV row types.                                     |
| `server/` | `src/config.ts` has every path, port, model and per-tab preset. Runs TypeScript directly on Node 24 (no build step). |
| `web/`    | React + Vite. One `TabView` renders every pipeline tab from its `TabInfo`; `DataTable` renders every table.          |

### How a run is started

```
claude --print --input-format stream-json --output-format stream-json --verbose --model <tab model>
       [--resume <session>]                      # chat box and Compact only
       --permission-mode manual                  # overrides bypassPermissions in .claude/settings.json
       --mcp-config '{"mcpServers":{"jobhunt_ui":{"type":"http","url":"http://127.0.0.1:3000/mcp/<runId>"}}}'
       --permission-prompt-tool mcp__jobhunt_ui__approve
       --allowedTools <the tab's MCP servers>
       --disallowedTools AskUserQuestion,<every other MCP server>
       [--settings '{"permissions":{"ask":[...]}}']   # Referral: every Gmail send
       --append-system-prompt <"ask questions in plain text, then end your turn">
```

- **Per-tab MCP servers.** Each tab lists its servers in `config.ts`; all others are turned off
  with `--disallowedTools mcp__<server>`, so their tool definitions never enter the context.
  `--strict-mcp-config` is not used because it also drops the claude.ai connectors, and Search
  needs Indeed. When you add a connector to your Claude account, add it to `ALL_MCP_SERVERS`.

  | Tab      | Model  | MCP servers                                                             |
  | -------- | ------ | ----------------------------------------------------------------------- |
  | Search   | opus   | Indeed (claude.ai), jobspy, tavily, playwright, apify                   |
  | Apply    | sonnet | playwright, tavily                                                      |
  | Referral | sonnet | gmail, tavily (no Playwright, so it never fights Apply for the browser) |

- **Approvals.** The approval tool answers over a server-sent event stream and sends MCP progress
  notifications every 30 s. Claude Code drops a tool call with no progress after 300 s, and the
  server also sets `MCP_TOOL_TIMEOUT` to 24 h, so you can approve from your phone much later.
- **Messages while running.** Prompts are written to stdin as stream-json and stdin stays open
  until Claude finishes its turn, so chat messages reach the running process. A message that
  arrives as the turn ends (or during `/compact`) is queued and sent as the next run in the same
  session. Stop discards anything queued before it.
- **Billing.** `ANTHROPIC_API_KEY` is removed from every run's environment. Cost shown in the UI is
  what the run would cost at API rates; on Max it counts toward your plan usage instead.

## Setup

Prerequisites: macOS, Node.js 24+, Claude Code logged in with your Max account (`claude` on the
PATH), and the pipeline setup from the main [README](../README.md) (profile, resumes, `.venv`,
keys). Keep `ANTHROPIC_API_KEY` unset.

```sh
./start.sh            # from the repo root: installs, builds, serves http://127.0.0.1:3000
```

`start.sh` runs the server under `caffeinate -is`, so the Mac does not sleep while it is plugged
in. Optional settings go in `ui/.env` (see `.env.example`).

### Development

```sh
cd ui
npm install
npm run dev          # nodemon server + Vite hot reload for the web app, one port
```

Nothing needs a manual restart in dev: web changes hot-reload in the browser, and nodemon
restarts the server when `server/src` or `shared/src` changes (`server/nodemon.json`). A restart
interrupts any run in progress; its Claude session survives, so send a message in that tab to
continue. For long Apply or Referral runs, use `./start.sh` (no file watching) instead.

| Script              | Does                                                        |
| ------------------- | ----------------------------------------------------------- |
| `npm run dev`       | Server (nodemon) + Vite hot reload                          |
| `npm run build`     | Builds `web/dist`                                           |
| `npm start`         | Build, then serve the built app                             |
| `npm run typecheck` | `tsc --noEmit` for shared, server and web                   |
| `npm run lint`      | ESLint + Prettier check (`npm run format` fixes formatting) |

## Use it from your phone (Tailscale)

The server only listens on `127.0.0.1`. Tailscale's `serve` puts it on your private tailnet with
HTTPS, so only your own devices can reach it and nothing is exposed to the internet or your Wi-Fi.

1. Install Tailscale on the Mac (Mac App Store or https://tailscale.com/download) and on your
   phone, and sign in to the same account on both.
2. On the Mac, with the UI running:
   ```sh
   tailscale serve --bg 3000
   # App Store install: /Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg 3000
   ```
   It prints an address like `https://your-mac.tailnet-name.ts.net`. Open that on the phone.
   `tailscale serve status` shows it, `tailscale serve --https=443 off` removes it.
3. Never use `tailscale funnel` for this app: it can run shell commands, submit applications and
   send email, and has no login of its own.

## Keep it running

**Start at login (launchd).** Create `~/Library/LaunchAgents/com.jobhunt.ui.plist`, replacing the
path with your repo location:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jobhunt.ui</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>/Users/YOU/path/to/job_referral_assistant/start.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/YOU/path/to/job_referral_assistant/ui/data/server.log</string>
  <key>StandardErrorPath</key><string>/Users/YOU/path/to/job_referral_assistant/ui/data/server.log</string>
</dict>
</plist>
```

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jobhunt.ui.plist   # start now and at login
launchctl bootout gui/$(id -u)/com.jobhunt.ui                                   # stop and remove
```

**Power.**

- `caffeinate -s` in `start.sh` keeps the Mac awake on power, but closing the lid still sleeps it
  unless an external display is connected. To keep it awake with the lid closed:
  `sudo pmset -a disablesleep 1` (undo with `sudo pmset -a disablesleep 0`).
- System Settings → Battery → Options: turn on "Prevent automatic sleeping on power adapter when
  the display is off".
- System Settings → Battery → Charging: use the charge limit (e.g. 80 %) if your Mac offers it, since
  the laptop stays plugged in.

## Data

Run history (prompts, tool input and output, screenshots, Claude's replies) is stored in
`ui/data/jobhunt.db`. It contains personal data and is gitignored. Delete the file to clear the
history.
