# Job Referral Assistant

An AI assistant that does the repetitive parts of a job hunt for you, every day:

1. **Finds** new job postings (published in the last 24 hours) that match your profile.
2. **Fills in** the application forms for you.
3. **Finds engineers** at the company and **writes referral emails** to them.

You stay in control. The assistant **always stops and asks for your approval** before it submits an application or sends an email.

You do not need to write or understand code to use this. You type plain English sentences to an AI tool (Claude Code), and it does the work.

---

## 1. How it works (the big picture)

Think of it as a small team of assistants, each with one job. In this project, each assistant is called a **skill**. A skill is simply a written instruction sheet that tells the AI exactly how to do one task.

| Skill | What it does | Where you step in |
|---|---|---|
| `job-search-phase` | Searches company career pages and job boards, throws away old or unsuitable jobs, scores the rest against your profile, and saves a ranked list as a spreadsheet (CSV file). | Nothing. Just open the list. |
| `job-application-phase` | Opens each job's application form in a browser and fills it in using your profile and resume. | It asks you when it doesn't know an answer. It waits for your OK before pressing Submit. |
| `job-referral-phase` | Checks whether the job offers visa/relocation, finds 5-6 engineers at the company, writes a short personal email for each, and sends it with your resume attached. | You provide business email addresses, and approve every email before it is sent. |
| `daily-pipeline` | Runs the three skills above, one after another. | The same approval steps as above. |

The AI also needs "tools" to reach the outside world (a web browser, a search engine, an email account). These tools are called **MCP servers**. They are described in section 4.

---

## 2. One-time setup

You only do this once.

### Step 1: Install the basics

- **Node.js** (free): https://nodejs.org. Several tools are started through it.
- **Python 3.10 or newer** (free): https://www.python.org. Two small tools in this project are written in Python.
- **Claude Code**: the AI tool you will talk to. Install instructions: https://docs.claude.com/en/docs/claude-code. You need a Claude account.

### Step 2: Create your profile

Your profile is a single file that holds everything about you: name, contact details, skills, the jobs you want, the countries you want to work in, and your answers to common application questions.

1. Go to the `input` folder.
2. Make a copy of `profile.example.yaml` and name the copy **`profile.yaml`**.
3. Open `profile.yaml` in any text editor (Notepad works) and fill in your details. Lines starting with `#` are explanations, not data.

The assistant **never invents information about you**. If something is missing, it will stop and ask.

### Step 3: Add your resume

Put your resume (PDF) in `input/resumes/`. Then, in `profile.yaml`, set the `resume: path:` line to the full location of that PDF.

### Step 4: Add your passwords and keys (credentials)

Some tools need an account key to work. They all go in **one file**:

> **`.claude/settings.local.json`**

To create it, copy `.claude/settings.local.example.json` and rename the copy to `settings.local.json`. Then fill in the values:

| Name in the file | What it is | Where to get it | Needed for |
|---|---|---|---|
| `GMAIL_ADDRESS` | The Gmail address emails are sent from. | Your own Gmail address. | Sending referral emails |
| `GMAIL_APP_PASSWORD` | A special 16-character password for apps (**not** your normal Gmail password). | Google Account > Security > turn on 2-Step Verification > search "App passwords" > create one. | Sending referral emails |
| `TAVILY_API_KEY` | A key for a search engine built for AI. | Free account at https://tavily.com | Finding engineers at a company |
| `APIFY_TOKEN` | A key for a web-scraping service. | Free account at https://apify.com (Settings > Integrations). | Backup way of finding jobs |
| `APOLLO_API_KEY` | A key for a contact database. | Account at https://www.apollo.io (Settings > API). | Optional. Currently not used by the referral step. |

This file is **private**. It is on the "do not upload" list (see section 6), so it will never be pushed to GitHub. Never paste these keys into any other file.

### Step 5: Set up the two Python-based tools

Two tools (`jobspy` for job boards, `gmail` for sending email) are small Python programs that live in the `.agents` folder. Open a terminal in this project folder and run these once:

```
python -m venv .venv
.venv/bin/pip install "mcp<2" python-jobspy pandas
```

(On Windows, use `.venv\Scripts\pip` instead, and in `.mcp.json` change `.venv/bin/python` to `.venv\\Scripts\\python.exe`.)

The paths in `.mcp.json` are relative to the project folder, so no other editing is needed.

### Step 6: Check that every required file is present (do this before first use)

Claude Code only works if all the files below exist. Some are **not downloaded from GitHub** because they are private (listed in `.gitignore`), so a fresh copy of the project will be missing them and you must create them yourself. A missing file usually fails quietly (for example, the Gmail tool never starts, or the skills cannot find your profile), so check this list before running anything.

**A. Private files: NOT in git, you must create or copy these yourself**

