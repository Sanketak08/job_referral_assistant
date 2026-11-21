# Job Hunt UI

A web page for running the job-hunt pipeline (Search, Apply, Referral) instead of Claude Code
terminals. It runs on your Mac, uses your Claude Max login, and you can open it on your phone
through Tailscale.

## 1. One-time setup

You need:

- **A Mac** with **Node.js 24 or newer**: `node -v` should print `v24` or higher
  (install with [nvm](https://github.com/nvm-sh/nvm): `nvm install 24`).
- **Claude Code**, logged in with your Max account: run `claude` once and log in.
- **No `ANTHROPIC_API_KEY`** in your shell. `echo $ANTHROPIC_API_KEY` must print nothing,
  otherwise Claude Code bills the API instead of your Max plan.
- **The pipeline set up** as described in the main [README](../README.md):
  - `input/profile.yaml` (copy `input/profile.example.yaml` and fill it in)
  - your resume PDFs in `input/resumes/`
  - `.claude/settings.local.json` with your keys (copy `.claude/settings.local.example.json`)
  - the Python environment:
    ```sh
    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt
    .venv/bin/playwright install chromium
    ```

## 2. Start it

From the repo folder:

```sh
git pull
./start.sh
```

Then open **http://127.0.0.1:3000**. Stop it with **Ctrl+C**.

`start.sh` installs what is needed, builds the page and keeps the Mac awake while it runs on
power. After every `git pull`, just run `./start.sh` again.

Before your first run, close any old Claude Code terminal sessions of this project, especially
one that used the Apply skill: the UI's Apply tab needs the same Playwright browser.

## 3. Open it on your phone (Tailscale)

The page only listens on your Mac. Tailscale makes it reachable from your own devices, privately
and over HTTPS. Nothing is opened to the internet.

1. Install Tailscale on the Mac ([download](https://tailscale.com/download) or the Mac App Store)
   and on your phone. Sign in to **the same account** on both.
2. With the UI running, run this once on the Mac:
   ```sh
   tailscale serve --bg 3000
   ```
   With the App Store version, use the full path:
   `/Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg 3000`
3. It prints an address like `https://your-mac.your-tailnet.ts.net`. Open it on your phone and
   add it to the home screen.

`tailscale serve status` shows the address again; `tailscale serve --https=443 off` turns it off.
Never use `tailscale funnel` here: that would make the page public, and it can run commands and
send emails.

## 4. Optional: keep it running

**Start automatically at login.** Create `~/Library/LaunchAgents/com.jobhunt.ui.plist`
(replace `/path/to/job_referral_assistant` with your repo folder):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jobhunt.ui</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>/path/to/job_referral_assistant/start.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/path/to/job_referral_assistant/ui/data/server.log</string>
  <key>StandardErrorPath</key><string>/path/to/job_referral_assistant/ui/data/server.log</string>
</dict>
</plist>
```

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.jobhunt.ui.plist   # turn on
launchctl bootout gui/$(id -u)/com.jobhunt.ui                                   # turn off
```

**Keep the Mac awake.** `start.sh` already prevents sleep while plugged in. Closing the lid still
sleeps the Mac; to stop that, run `sudo pmset -a disablesleep 1` (undo with `0`). If your Mac has
a battery charge limit (System Settings → Battery), set it to about 80 %.

## Using it

- **Search, Apply, Referral**: press the big button to run the step. Watch Claude work, answer
  its questions in the chat box (you can also type while it works), and press **Stop** any time.
- **Allow / Deny cards**: some actions wait for your OK. Referral always asks before sending an
  email and shows the full email first.
- **Matches** (in Search): pick a jobs file, select jobs, then **Apply to selected** or
  **Get referrals**.
- **Edit skill** (in the `⋯` menu on phones) and **Ask Claude** (on Profile): describe a change in
  plain words and Claude updates the skill or your `profile.yaml`.
- **New session** clears Claude's memory for that tab; **Compact** shrinks it but keeps the gist.
- **History** lists every run; **Profile** edits `input/profile.yaml`.
- The button at the top right switches between system, light and dark theme.

## If something goes wrong

| Problem                                      | Fix                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Claude Code not found on PATH`              | Install Claude Code and check that `claude` works in Terminal                                   |
| Port 3000 is already in use                  | Put `PORT=3001` in `ui/.env` (see `ui/.env.example`) and use that port everywhere               |
| Apply fails with "Browser is already in use" | Close other Claude Code sessions that use Playwright                                            |
| Phone cannot open the page                   | The UI must be running, and both devices signed in to Tailscale; check `tailscale serve status` |
| Old icon or old look after an update         | Hard refresh: **Cmd+Shift+R**                                                                   |
| Start over with an empty history             | Stop the UI and delete `ui/data/jobhunt.db`                                                     |

## For developers

```sh
cd ui
npm install
npm run dev        # server restarts on code changes, page hot-reloads
npm run typecheck  # TypeScript checks
npm run lint       # ESLint + Prettier (npm run format fixes formatting)
```

A server restart interrupts a running Claude task, so use `./start.sh` for real runs.

How it works, in short: a small Node server (`ui/server`) starts `claude -p` in the repo root for
each run, so the skills, `CLAUDE.md` and MCP servers load as in the terminal. It streams Claude's
output to the page (`ui/web`, React) over a WebSocket and stores runs in `ui/data/jobhunt.db`
(gitignored, contains personal data). Each tab's model, MCP servers and approval rules are in
`ui/server/src/config.ts`.
