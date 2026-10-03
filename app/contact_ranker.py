from app.models import PersonCandidate, RankedPerson
from app.gemini_client import GeminiClient


class ContactRanker:
    def __init__(self, gemini: GeminiClient, referral_rules: dict):
        self.gemini = gemini
        self.referral_rules = referral_rules

    def rank(
        self,
        job,
        discovered_people: list[PersonCandidate],
        max_contacts: int,
    ) -> list[RankedPerson]:

        people_text = "\n\n".join(
            f"""
Candidate {i+1}
Name: {p.name}
Title: {p.title}
Location: {p.location.city}, {p.location.country}
LinkedIn: {p.linkedin_url}
Source: {p.source_url}
Snippet: {p.source_snippet}
"""
            for i, p in enumerate(discovered_people[:60])
        )

        prompt = f"""
You are selecting the best people to contact for a job referral.

JOB:
{job.model_dump_json(indent=2)}

REFERRAL RULES:
{self.referral_rules}

DISCOVERED PEOPLE:
{people_text}

Return the strongest contacts only.

Prioritize:
1. Hiring manager / engineering manager for the relevant team.
2. Engineering lead.
3. Technical/internal recruiter.
4. Relevant senior engineer.

Prefer people in the same city/country as the job.
Exclude obviously irrelevant roles.
Do not infer unsupported facts beyond the evidence.
Use the source snippet/title/location to justify your ranking.
"""
        # We request a list by embedding a small wrapper schema inline.
        from pydantic import BaseModel, Field

        class RankedList(BaseModel):
            contacts: list[RankedPerson] = Field(default_factory=list)

        result = self.gemini.structured("ranking", prompt, RankedList)
        return result.contacts[:max_contacts]
