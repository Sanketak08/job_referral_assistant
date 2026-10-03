---
name: daily-pipeline
description: Orchestrates the zero-touch daily job hunt pipeline. Use when the user requests to run the daily job hunt.
---

# Daily Pipeline Orchestrator

Executes the three core job hunt phases sequentially.

## When to Use

- The user prompts to "run daily pipeline", "run job hunt", or process daily jobs.

## Steps

1. **Source of Truth Check**: Verify access to `D:\Sanket\job_referral_assistant\input\profile.yaml' (or `config.yaml`[cite: 1]) and the `resumes/` folder.
2. **Phase 1**: Trigger the `job-search-phase` skill to discover and score jobs into `D:\Sanket\job_referral_assistant\output\daily_jobs.csv`.
3. **Phase 2**: Trigger the `job-application-phase` skill to apply to the top jobs from `daily_jobs.csv` using Playwright.
4. **Phase 3**: Trigger the `job-referral-phase` skill to find contacts via Apollo MCP and send outreach.
5. **Completion**: Stop execution. Do not output conversational summaries; print only "Pipeline Complete." to save tokens.
