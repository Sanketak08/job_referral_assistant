from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup


class JobFetcher:
    def __init__(self, timeout: int = 20):
        self.timeout = timeout

    def fetch(self, url: str) -> str:
        url = self.clean_url(url)
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 Chrome/151.0 Safari/537.36"
            ),
            "Accept": (
                "text/html,application/xhtml+xml,application/xml;q=0.9,"
                "image/avif,image/webp,*/*;q=0.8"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        }

        response = requests.get(
            url,
            headers=headers,
            timeout=self.timeout,
            allow_redirects=True,
        )
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "lxml")

        for tag in soup(["script", "style", "noscript", "svg"]):
            tag.decompose()

        title = soup.title.get_text(" ", strip=True) if soup.title else ""
        body = soup.get_text("\n", strip=True)

        host = urlparse(response.url).netloc
        return f"HOST: {host}\nPAGE TITLE: {title}\n\n{body}"

    @staticmethod
    def clean_url(url: str) -> str:
        return url.strip().replace("\\", "")
