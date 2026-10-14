---
name: job-referral-phase
description: Discovers a guaranteed 5-6 contacts per company, handles manual email enrichment, drafts outreach, and sends via Gmail with a physical PDF attachment.
---
# Job Referral Phase

## Steps
1. **Guaranteed Contact Discovery**: For each company in the daily jobs CSV, use the Tavily MCP to find exactly 5 to 6 contacts.
   - **Hierarchy Rule:** First search for "Principal Engineer", "Staff Software Engineer", and "Senior Software Engineer". 
   - **Fallback Rule:** If fewer than 5 senior contacts are found, you MUST step down and search for mid-level or junior "Software Engineers" until you reach a minimum of 5 contacts. 
   - **Exclusions:** Never include Managers, Directors, or Recruiters.
2. **Manual Email Handoff**: 
   - Output the list of 5-6 discovered names, titles, and their LinkedIn URLs.
   - Pause execution and prompt the user: *"Please provide the business emails for these [X] contacts."*
   - Wait for the user to paste the emails.
3. **Strict Human Drafting**: 
   - Draft a highly professional outreach message for each contact.
   - Bridge the job requirements to the local `profile.yaml` backend experience.
   - **Constraints:** Strictly avoid AI-like vocabulary ("delve", "testament to"), em dashes, and generic openings ("Hope you're doing well"). 
   - **Signature:** Append the exact `email_signature` block defined in `profile.yaml` to the bottom of every draft.
4. **Review & Dispatch**: 
   - Present the drafted emails to the user for final approval.
   - Upon approval, call the Gmail MCP tool to dispatch the emails. 
   - **Attachment Rule:** You must use the attachment parameter in the Gmail MCP to encode and attach the physical file located at `input/resumes/`. Do not insert a Google Drive link.
5. **Log**: Append the contacted email addresses, company, and timestamps to `output/contacted_people.csv`.