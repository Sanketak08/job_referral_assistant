import os
import sys
import logging
import requests

from app.config import Config
from app.gemini_client import GeminiClient
from app.job_fetcher import JobFetcher
from app.job_processor import JobProcessor
from app.people_discovery import PeopleDiscovery
from app.contact_ranker import ContactRanker
from app.apollo_client import ApolloClient
from app.outreach_writer import OutreachWriter
from app.gmail_client import GmailClient
from app.history import append_run


def build_search_queries(config: Config, job) -> list[str]:
    templates = config.section(
        "people_search", "preferred_queries", default=[]
    )

    company = job.company
    city = job.location.city or ""
    country = job.location.country or ""

    preferred = config.section(
        "referral", "preferred_roles", default=[
            "Engineering Manager",
            "Hiring Manager",
            "Technical Recruiter",
        ]
    )

    queries = []
    for template in templates:
        q = template.format(
            company=company,
            city=city,
            country=country,
            title=job.title,
        )
        queries.append(q)

    # Add role-specific searches dynamically.
    for role in preferred[:4]:
        queries.append(
            f'"{company}" "{role}" "{city or country}"'
        )

    # Preserve order and deduplicate.
    seen = set()
    result = []
    max_queries = config.section(
        "people_search", "max_queries", default=8
    )
    for q in queries:
        if q not in seen:
            seen.add(q)
            result.append(q)
        if len(result) >= max_queries:
            break
    return result


def build_people_discovery(config: Config) -> PeopleDiscovery:
    search_endpoint = os.getenv(
        config.section(
            "people_search", "endpoint_env", default="SEARCH_API_URL"
        )
    )
    search_key = os.getenv(
        config.section(
            "people_search", "api_key_env", default="SEARCH_API_KEY"
        )
    )
    auth_header = os.getenv(
        config.section(
            "people_search",
            "auth_header_env",
            default="SEARCH_API_AUTH_HEADER",
        ),
        "Authorization",
    )

    return PeopleDiscovery(
        endpoint=search_endpoint,
        api_key=search_key,
        provider=config.section(
            "people_search", "provider", default="generic_http"
        ),
        auth_header=auth_header,
    )


def fetch_job_with_fallback(
    job_url: str,
    discovery: PeopleDiscovery,
) -> str:
    try:
        return JobFetcher().fetch(job_url)
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status != 403:
            raise

        logging.warning(
            "Job page returned 403; falling back to search snippets."
        )
        results = discovery.search(job_url, max_results=5)
        if not results:
            raise RuntimeError(
                "Job page returned 403 and search fallback found no results."
            ) from exc

        snippets = []
        for result in results:
            snippets.append(
                "\n".join([
                    f"TITLE: {result['title']}",
                    f"URL: {result['url']}",
                    f"SNIPPET: {result['snippet']}",
                ])
            )

        return (
            "The original job page returned HTTP 403, so this text was "
            "assembled from public search results.\n\n"
            + "\n\n".join(snippets)
        )


