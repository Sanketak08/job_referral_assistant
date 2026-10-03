from jobspy import scrape_jobs
from mcp.server.fastmcp import FastMCP
import pandas as pd

mcp = FastMCP("FreeJobScraper")

# python-jobspy natively supports only these sites.
SUPPORTED_SITES = {"linkedin", "indeed", "glassdoor", "google", "zip_recruiter"}


@mcp.tool()
def scrape_free_job_boards(
    search_term: str,
    location: str,
    results_wanted: int = 20,
    country_indeed: str = "Germany",
    sites: str = "linkedin,indeed,glassdoor",
    hours_old: int = 24,
    description_chars: int = 1500,
) -> str:
    """
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
            linkedin_fetch_description=description_chars > 0,
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


if __name__ == "__main__":
    mcp.run()
