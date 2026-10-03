---
name: job-application-phase
description: Automates ATS form filling using Playwright, strictly handling mandatory vs. optional fields.
---
# Job Application Phase

## Steps
1. **Load Queue**: Read target URLs from the newly generated `daily_jobs_[DATE]_[TIME].csv`.
2. **Resolve the Application Link, then open it**:
   - **LinkedIn / Indeed / other aggregator links:** do NOT log in and do not ask the user to log in. Find the company's own application page instead: take the job title, company and location from the CSV row, check the company's ATS API when known (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Workable; tokens are in `profile.yaml` under `job_search.discovery`), then fall back to searching the company's careers site (WebSearch / Tavily). Confirm the match by title and location, and check the posting is still open. If no direct application page can be found without a login, skip that job and tell the user why.
   - **Direct ATS links:** use them as they are.
   - Open the final application form with Playwright MCP (`browser_navigate`). Only pause for the user if the company's own site itself requires an account (e.g. Workday) or shows a CAPTCHA.
3. **Smart Data Mapping**: Use `browser_fill_form` to inject data sourced from `D:\Sanket\job_referral_assistant\input\profile.yaml`.
   - Check `candidate.application_answers` in `profile.yaml` first (salary, notice period, work authorization, diversity answers, language levels, etc.) before treating a question as unknown.
   - **Mandatory Fields:** Must be filled. If a mandatory field cannot be explicitly answered by `profile.yaml`, pause execution and prompt the user.
   - **Optional Fields:** If the answer exists in `profile.yaml`, fill it. If the answer is unknown or missing, leave it blank and proceed. Do not pause execution for unknown optional fields.
4. **Resume Upload**: Use `browser_file_upload` to attach `D:\Sanket\job_referral_assistant\input\resumes\Sanket_Backend_Engineer_EU.pdf`.
5. **Review Gate**: Capture a screenshot (`browser_take_screenshot`), present it to the user, and wait for the "Approve" command.
6. **Finalize & Log**: 
   - Click submit via Playwright. Append the Job URL to `applied_jobs.csv`; when the application was done on the company's own page, log both the original CSV link (LinkedIn) and the company application URL so the job is not picked up again.
   - The CSV must strictly contain these columns: `Company, Job Title, Job Link, Timestamp`