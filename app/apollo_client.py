import logging

import requests

from app.models import RankedPerson, EnrichedContact


class ApolloClient:
    BASE_URL = "https://api.apollo.io/api/v1"

    def __init__(self, api_key: str, reveal_personal_emails: bool = False):
        self.api_key = api_key
        self.reveal_personal_emails = reveal_personal_emails

    def _headers(self):
        return {
            "accept": "application/json",
            "content-type": "application/json",
            "Cache-Control": "no-cache",
            "x-api-key": self.api_key,
        }

    def enrich_person(self, person: RankedPerson) -> EnrichedContact:
        """
        Apollo People Enrichment.
        We identify by name + company domain when possible.

        We intentionally do not request personal email/phone data.
        """

        first_last = person.name.strip().split()
        first_name = first_last[0] if first_last else ""
        last_name = " ".join(first_last[1:]) if len(first_last) > 1 else ""

        # Company domain is preferable, but the job page/domain extraction
        # can be added later. For now, name is sent and the caller can add
        # domain when it knows it.
        params = {
            "first_name": first_name,
            "last_name": last_name,
            "reveal_personal_emails": str(self.reveal_personal_emails).lower(),
            "reveal_phone_number": "false",
        }

        response = requests.post(
            f"{self.BASE_URL}/people/match",
            params=params,
            headers=self._headers(),
            timeout=20,
        )
        try:
            response.raise_for_status()
        except requests.HTTPError as exc:
            status = response.status_code
            if status in {401, 403}:
                logging.warning(
                    "Apollo enrichment was rejected with HTTP %s. "
                    "Check whether your Apollo API key has People Match "
                    "enrichment access.",
                    status,
                )
            raise exc
        data = response.json()

        apollo_person = data.get("person") or {}
        return EnrichedContact(
            name=apollo_person.get("name") or person.name,
            title=apollo_person.get("title") or person.title,
            company=(apollo_person.get("organization") or {}).get("name") or person.company,
            linkedin_url=apollo_person.get("linkedin_url") or person.linkedin_url,
            email=apollo_person.get("email"),
            email_status=apollo_person.get("email_status"),
        )

    @staticmethod
    def fallback_contact(person: RankedPerson) -> EnrichedContact:
        return EnrichedContact(
            name=person.name,
            title=person.title,
            company=person.company,
            linkedin_url=person.linkedin_url,
            email=None,
            email_status="apollo_not_enriched",
        )
