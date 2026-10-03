from typing import Optional
from pydantic import BaseModel, Field


class Location(BaseModel):
    city: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None


class Job(BaseModel):
    url: str
    title: str
    company: str
    location: Location = Field(default_factory=Location)
    description: str = ""
    requirements: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    experience_years_min: Optional[int] = None
    sponsorship_mentioned: Optional[bool] = None
    remote_type: Optional[str] = None
    posted_at_text: Optional[str] = None


class PersonCandidate(BaseModel):
    name: str
    title: str
    company: Optional[str] = None
    location: Location = Field(default_factory=Location)
    linkedin_url: Optional[str] = None
    source_url: Optional[str] = None
    source_snippet: Optional[str] = None


class RankedPerson(BaseModel):
    name: str
    title: str
    company: Optional[str] = None
    location: Location = Field(default_factory=Location)
    linkedin_url: Optional[str] = None
    source_url: Optional[str] = None
    score: float = 0
    priority: int = 0
    reason: str = ""


class EnrichedContact(BaseModel):
    name: str
    title: str
    company: Optional[str] = None
    linkedin_url: Optional[str] = None
    email: Optional[str] = None
    email_status: Optional[str] = None


class OutreachDraft(BaseModel):
    subject: str
    body: str
    linkedin_message: str
    personalization_points: list[str] = Field(default_factory=list)
