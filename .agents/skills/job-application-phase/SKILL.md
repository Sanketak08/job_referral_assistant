---
name: job-application-phase
description: Automates ATS form filling using Playwright, strictly handling mandatory vs. optional fields.
---
# Job Application Phase

## Steps
1. **Load Queue**: Read target URLs from the newly generated `daily_jobs_[DATE]_[TIME].csv`.
2. **Playwright Execution**: Use Playwright MCP (`browser_navigate`) to open each ATS form.
3. **Smart Data Mapping**: Use `browser_fill_form` to inject data sourced from `D:\Sanket\job_referral_assistant\input\profile.yaml`.
   - **Mandatory Fields:** Must be filled. If a mandatory field cannot be explicitly answered by `profile.yaml`, pause execution and prompt the user.
   - **Optional Fields:** If the answer exists in `profile.yaml`, fill it. If the answer is unknown or missing, leave it blank and proceed. Do not pause execution for unknown optional fields.
4. **Resume Upload**: Use `browser_file_upload` to attach `D:\Sanket\job_referral_assistant\input\resumes\Sanket_Backend_Engineer_EU.pdf`.
5. **Review Gate**: Capture a screenshot (`browser_take_screenshot`), present it to the user, and wait for the "Approve" command.
6. **Finalize & Log**: 
   - Click submit via Playwright. Append the Job URL to `applied_jobs.csv`.
   - The CSV must strictly contain these columns: `Company, Job Title, Job Link, Timestamp`