import json

import anyio
from jobspy import scrape_jobs
from mcp.server.fastmcp import FastMCP
import pandas as pd

import jobspy_search

mcp = FastMCP("FreeJobScraper")

# python-jobspy natively supports only these sites.
SUPPORTED_SITES = {"linkedin", "indeed", "glassdoor", "google", "zip_recruiter"}


@mcp.tool()
def scrape_free_job_boards(
    search_term: str,
    location: str,
    results_wanted: int = 20,
    country_indeed: str = "Germany",
    sites: str = "linkedin",
    hours_old: int = 24,
    description_chars: int = 1500,
) -> str:
    """
    Single raw search (no filtering). For the daily Tier 4 run use search_and_filter instead.
    Scrapes job boards for free via python-jobspy and returns a JSON string of jobs.
    sites: comma-separated subset of linkedin,indeed,glassdoor,google,zip_recruiter.
    country_indeed: country name used by Indeed/Glassdoor (e.g. Germany, Netherlands, Poland).
    description_chars: how much of each description to return (used to detect required experience); 0 = none.
    """
    try:
        site_list = [s.strip().lower() for s in sites.split(",") if s.strip() in SUPPORTED_SITES]
        if not site_list:
            return f"Error: no supported sites in '{sites}'. Supported: {sorted(SUPPORTED_SITES)}"

        jobs: pd.DataFrame = scrape_jobs(
            site_name=site_list,
            search_term=search_term,
            google_search_term=f"{search_term} jobs near {location} since yesterday",
            location=location,
            results_wanted=results_wanted,
            hours_old=hours_old,
            country_indeed=country_indeed,
            description_format="markdown",
            fetch_description=description_chars > 0,
        )

        if jobs.empty:
            return "No jobs found for this query in the requested time window."

        cols = [c for c in ["title", "company", "location", "job_url", "date_posted", "site", "description"] if c in jobs.columns]
        out = jobs[cols].copy()
        if "description" in out.columns:
            if description_chars > 0:
                out["description"] = out["description"].fillna("").astype(str).str.slice(0, description_chars)
            else:
                out = out.drop(columns=["description"])
        return out.to_json(orient="records", date_format="iso")

    except Exception as e:
        return f"Error scraping jobs: {str(e)}"


@mcp.tool()
async def search_and_filter(max_minutes: int = 0, excerpt_chars: int = 500) -> str:
    """
    Full Tier 4 run in one call: every query group x location from input/profile.yaml
    (job_search.discovery.jobspy_mcp) on the sites listed there (LinkedIn), with 429 back-off, a call cap and a
    runtime budget. Applies freshness, title, location, remote, applied-jobs, duplicate,
    experience, language and sponsorship rules in code, and returns only the survivors.
    Scoring against matching.minimum_score is left to the caller; each job carries
    skill_hits, must_have_missing, required_years and sponsorship to score from.
    max_minutes: runtime budget override (0 = profile's max_runtime_minutes).
    excerpt_chars: description excerpt per job; full descriptions are in summary.results_file.
    Progress is written to output/jobspy_last_run.log while it runs.
    """
    try:
        summary, kept, limit = await anyio.to_thread.run_sync(lambda: jobspy_search.run(max_minutes or None))
    except Exception as e:
        return f"Error in search_and_filter: {type(e).__name__}: {e}"
    jobs = [jobspy_search.compact(j, excerpt_chars) for j in kept[:limit]]
    if len(kept) > limit:
        summary["notes"].append(f"returned the top {limit} of {len(kept)} kept jobs by skill hits; the rest are in results_file")
    return json.dumps({"summary": summary, "jobs": jobs}, ensure_ascii=False, default=str)


if __name__ == "__main__":
    mcp.run()
