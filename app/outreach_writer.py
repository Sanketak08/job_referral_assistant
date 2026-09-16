from app.models import OutreachDraft
from app.gemini_client import GeminiClient


class OutreachWriter:
    def __init__(self, gemini: GeminiClient, outreach_rules: dict):
        self.gemini = gemini
        self.rules = outreach_rules

    def draft(self, candidate: dict, job, contact) -> OutreachDraft:
        prompt = f"""
You write a concise, natural referral email and LinkedIn message.

CANDIDATE:
{candidate}

JOB:
{job.model_dump_json(indent=2)}

CONTACT:
{contact.model_dump_json(indent=2)}

OUTREACH RULES:
{self.rules}

Requirements:
- Do not invent a relationship between candidate and contact.
- Do not claim the contact works on the exact team unless supported.
- Reference the exact job title/company.
- Mention only genuinely relevant candidate skills.
- Make a direct but polite referral request.
- Keep email under the configured word limit.
- Keep LinkedIn message concise.
- Avoid generic corporate fluff.
- Never say "I hope you're doing well".
- Return only the requested structured fields.
"""
        return self.gemini.structured("writing", prompt, OutreachDraft)