def main(job_url: str):
    logging.basicConfig(level=logging.INFO)

    config = Config("profile.yaml")

    candidate = config.section("candidate", default={})
    matching = config.section("matching", default={})
    gemini_cfg = config.section("gemini", default={})

    gemini = GeminiClient(
        api_key=config.env(gemini_cfg["api_key_env"]),
        models=gemini_cfg["models"],
        temperatures=gemini_cfg.get("temperature", {}),
    )

    discovery = build_people_discovery(config)

    # 1. Fetch job
    logging.info("Fetching job: %s", job_url)
    page_text = fetch_job_with_fallback(job_url, discovery)

    # 2. Understand job
    job = JobProcessor(
        gemini=gemini,
        candidate=candidate,
        matching_rules=matching,
    ).extract_job(job_url, page_text)

    print("\n=== JOB ===")
    print(job.model_dump_json(indent=2))

    # 3. Discover people
    queries = build_search_queries(config, job)
    logging.info("Search queries: %s", queries)

    discovered = discovery.discover(
        queries=queries,
        max_results_per_query=config.section(
            "people_search", "max_results_per_query", default=10
        ),
    )

    # 4. Rank people
    ranked = ContactRanker(
        gemini=gemini,
        referral_rules=config.section("referral", default={}),
    ).rank(
        job,
        discovered,
        max_contacts=config.section(
            "referral", "max_contacts_to_return", default=3
        ),
    )

    print("\n=== RANKED CONTACTS ===")
    for i, person in enumerate(ranked, start=1):
        print(
            f"{i}. {person.name} | {person.title} | "
            f"{person.score:.1f} | {person.reason}"
        )

    # 5. Apollo enrichment
    apollo_cfg = config.section("apollo", default={})
    enrich_top_n = apollo_cfg.get("enrich_top_n", 3)
    enriched = []
    if apollo_cfg.get("enabled", True):
        apollo = ApolloClient(
            api_key=config.env(apollo_cfg["api_key_env"]),
            reveal_personal_emails=apollo_cfg.get(
                "reveal_personal_emails", False
            ),
        )

        for person in ranked[:enrich_top_n]:
            try:
                contact = apollo.enrich_person(person)
            except requests.HTTPError as exc:
                status = (
                    exc.response.status_code
                    if exc.response is not None
                    else None
                )
                if status not in {401, 403}:
                    raise
                contact = ApolloClient.fallback_contact(person)
            enriched.append(contact)
    else:
        logging.info(
            "Apollo enrichment is disabled; drafting without business emails."
        )
        for person in ranked[:enrich_top_n]:
            contact = ApolloClient.fallback_contact(person)
            enriched.append(contact)

    print("\n=== ENRICHED CONTACTS ===")
    for c in enriched:
        print(
            f"{c.name} | {c.title} | {c.email or 'NO BUSINESS EMAIL'} | "
            f"{c.email_status or 'unknown'}"
        )

    # 6. Draft + optionally send
    writer = OutreachWriter(
        gemini=gemini,
        outreach_rules=config.section("outreach", default={}),
    )

    email_cfg = config.section("email", default={})
    system_cfg = config.section("system", default={})

    send_enabled = (
        email_cfg.get("auto_send", False)
        and not system_cfg.get("dry_run", True)
    )

    gmail = None
    if send_enabled:
        gmail = GmailClient()

    history_path = system_cfg.get(
        "output", {}
    ).get("history_path", "./data/run_history.jsonl")

    run_record = {
        "job": job.model_dump(),
        "contacts": [],
    }

    for contact in enriched:
        draft = writer.draft(candidate, job, contact)

        print("\n=== EMAIL DRAFT ===")
        print(f"TO: {contact.email or 'NO BUSINESS EMAIL FOUND'}")
        print(f"SUBJECT: {draft.subject}")
        print(draft.body)

        print("\n=== LINKEDIN DRAFT ===")
        print(draft.linkedin_message)

        entry = {
            "contact": contact.model_dump(),
            "subject": draft.subject,
            "body": draft.body,
            "linkedin_message": draft.linkedin_message,
            "status": "drafted",
        }

        if send_enabled and gmail and contact.email:
            message_id = gmail.send(
                to=contact.email,
                subject=draft.subject,
                body=draft.body,
            )
            entry["status"] = "sent"
            entry["gmail_message_id"] = message_id
            print(f"\nSent via Gmail. Message ID: {message_id}")
        elif send_enabled:
            entry["status"] = "not_sent_no_email"
            print("\nNo business email found; email not sent.")
        else:
            print("\nDRY RUN — no email sent.")

        run_record["contacts"].append(entry)

        # V1 safety: auto-send to one valid contact only.
        if entry["status"] == "sent":
            break

    if system_cfg.get("output", {}).get("save_run_history", True):
        append_run(history_path, run_record)

    print("\nDone.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m app.main <job_url>")
        raise SystemExit(2)

    main(sys.argv[1])
