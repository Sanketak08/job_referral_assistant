# Job Referral Assistant — V1

Flow:

1. Input a public job URL.
2. Fetch the job page.
3. Use Gemini to extract structured job data.
4. Build public-web search queries for relevant people.
5. Use a configurable search provider to discover candidate contacts.
6. Use Gemini to rank those people.
7. Use Apollo only to enrich the selected people with business email.
8. Use Gemini to draft a referral email + LinkedIn message.
9. In dry-run mode, show the draft. In send mode, send via Gmail API.
10. Persist a small audit record locally.

## Important design choices

- Apollo is used ONLY for business-email enrichment.
- Gemini is used for extraction, ranking, and writing.
- Person discovery is separate from Apollo.
- Gmail uses OAuth/API, not browser automation.
- `dry_run: true` is the default.
- API keys/tokens live in `.env`, not `config.yaml`.
- LinkedIn is draft-only in V1; actual sending remains manual.

## Setup

### 1. Create a virtual environment

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure environment variables

Copy:

```bash
cp .env.example .env
```

Fill in:

- `GEMINI_API_KEY`
- `APOLLO_API_KEY`
- `SEARCH_API_URL`
- `SEARCH_API_KEY` (if your search provider needs one)
- `SEARCH_API_AUTH_HEADER`

### 3. Configure `config.yaml`

At minimum, update:

- candidate profile
- resume path
- target roles
- countries/cities
- referral preferences
- outreach preferences

### 4. Gmail OAuth

Create a Google Cloud OAuth Desktop App credential and save the downloaded JSON as:

```text
data/gmail_credentials.json
```

On the first run with `email.auto_send: true`, the script will open a browser for consent and create:

```text
data/gmail_token.json
```

The Gmail API is used with the `gmail.send` scope.

### 5. Search provider

The discovery layer is intentionally provider-neutral.

The default implementation supports a simple HTTP JSON search API via:

```yaml
people_search:
  provider: "tavily"
  endpoint_env: "SEARCH_API_URL"
  api_key_env: "SEARCH_API_KEY"
  auth_header_env: "SEARCH_API_AUTH_HEADER"
```

For Tavily, set:

```ini
SEARCH_API_URL=https://api.tavily.com/search
SEARCH_API_AUTH_HEADER=Authorization
```

The adapter sends `Authorization: Bearer <key>` when the auth header is `Authorization`.

You can later replace this adapter with SerpAPI, Google Programmable Search, Bing, or another provider without changing the rest of the pipeline.

### 6. Run

Dry run:

```bash
python -m app.main "https://example.com/job/123"
```

The script will NOT send email unless:

```yaml
email:
  auto_send: true
```

and:

```yaml
system:
  dry_run: false
```

## Current V1 limitations

- Dynamic JS-heavy job pages may need a browser-based fetcher later.
- Search-provider JSON schemas vary. Tavily and the generic `results` list
  shape are supported.
- Apollo enrichment is intentionally done only for the top contacts.
- LinkedIn automation is not included.
- This is a foundation, not a production-grade mass-outreach system.

## Recommended next iterations

1. Add a better browser/page extractor for JS-heavy job sites.
2. Add source-specific people-discovery adapters.
3. Add SQLite history and duplicate-contact prevention.
4. Add a small review UI before enabling automatic email send.
5. Add follow-up tracking.
