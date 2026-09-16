from app.models import Job
from app.gemini_client import GeminiClient


class JobProcessor:
    def __init__(self, gemini: GeminiClient, candidate: dict, matching_rules: dict):
        self.gemini = gemini
        self.candidate = candidate
        self.matching_rules = matching_rules

    def extract_job(self, url: str, page_text: str) -> Job:
        prompt = f"""
You are extracting structured data from a job posting.

Candidate profile:
{self.candidate}

Job URL:
{url}

Job page text:
{page_text[:30000]}

Return ONLY the requested structured schema.

Rules:
- Do not invent missing details.
- Keep company/title/location precise.
- Put explicit technology requirements into skills/requirements.
- sponsorship_mentioned should be true only when sponsorship/work permit/visa support
  is explicitly indicated, false when explicitly ruled out, otherwise null.
"""
        return self.gemini.structured("extraction", prompt, Job)
