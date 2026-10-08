# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

An agent-driven daily job-hunt workflow run entirely through Claude Code skills and MCP servers (no Python entry point). Ask Claude to "run daily pipeline" and it executes the skills below. The old Python pipeline in `app/` (Gemini/Apollo/Gmail API) is legacy and not used.

## Layout

- `.claude/skills/` — the workflow (source of truth). `.agents/skills/` is an older copy; edit `.claude/skills/`.
- `.claude/settings.json` — shared permissions (everything allowed, `bypassPermissions`). `.claude/settings.local.json` — gitignored, holds the MCP secrets as `env` values.
- `.mcp.json` — MCP servers: `playwright`, `apify`, `apollo-io`, `tavily`, `gmail`. Secrets are `${VAR}` references filled from `settings.local.json`.
- `.agents/gmail_mcp.py` — custom Gmail SMTP MCP server (tool `send_email_with_attachment(to_email, subject, body, attachment_path)`, uses `GMAIL_ADDRESS` / `GMAIL_APP_PASSWORD`). Needs the `mcp` Python package.
- `input/profile.yaml` — candidate source of truth (titles, exclusions, tech stack, answers to form fields, `email_signature`). `input/resumes/` holds the PDFs (`Sanket_Backend_Engineer_EU.pdf`, `Sanket_Data_Engineer_EU.pdf`, `Sanket_Agentic_AI_Engineer_EU.pdf`).
- `output/` — `daily_jobs_[DATE]_[TIME].csv`, `applied_jobs.csv` (`Company, Job Title, Job Link, Timestamp`), `contacted_people.csv`.
- `scratch/` — one-off Playwright scripts; root PNGs and `hyra_job.html` are throwaway artifacts.

## Skills (run in order by `daily-pipeline`)

1. `job-search-phase` — Tier 1: public ATS JSON APIs (Greenhouse/Lever/Workday); Tier 2: Apify (LinkedIn/Indeed/Xing). Hard-discard jobs older than 24h, dedupe against `applied_jobs.csv`, score against the profile, write `daily_jobs_[DATE]_[TIME].csv` (`Job Title, Company, Date Posted, Match Score, Ranking, Source, Job Link`). Output only the file path.
2. `job-application-phase` — Playwright MCP fills each ATS form from `profile.yaml`. Mandatory field unknown → pause and ask; optional unknown → leave blank. Upload the resume, screenshot, **wait for explicit approval before submit**, then log to `applied_jobs.csv`.
3. `job-referral-phase` — Tavily finds 5–6 engineers per company (Principal/Staff/Senior first, step down to mid/junior; never managers, directors or recruiters). Pause for the user to supply business emails (Apollo is not used for this step in the skill text). Draft plain human emails (no "delve", no em dashes, no generic openings, append `email_signature`), get approval, send via Gmail MCP with the PDF attached (never a Drive link), log to `contacted_people.csv`.

`daily-pipeline` ends with only "Pipeline Complete." (no summaries).

## Rules that apply everywhere

- Never invent profile data; ask when a mandatory answer is missing.
- Even though permissions are fully open, keep the human gates: approval before submitting an application and before sending any email.
- Never commit secrets; `.agents/mcp_config.json` contains hardcoded keys and is now gitignored.
