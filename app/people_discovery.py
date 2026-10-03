import requests

from app.models import PersonCandidate


class PeopleDiscovery:
    """
    Provider-neutral public web search adapter.

    Expected generic provider response:

    {
      "results": [
        {
          "title": "...",
          "url": "...",
          "snippet": "..."
        }
      ]
    }

    This keeps search-provider details outside the core pipeline.
    """

    def __init__(
        self,
        endpoint: str | None,
        api_key: str | None,
        provider: str = "generic_http",
        auth_header: str = "Authorization",
        timeout: int = 20,
    ):
        self.endpoint = endpoint
        self.api_key = api_key
        self.provider = provider
        self.auth_header = auth_header
        self.timeout = timeout

    def _headers(self):
        if not self.api_key:
            return {}
        if self.auth_header.lower() == "authorization":
            return {self.auth_header: f"Bearer {self.api_key}"}
        return {self.auth_header: self.api_key}

    def search(self, query: str, max_results: int = 10) -> list[dict]:
        if not self.endpoint:
            raise RuntimeError(
                "SEARCH_API_URL is not configured. "
                "Add a permitted public-search provider in .env."
            )
        if self.provider == "tavily" and not self.api_key:
            raise RuntimeError(
                "SEARCH_API_KEY is not configured. "
                "Add your Tavily API key in .env."
            )

        if self.provider == "tavily":
            response = requests.post(
                self.endpoint,
                json={
                    "query": query,
                    "search_depth": "basic",
                    "max_results": max_results,
                    "include_answer": False,
                    "include_raw_content": False,
                    "include_images": False,
                },
                headers={
                    **self._headers(),
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                timeout=self.timeout,
            )
        else:
            response = requests.get(
                self.endpoint,
                params={
                    "q": query,
                    "num": max_results,
                },
                headers={
                    **self._headers(),
                    "Accept": "application/json",
                },
                timeout=self.timeout,
            )
        response.raise_for_status()

        data = response.json()
        results = data.get("results", [])

        normalized = []
        for item in results:
            normalized.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "snippet": item.get(
                    "snippet",
                    item.get("description", item.get("content", "")),
                ),
            })
        return normalized

    def discover(
        self,
        queries: list[str],
        max_results_per_query: int,
    ) -> list[PersonCandidate]:

        seen = set()
        people = []

        for query in queries:
            for result in self.search(query, max_results_per_query):
                key = (result["title"], result["url"])
                if key in seen:
                    continue
                seen.add(key)

                # Candidate extraction is deliberately conservative.
                # Gemini does the actual person-role interpretation later.
                people.append(
                    PersonCandidate(
                        name=result["title"][:120],
                        title="",
                        source_url=result["url"],
                        source_snippet=result["snippet"][:1000],
                    )
                )

        return people