| File / folder | Why it is needed | How to create it |
|---|---|---|
| `.claude/settings.local.json` | Holds your API keys and Gmail login. Without it the `gmail`, `tavily`, `apify` and `apollo-io` tools cannot start. **Easy to forget.** | Copy `.claude/settings.local.example.json` to `.claude/settings.local.json` and fill in the values (Step 4). |
| `input/profile.yaml` | Your details. Every skill reads it. | Copy `input/profile.example.yaml` (Step 2). |
| `input/resumes/*.pdf` | The resumes attached to applications and emails. File names must match `profile.yaml` and the skills (for example `Sanket_Backend_Engineer_EU.pdf`). | Put your PDFs here (Step 3). |
| `.venv/` | The Python environment used by the `jobspy` and `gmail` tools (`.mcp.json` points to `.venv/bin/python`). | Run the commands in Step 5. |
| `output/` | Job lists and the applied/contacted logs. The skills create the files, but the folder must exist. | `mkdir -p output` if it is missing. |
| `.agents/mcp_config.json` and `.agents/credentials.json` | Only for Antigravity CLI (section 7). Not needed for Claude Code. | Skip unless you use Antigravity. |

**B. Files that ARE in git: you do not create them, but confirm they are there and unedited**

| File | What breaks if it is missing |
|---|---|
| `CLAUDE.md` | Claude does not learn the project rules (approval gates, which folders matter). |
| `.mcp.json` | None of the tools (browser, search, Gmail, job boards) are available. |
| `.claude/settings.json` | Claude asks permission for every step instead of running the workflow. |
| `.claude/skills/daily-pipeline/SKILL.md` | "run daily pipeline" does nothing useful. |
| `.claude/skills/job-search-phase/SKILL.md` and `scripts/fetch_ats.py` | Job search cannot run, or cannot read the company job boards. |
| `.claude/skills/job-application-phase/SKILL.md` | Application filling falls back to guessing and loses the safety rules. |
| `.claude/skills/job-referral-phase/SKILL.md` | Referral contacts and emails cannot be produced. |
| `.agents/gmail_mcp.py` and `.agents/jobspy_mcp.py` | The `gmail` and `jobspy` tools cannot start. |
| `input/profile.example.yaml` | You have no template to build your profile from. |

**Quick check.** From the project folder, run this. Every line should say `OK`; anything saying `MISSING` must be fixed first:

```
for f in CLAUDE.md .mcp.json .claude/settings.json .claude/settings.local.json \
  .claude/skills/daily-pipeline/SKILL.md .claude/skills/job-search-phase/SKILL.md \
  .claude/skills/job-search-phase/scripts/fetch_ats.py \
  .claude/skills/job-application-phase/SKILL.md .claude/skills/job-referral-phase/SKILL.md \
  .agents/gmail_mcp.py .agents/jobspy_mcp.py input/profile.yaml .venv/bin/python; do
  [ -e "$f" ] && echo "OK       $f" || echo "MISSING  $f"
done
ls input/resumes/*.pdf >/dev/null 2>&1 && echo "OK       input/resumes/*.pdf" || echo "MISSING  input/resumes/*.pdf"
[ -d output ] && echo "OK       output/" || echo "MISSING  output/ (run: mkdir -p output)"
```

Also open `.claude/settings.local.json` and confirm none of the five values is empty. After editing it, **restart Claude Code**; keys are only read at startup.

---

## 3. How to use it with Claude Code

1. Open a terminal (Command Prompt, PowerShell, or Terminal).
2. Go into this project's folder, for example: `cd path/to/job_referral_assistant`
3. Type `claude` and press Enter. Claude Code starts and automatically learns the project and its skills.
4. Type what you want in plain English. Examples:

| You type | What happens |
|---|---|
| `run daily pipeline` | Runs everything: search, then application, then referral. |
| `run the job search phase` | Only finds and ranks new jobs, and saves a list in `output/`. |
| `apply to the top 3 jobs from the latest list` | Fills the forms for those jobs and shows you a screenshot before submitting. |
| `find referral contacts for the Stripe job` | Finds engineers at that company and drafts the emails. |

### What to expect while it runs

- **It will ask you questions.** If an application asks for something not in your profile, it pauses and asks. Your answer can be saved in `profile.yaml` so it won't ask again.
- **It shows you a screenshot of the filled form** and waits for you to say "approve" (or "submit") before sending the application.
- **It shows you each email** and waits for your approval before sending.
- **It asks for business emails.** The assistant finds engineers' names and roles, but you supply their work email addresses. It will never guess an email address.
- **It checks visa/relocation first.** If a job says it does not sponsor visas, the assistant tells you and stops, instead of wasting your time.
- **It logs everything** into the `output` folder so it never applies to or contacts the same thing twice.

### Good to know

- The first time it runs, Claude Code may ask you to allow the tools listed in `.mcp.json`. Say yes.
- This project is set up so Claude Code does not ask permission for every small step. The safety stops (application and email approvals) are built into the skills themselves and still apply.

---

## 4. The tools the assistant uses (MCP servers)

These are listed in the file `.mcp.json`. You do not need to start them yourself; Claude Code does it.

