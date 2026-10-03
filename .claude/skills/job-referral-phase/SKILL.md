---
name: job-referral-phase
description: Checks the job posting for visa/relocation restrictions first, then finds 5-6 engineer contacts, drafts short clean referral messages (email and LinkedIn) from the profile template, and sends emails via Gmail with the resume attached.
---
# Job Referral Phase

All wording, signatures and patterns come from `D:\Sanket\job_referral_assistant\input\profile.yaml` (`outreach`, `candidate`, `skills`, `locations`, `work_authorization`). Do not hardcode them here.

## Steps
0. **Sponsorship / Relocation Check (run first, before any contact search)**:
   - Fetch the full text of the job posting for the target job (its job link or the company's own posting page). Read the whole page source, not just the visible text: the job description is often inside embedded JSON (JSON-LD `description`, `__NEXT_DATA__`, etc.) and must be included. Strip HTML tags and decode entities, then check. If the page cannot be read, say so and ask the user before continuing.
   - Split the text into sentences. For each sentence, test `outreach.sponsorship_check.no_patterns` and `yes_patterns`. A sentence that matches a no pattern counts as **no**, even if it also matches a yes pattern (e.g. "relocation support is not provided").
   - Classify the job:
     - **explicit_no**: at least one sentence says visa, work permit, sponsorship or relocation is not offered, or that the candidate must already have the right to work there. **Stop here.** Tell the user clearly, quote the exact sentence, and do not search for contacts or draft anything unless the user explicitly says to continue anyway.
     - **explicit_yes**: the posting offers visa or relocation support. Continue.
     - **not_mentioned**: the posting says nothing about visa or relocation. Continue directly to referral outreach, no extra confirmation needed.
     - **conflicting**: different sentences disagree. Stop, quote both, and ask the user.
   - State the result in one line before moving on, for example: `Sponsorship check: not mentioned. Continuing.`
1. **Guaranteed Contact Discovery**: For the company, use the Tavily MCP to find exactly 5 to 6 contacts working there in the job's country/city.
   - **Hierarchy Rule:** First search for "Principal Engineer", "Staff Software Engineer", and "Senior Software Engineer".
   - **Fallback Rule:** If fewer than 5 senior contacts are found, step down and search for mid-level or junior "Software Engineers" until you reach a minimum of 5 contacts.
   - **Exclusions:** Never include Managers, Directors, Recruiters, HR or anyone from `people_discovery.exclude_titles`.
   - Only include people whose public profile shows them at that company now.
2. **Manual Email Handoff**:
   - Output the list of 5-6 contacts: name, title, LinkedIn URL.
   - Pause and prompt the user: *"Please provide the business emails for these [X] contacts."*
   - Wait for the user to paste the emails. Never guess an email address. If the user supplies pattern-looking addresses, send them but remind the user that unverified addresses may bounce.
3. **Draft Messages (clean, smooth, short)**:
   - Use `outreach.message_template` for every contact, for both email and LinkedIn. Fill `{first_name}`, `{job_title}`, `{company}`, `{city}`, `{years}` (from the profile), `{experience_summary}` (one phrase matched to the job's main tech, drawn from the profile, e.g. "building event-driven backend pipelines with Java, Spring Boot and Kafka"), `{contact_title}` (the title shown on their public profile) and `{job_url}`.
   - Do not add extra paragraphs. Keep each message under 80 words before the signature.
   - **Personalization rule:** use only the contact's job title and company, and facts from the job posting. **Never** mention talks, posts, articles, podcasts, projects or anything the user could not have personally seen (no "I saw your talk", "I read about your work"). If unsure, leave it out. Nothing in `outreach.avoid_phrases` may appear.
   - **Constraints:** no em dashes, no AI-sounding words ("delve", "testament to"), no generic openings ("Hope you're doing well"), no flattery.
   - **Relocation line:** keep "I am ready to relocate to {city}" (the profile says the user is willing to relocate).
   - **Email:** subject from `outreach.email_subject_template`; end with the exact `outreach.email_signature` block.
   - **LinkedIn:** same body; end with the exact `outreach.linkedin_signature` block (`Best,` then `Sanket`). LinkedIn is draft-only; the user sends it manually.
4. **Review & Dispatch**:
   - Present the drafted emails and LinkedIn messages to the user for approval. Show the shared body once with the per-person differences (first name and contact title) so the review stays short.
   - Upon approval, call the Gmail MCP tool to send each email.
   - **Attachment Rule:** use the attachment parameter to attach the physical resume from `D:\Sanket\job_referral_assistant\input\resumes\` (default `Sanket_Backend_Engineer_EU.pdf`). Do not insert a Google Drive link.
5. **Log**: Append the contacted email addresses, company and timestamps to `D:\Sanket\job_referral_assistant\output\contacted_people.csv` (columns `email,company,timestamp`).