| Tool name | Plain-English purpose | Needs credentials? |
|---|---|---|
| `playwright` | A web browser the AI can control. Used to open job pages and fill in forms. | No |
| `tavily` | A search engine. Used to find engineers at a company. | Yes: `TAVILY_API_KEY` |
| `jobspy` | Collects fresh listings from LinkedIn, Indeed, Glassdoor and Google Jobs. | No |
| `apify` | A backup web-scraping service for job boards. | Yes: `APIFY_TOKEN` |
| `apollo-io` | A database of business contacts. | Yes: `APOLLO_API_KEY` (optional) |
| `gmail` | Sends your referral emails with the resume attached. | Yes: `GMAIL_ADDRESS` and `GMAIL_APP_PASSWORD` |

If one tool fails to start (for example "connection timed out"), the assistant carries on with the others. Check that Node.js is installed and your keys are correct, then restart Claude Code.

---

## 5. Folder guide

```
job_referral_assistant/
├── input/                  Your personal information (private, not uploaded)
│   ├── profile.example.yaml    Blank template of the profile (this IS uploaded)
│   ├── profile.yaml            YOUR filled-in profile (private)
│   └── resumes/                Your resume PDFs (private)
│
├── output/                 Results created by the assistant (private, not uploaded)
│   ├── daily_jobs_<date>_<time>.csv   Each day's ranked list of jobs
│   ├── applied_jobs.csv               Every job you have applied to
│   └── contacted_people.csv           Every person you have emailed
│
├── .claude/                Setup for Claude Code
│   ├── skills/                 The instruction sheets (the "skills") - the heart of the project
│   ├── settings.json           Permissions
│   ├── settings.local.json     YOUR private keys (not uploaded)
│   └── settings.local.example.json   Blank template for the keys
│
├── .agents/                Setup for Antigravity CLI (the alternative to Claude Code, see below)
│                           Also holds the two small Python tools used by both
├── .mcp.json               The list of tools (MCP servers) the AI can use
├── scratch/                Temporary working files. Safe to ignore or delete.
├── CLAUDE.md               Short rules that Claude Code reads automatically
└── README.md               This guide
```

Notes:

- **`input/`** is where you put things the assistant needs to read. **`output/`** is where it writes its results. You can open the `.csv` files in Excel or Google Sheets.
- The folders `app/`, `data/` and `config.yaml` belong to an older version of this project and are no longer used.
- Folders starting with a dot (like `.claude`) are hidden on some computers. In File Explorer, enable "Show hidden files".

---

## 6. What is and is not uploaded to GitHub

Personal and secret information stays on your computer only.

| Uploaded | Not uploaded (private) |
|---|---|
| The skills, README, and tool setup | `input/profile.yaml` (your real profile) |
| `input/profile.example.yaml` (blank template) | Your resumes in `input/resumes/` |
| Empty `input/` and `output/` folders | Everything inside `output/` (job lists, applied/contacted logs) |
| `.claude/settings.local.example.json` | `.claude/settings.local.json` (your keys) |

Anyone who downloads the project from GitHub starts from the blank templates and fills in their own details.

---

## 7. Using Antigravity CLI instead of Claude Code

If you cannot use Claude Code (for example, no account or you ran out of usage), you can use **Antigravity CLI** with the same skills.

The **`.agents`** folder is the Antigravity version of the setup:

| In `.agents/` | What it is |
|---|---|
| `skills/` | The same four skills, in the layout Antigravity expects. |
| `mcp_config.json` | The tool list for Antigravity (same tools as `.mcp.json`). |
| `gmail_mcp.py`, `jobspy_mcp.py` | The two small Python tools (shared with Claude Code). |

To set it up:

1. Install Antigravity CLI by following Google's official instructions, and sign in.
2. Complete the **One-time setup** in section 2 above (profile, resume, Python tools).
3. Open `.agents/mcp_config.json` and paste your keys into the matching `env` lines (Antigravity does not read `settings.local.json`). Check that the script paths there point to this project folder. This file is on the "do not upload" list, so your keys stay private.
4. Open a terminal in the project folder, start Antigravity CLI, and give it the same plain-English commands, such as `run daily pipeline`.

Keep in mind: the main, up-to-date copy of the skills is in **`.claude/skills/`**. The copy in `.agents/skills/` is older. If you change a skill, change it in `.claude/skills/` and copy the file across to `.agents/skills/` so both stay the same.

---

## 8. Troubleshooting

| Problem | What to try |
|---|---|
| A tool says "connection timed out" | Make sure Node.js is installed, check your internet, restart Claude Code. |
| Emails fail to send | Re-check `GMAIL_APP_PASSWORD`. It must be an *App password*, not your normal password, and 2-Step Verification must be on. |
| No jobs found | Check that your countries are set to `enabled: true` and your job titles are filled in `profile.yaml`. |
| The assistant keeps asking the same question | Add the answer to the `application_answers` section of `profile.yaml`. |
| Job-board tool (`jobspy`) fails | Re-run the `pip install` line in Step 5 and check the folder path in `.mcp.json`. |

---

## 9. Safety rules built into the project

- It never invents facts about you.
- It never submits an application without your approval.
- It never sends an email without your approval.
- It never guesses someone's email address.
- Your keys and personal files are never uploaded.
