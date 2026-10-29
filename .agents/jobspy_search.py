"""Tier 4 batch search: JobSpy (LinkedIn) + every job_search filter, applied in code.

Used by the `search_and_filter` tool in jobspy_mcp.py. Also runnable directly when the MCP
server is down:  .venv/bin/python .agents/jobspy_search.py [--max-minutes N]

Flow (all settings from input/profile.yaml -> job_search.discovery.jobspy_mcp):
  1. Search: one call per (query group x location), Indeed first (fast), then LinkedIn,
     no descriptions yet. Stops at max_calls_per_run or max_runtime_minutes.
     JobSpy never raises on HTTP 429; it logs and returns partial results. A log handler
     catches that, and the call is retried after a back-off. Repeated throttling stops LinkedIn
     for the run (circuit breaker) instead of hammering it.
  2. Cheap filters (no network): freshness, title, location, remote, applied, in-run duplicates.
  3. LinkedIn descriptions are fetched only for survivors (capped, same 429 handling).
  4. Description filters: experience, language, sponsorship.
Scoring against matching.minimum_score is left to the skill; each kept job carries the
signals it needs (skill hits, must-have check, required years, sponsorship verdict).

Full results (kept, unchecked, dropped with reasons) go to output/jobspy_results_<date>_<time>.json.
Progress goes to output/jobspy_last_run.log (tail -f it during a run).
"""
import csv, json, logging, random, re, sys, time
import datetime as dt
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

import yaml
from jobspy import scrape_jobs

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / 'input' / 'profile.yaml'
LOG_FILE = ROOT / 'output' / 'jobspy_last_run.log'

SUPPORTED_SITES = {'linkedin', 'indeed'}  # glassdoor/google return nothing for EU locations
SITE_LABEL = {'linkedin': 'LinkedIn', 'indeed': 'Indeed'}
THROTTLE_RE = re.compile(r'status code 429|blocked\?|throttled', re.I)
BACKOFF_SECONDS = [30, 90, 180]
EXPERIENCE_CONTEXT = re.compile(r'(?i)experien|erfahrung|ervaring|doświadcz|background|professional|industry|hands-on|working|track record|in (a|the) (similar|related)')
OPTIONAL_EXPERIENCE = re.compile(r'(?i)prefer|ideally|nice to have|bonus|a plus|is a plus|desirable|advantage')
GERMAN_TITLE = re.compile(r'(?i)entwickler|ingenieur|mitarbeiter|informatiker|fachkraft|leiter|berater')
GENDER_MARKER = re.compile(r'\((?:[mwfdx]\s*/\s*){1,3}[mwfdx]\)|\(all genders\)|\(gn\)', re.I)

STOPWORDS = {
    'english': 'the and to of with you we our for in is are will your on as be this that'.split(),
    'german': 'und der die das mit für wir sie ist ein eine zu von auf bei unser unsere deine du dich dein sind wird oder auch nicht'.split(),
    'dutch': 'en het een van voor wij je jouw met zijn bij ons onze wat naar ook niet'.split(),
    'french': 'et le la les des une pour vous nous avec est dans sur votre notre au aux'.split(),
    'spanish': 'y el los las una para con nuestro nuestra que por del como tu tus'.split(),
    'polish': 'się jest dla oraz nasz nasza na w z że jak lub nie będzie'.split(),
    'italian': 'il di per con che una nostro nostra sono della delle nel tuo'.split(),
    'hungarian': 'és az egy hogy nem vagy van mint csapat munka számára valamint ahol'.split(),
    'swedish': 'och att det som för med är vi du på av till har inom erfarenhet'.split(),
}


# ---------------------------------------------------------------- helpers

class _Throttle(logging.Handler):
    """Collects JobSpy log lines that signal rate limiting."""
    def __init__(self):
        super().__init__(logging.WARNING)
        self.hits = []

    def emit(self, record):
        msg = record.getMessage()
        if THROTTLE_RE.search(msg):
            self.hits.append(msg)


def _ci(pattern):
    """Compile a profile regex; profile patterns carry their own (?i) where they need it."""
    return re.compile(pattern)


def norm_url(u):
    """Stable job key: LinkedIn and Indeed by job id (their URLs vary by host/slug), others by host+path."""
    u = u or ''
    m = re.search(r'linkedin\.com/jobs/view/(?:[^/?#]*-)?(\d{6,})', u)
    if m:
        return f'linkedin:{m.group(1)}'
    s = urlsplit(u)
    if 'indeed.' in s.netloc:
        jk = parse_qs(s.query).get('jk')
        if jk:
            return f'indeed:{jk[0]}'
    return (s.netloc.lower().removeprefix('www.') + s.path).rstrip('/')


def norm_title(t):
    t = GENDER_MARKER.sub(' ', t or '').lower()
    return re.sub(r'[^a-z0-9]+', ' ', t).strip()


def _text(v):
    return '' if v is None or (isinstance(v, float) and v != v) else str(v)


def _near(text, start, end, pattern, width=60):
    return bool(pattern.search(text[max(0, start - width):end + width]))


def _sentence(text, start, end):
    """The sentence (or bullet line) containing text[start:end]."""
    a = max(text.rfind('.', 0, start), text.rfind('\n', 0, start), text.rfind('•', 0, start)) + 1
    ends = [i for i in (text.find('.', end), text.find('\n', end)) if i != -1]
    return text[a:min(ends) if ends else len(text)]


# ---------------------------------------------------------------- profile

class Config:
    def __init__(self, P):
        js = P['job_search']
        d = js['discovery']
        t4 = d['jobspy_mcp']
        self.tz = ZoneInfo(P.get('system', {}).get('timezone', 'UTC'))
        self.sites = [s for s in t4.get('sites', ['linkedin', 'indeed']) if s in SUPPORTED_SITES]
        self.hours_old = t4.get('hours_old', js['freshness'].get('max_age_hours', 24))
        self.results_per_call = t4.get('results_wanted_per_query', 30)
        # The cap protects LinkedIn (rate limits); Indeed calls take under a second.
        self.max_calls = {'linkedin': t4.get('max_calls_per_run', 32), 'indeed': t4.get('max_calls_indeed', 100)}
        self.max_minutes = t4.get('max_runtime_minutes', 20)
        self.max_desc_fetches = t4.get('max_description_fetches', 150)
        self.max_return = t4.get('max_jobs_returned', 60)
        # LinkedIn handles OR groups well (fewer, broader calls); Indeed returns far less for OR,
        # so it gets the plain queries.
        self.queries = {'linkedin': t4.get('linkedin_query_groups') or d['search_queries'], 'indeed': d['search_queries']}
        # Country-level locations: one call covers a whole country. Value = Indeed country name.
        self.locations = t4.get('search_locations') or {loc: loc.split(',')[-1].strip() for loc in t4['locations']}

        self.include = _ci(d['title_include_regex'])
        self.exclude = _ci(d['title_exclude_regex'])
        self.exclude_titles = [x.lower() for x in js.get('exclude_titles', [])]
        self.target_titles = [x.lower() for grp in js['target_titles'].values() for x in grp]
        ex = js['experience']
        self.reject_kw = re.compile(r'(?i)\b(' + '|'.join(map(re.escape, ex['reject_title_keywords'])) + r')\b')
        self.exp_patterns = [_ci('(?i)' + p) for p in ex['detection_patterns']]
        self.reject_years = ex['reject_if_required_years_gte']
        self.unknown_exp = ex.get('unknown_experience_action', 'keep')

        lang = js['language']
        self.drop_non_english = lang.get('drop_non_english_postings', True)
        self.lang_patterns = [_ci(p) for p in lang['required_language_patterns']]
        self.lang_optional = re.compile('(?i)' + '|'.join(map(re.escape, lang['optional_markers'])))

        sc = P['outreach']['sponsorship_check']
        self.no_sponsor = [_ci(p) for p in sc['no_patterns']]
        self.yes_sponsor = [_ci(p) for p in sc['yes_patterns']]
        self.drop_no_sponsor = bool((js.get('application_filters') or {}).get('drop_explicit_no_sponsorship'))

        self.countries = []
        for name, c in P['locations']['countries'].items():
            if c.get('enabled'):
                words = [name] + c.get('aliases', []) + c.get('regions', [])
                long_ = [w for w in words if len(w) > 2]
                short = [w for w in words if len(w) <= 2]  # "DE", "UK": case-sensitive whole word only
                rx = r'(?i:\b(?:' + '|'.join(map(re.escape, long_)) + r')\b)'
                if short:
                    rx += r'|\b(?:' + '|'.join(map(re.escape, short)) + r')\b'
                self.countries.append((name, re.compile(rx)))
        self.allow_remote = P['locations'].get('work_mode', {}).get('remote', True)

        sk = P['skills']
        aliases = sk.get('aliases', {})
        self.must_have = sk.get('must_have', [])
        self.skill_groups = {}
        for grp in P['matching']['skill_group_weights']:
            terms = {}
            for s in sk.get(grp, []):
                variants = {s} | set(aliases.get(s, []))
                terms[s] = re.compile(r'(?i)(?<![a-z])(?:' + '|'.join(map(re.escape, variants)) + r')(?![a-z])')
            self.skill_groups[grp] = terms

        out = js['output']
        self.applied = set()
        for src in out.get('dedupe_against', []):
            p = ROOT / src['path']
            if p.exists():
                with open(p, encoding='utf-8', newline='') as f:
                    self.applied |= {norm_url(r[0]) for r in csv.reader(f) if r and r[0].startswith('http')}


# ---------------------------------------------------------------- run

class Run:
    def __init__(self, cfg, max_minutes=None, log=None):
        self.c = cfg
        self.t0 = time.monotonic()
        self.deadline = self.t0 + 60 * (max_minutes or cfg.max_minutes)
        self.now = dt.datetime.now(cfg.tz)
        self.cutoff_utc = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=cfg.hours_old)
        self.search_deadline = self.t0 + 0.55 * (self.deadline - self.t0)  # rest is for descriptions
        self.notes = []
        self.calls = {}
        self.linkedin_stopped = False
        self.throttle = _Throttle()
        logging.getLogger('JobSpy:LinkedIn').addHandler(self.throttle)
        self._log_fp = open(LOG_FILE, 'w', encoding='utf-8')
        self._extra_log = log

    def log(self, msg):
        line = f'[{time.monotonic() - self.t0:6.0f}s] {msg}'
        self._log_fp.write(line + '\n'); self._log_fp.flush()
        if self._extra_log:
            self._extra_log(line)

    def time_left(self):
        return self.deadline - time.monotonic()

    def close(self):
        logging.getLogger('JobSpy:LinkedIn').removeHandler(self.throttle)
        self._log_fp.close()

    # ---- step 1: search
    def _search_once(self, site, query, location, country):
        kw = dict(site_name=[site], search_term=query, results_wanted=self.c.results_per_call,
                  hours_old=self.c.hours_old, description_format='markdown', verbose=1)
        if site == 'linkedin':
            kw.update(location=location, fetch_description=False)
        else:  # Indeed: the country picks the national site; no city filter, descriptions come free
            kw.update(country_indeed=country, fetch_description=True)
        return scrape_jobs(**kw)

    def search(self):
        raw, skipped = [], {}
        # Indeed first (fast, has descriptions). Then by query priority across all locations,
        # so a time cut drops the lowest-priority group rather than the last countries.
        plan = [(s, q, loc, ctry) for s in sorted(self.c.sites, key=lambda s: s != 'indeed')
                for q in self.c.queries[s] for loc, ctry in self.c.locations.items()]
        self.log(f'plan: {len(plan)} searches (caps {self.c.max_calls}), sites {self.c.sites}')
        for site, q, loc, ctry in plan:
            if self.calls.get(site, 0) >= self.c.max_calls[site]:
                skipped[site] = skipped.get(site, 0) + 1
                continue
            if time.monotonic() > self.search_deadline:
                self.notes.append(f'search time budget reached after {sum(self.calls.values())} searches; '
                                  f'{len(plan) - plan.index((site, q, loc, ctry))} lower-priority searches skipped')
                break
            if site == 'linkedin' and self.linkedin_stopped:
                continue
            self.calls[site] = self.calls.get(site, 0) + 1
            rows = self._search_with_backoff(site, q, loc, ctry)
            raw.extend(rows)
            self.log(f'{site:8} {loc:16} {q[:60]!r}: {len(rows)} jobs (total {len(raw)})')
        for site, n in skipped.items():
            self.notes.append(f'{site}: call cap {self.c.max_calls[site]} reached, {n} searches skipped')
        return raw

    def _search_with_backoff(self, site, q, loc, ctry):
        best = []
        for attempt in range(len(BACKOFF_SECONDS) + 1):
            self.throttle.hits.clear()
            try:
                df = self._search_once(site, q, loc, ctry)
            except Exception as e:
                self.log(f'{site} error: {type(e).__name__}: {e}')
                return best
            rows = df.to_dict('records') if not df.empty else []
            if site != 'linkedin' or not self.throttle.hits:
                return rows
            # throttled: keep the best attempt; stop retrying once a full result set came back
            best = max(best, rows, key=len)
            if len(best) >= self.c.results_per_call:
                return best
            if attempt == len(BACKOFF_SECONDS) or self.time_left() < BACKOFF_SECONDS[attempt] + 120:
                self.linkedin_stopped = True
                self.notes.append(f'LinkedIn throttled repeatedly; stopped LinkedIn searches at {loc} / {q[:40]}')
                self.log('LinkedIn circuit breaker: stopping LinkedIn searches')
                return best
            wait = BACKOFF_SECONDS[attempt]
            self.log(f'LinkedIn 429 ({len(rows)} jobs back); waiting {wait}s then retrying')
            time.sleep(wait)
        return best

    # ---- step 2: cheap filters
    def _fresh(self, posted):
        # Boards give a date only (European/UTC calendar). A date counts as fresh if any part of
        # that day falls inside the window; comparing in IST would drop jobs a few hours old.
        try:
            return dt.date.fromisoformat(str(posted)[:10]) >= self.cutoff_utc.date()
        except (TypeError, ValueError):  # None, NaN, NaT
            return False

    def cheap_filter(self, raw):
        kept, dropped, seen_url, seen_key = [], [], set(), set()
        for r in raw:
            j = dict(title=_text(r.get('title')), company=_text(r.get('company')), location=_text(r.get('location')),
                     date_posted=_text(r.get('date_posted'))[:10], source=SITE_LABEL.get(_text(r.get('site')), _text(r.get('site'))),
                     link=_text(r.get('job_url')), link_direct=_text(r.get('job_url_direct')),
                     is_remote=bool(r.get('is_remote')) if _text(r.get('is_remote')) else False,
                     description=_text(r.get('description')))
            key = norm_url(j['link'])
            if key in seen_url:
                continue  # same posting from another query: not worth reporting
            seen_url.add(key)
            reason = self._cheap_reason(j, r.get('date_posted'), key)
            if not reason:
                # Same role on Indeed and LinkedIn: Indeed comes first and has the description.
                dkey = (j['company'].lower(), norm_title(j['title']), self._country(j['location']))
                if dkey in seen_key:
                    reason = 'duplicate (company+title+country)'
                seen_key.add(dkey)
            if reason:
                dropped.append({**_brief(j), 'reason': reason})
            else:
                kept.append(j)
        return kept, dropped

    def _cheap_reason(self, j, posted, key):
        t = j['title']
        if not self._fresh(posted):
            return 'older than 24h' if _text(posted)[:1].isdigit() else 'no posting date'
        if key in self.c.applied:
            return 'already applied'
        if self.c.exclude.search(t) or any(x in t.lower() for x in self.c.exclude_titles):
            return 'title excluded'
        m = self.c.reject_kw.search(t)
        if m:
            return f'title implies 5+ years ({m.group(0)})'
        if not (self.c.include.search(t) or any(x in t.lower() for x in self.c.target_titles)):
            return 'title not a target role'
        if not self._country(j['location']):
            return 'location not in an enabled country'
        if j['is_remote'] and not self.c.allow_remote:
            return 'remote role (work_mode.remote is false)'
        return None

    def _country(self, location):
        return next((name for name, rx in self.c.countries if rx.search(location)), None)

    # ---- step 3: descriptions for LinkedIn survivors
    def fetch_descriptions(self, jobs):
        need = [j for j in jobs if j['source'] == 'LinkedIn' and not j['description']]
        # Highest-value first, so a cap or time-out drops the least relevant ones.
        need.sort(key=lambda j: -self._title_priority(j['title']))
        unchecked = need[self.c.max_desc_fetches:]
        need = need[:self.c.max_desc_fetches]
        if unchecked:
            self.notes.append(f'{len(unchecked)} LinkedIn jobs over the description cap ({self.c.max_desc_fetches}) were not checked')
        if not need:
            return unchecked
        try:
            from jobspy.linkedin import LinkedIn
            from jobspy.model import ScraperInput, DescriptionFormat
            li = LinkedIn()
            li.scraper_input = ScraperInput(description_format=DescriptionFormat.MARKDOWN)
            fetch = li._fetch_details  # internal JobSpy API; guarded below in case a release renames it
        except Exception as e:
            self.notes.append(f'cannot fetch LinkedIn descriptions with this JobSpy version ({type(e).__name__}); those jobs are unchecked')
            return unchecked + need
        self.log(f'fetching {len(need)} LinkedIn descriptions')
        strikes, delay, streak = 0, 1.0, 0  # delay grows after a 429, shrinks after a run of successes
        for i, j in enumerate(need):
            if self.time_left() < 30:
                self.notes.append(f'runtime budget reached; {len(need) - i} LinkedIn descriptions not fetched')
                return unchecked + need[i:]
            job_id = norm_url(j['link']).removeprefix('linkedin:')
            for attempt in range(2):
                self.throttle.hits.clear()
                try:
                    det = fetch(job_id) or {}
                except Exception:
                    det = {}
                if det.get('description') or not self.throttle.hits or attempt == 1:
                    break
                delay, streak = min(delay * 1.6, 6.0), 0
                self.log(f'LinkedIn 429 on job {job_id}; waiting {BACKOFF_SECONDS[0]}s, delay now {delay:.1f}s')
                time.sleep(BACKOFF_SECONDS[0])
            if det.get('description'):
                j['description'] = det['description']
                strikes, streak = 0, streak + 1
                if streak >= 20:
                    delay, streak = max(delay * 0.8, 0.8), 0
            elif self.throttle.hits:
                strikes += 1
                if strikes >= 3:
                    self.notes.append(f'LinkedIn throttled description fetches; {len(need) - i - 1} left unchecked')
                    return unchecked + need[i:]
            if (i + 1) % 25 == 0:
                self.log(f'  descriptions {i + 1}/{len(need)}')
            time.sleep(random.uniform(0.7, 1.3) * delay)
        return unchecked + [j for j in need if not j['description']]

    def _title_priority(self, title):
        t = title.lower()
        return (2 * ('java' in t) + any(x in t for x in self.c.target_titles) + ('backend' in t or 'back-end' in t)
                - 2 * bool(GERMAN_TITLE.search(title)))

    # ---- step 4: description filters + signals
    def deep_filter(self, jobs):
        kept, dropped = [], []
        for j in jobs:
            text = f"{j['title']}\n{j['description']}"
            reason, years, years_quote = None, None, None
            lang = detect_language(j['description'])
            if self.c.drop_non_english and lang != 'english':
                reason = f'posting written in {lang}'
            elif not j['description'] and (GERMAN_TITLE.search(j['title']) or GENDER_MARKER.search(j['title'])):
                reason = 'German-style title and no description to check the language'
            if not reason:
                rq = self._required_language(text)
                if rq:
                    reason = f'requires another language: "{rq}"'
            if not reason:
                years, years_quote = self._required_years(text)
                if years is not None and years >= self.c.reject_years:
                    reason = f'requires {years}+ years: "{years_quote}"'
            verdict, quote = self._sponsorship(text)
            if not reason and verdict == 'no' and self.c.drop_no_sponsor:
                reason = f'explicitly no sponsorship: "{quote}"'
            if reason:
                dropped.append({**_brief(j), 'reason': reason})
                continue
            hits = {g: sorted(s for s, rx in terms.items() if rx.search(text)) for g, terms in self.c.skill_groups.items()}
            j.update(required_years=years, required_years_quote=years_quote, sponsorship=verdict, sponsorship_quote=quote,
                     skill_hits={g: v for g, v in hits.items() if v},
                     must_have_missing=[m for m in self.c.must_have if not re.search(rf'(?i)(?<![a-z]){re.escape(m)}(?![a-z])', text)])
            kept.append(j)
        kept.sort(key=lambda j: -sum(len(v) for v in j['skill_hits'].values()))
        return kept, dropped

    def _required_language(self, text):
        for rx in self.c.lang_patterns:
            for m in rx.finditer(text):
                if not _near(text, m.start(), m.end(), self.c.lang_optional):
                    return m.group(0)
        return None

    def _required_years(self, text):
        best, quote = None, None
        for rx in self.c.exp_patterns:
            for m in rx.finditer(text):
                n = int(m.group(1))
                if n > 15:  # "25+ years in business", not a requirement
                    continue
                if re.search(r'\d\s*(?:-|–|to)\s*$', text[max(0, m.start(1) - 6):m.start(1)]):
                    continue  # upper end of a range ("3-5 years"); the range pattern takes the lower bound
                sentence = _sentence(text, m.start(), m.end())
                if not EXPERIENCE_CONTEXT.search(sentence) or OPTIONAL_EXPERIENCE.search(sentence):
                    continue
                if best is None or n > best:
                    best, quote = n, text[max(0, m.start() - 30):m.end() + 50].replace('\n', ' ').strip()
        return best, quote

    def _sponsorship(self, text):
        no = next((m for rx in self.c.no_sponsor for m in [rx.search(text)] if m), None)
        yes = next((m for rx in self.c.yes_sponsor for m in [rx.search(text)] if m), None)
        if no and yes:
            return 'conflicting', f'{_quote(text, no)} | {_quote(text, yes)}'
        if no:
            return 'no', _quote(text, no)
        if yes:
            return 'yes', _quote(text, yes)
        return 'not_mentioned', None


def detect_language(text):
    words = re.findall(r'[a-zà-ÿąćęłńóśźżőű]+', (text or '').lower())
    if len(words) < 40:
        return 'english'  # too little text to judge; the title checks already ran
    counts = {lang: sum(w in sw for w in words) for lang, sw in ((l, set(s)) for l, s in STOPWORDS.items())}
    foreign = max((l for l in counts if l != 'english'), key=counts.get)
    # Bilingual postings with a full English version are kept.
    return foreign if counts[foreign] > 1.2 * counts['english'] and counts[foreign] >= 15 else 'english'


def _quote(text, m):
    return text[max(0, m.start() - 40):m.end() + 40].replace('\n', ' ').strip()


def _brief(j):
    return {k: j[k] for k in ('title', 'company', 'location', 'date_posted', 'source', 'link')}


def run(max_minutes=None, log=None):
    P = yaml.safe_load(open(PROFILE, encoding='utf-8'))
    cfg = Config(P)
    r = Run(cfg, max_minutes, log)
    try:
        raw = r.search()
        survivors, dropped1 = r.cheap_filter(raw)
        r.log(f'after title/location/applied/dedupe: {len(survivors)} of {len(raw)} raw')
        unchecked_ids = {id(j) for j in r.fetch_descriptions(survivors)}
        unchecked = [_brief(j) for j in survivors if id(j) in unchecked_ids]
        kept, dropped2 = r.deep_filter([j for j in survivors if id(j) not in unchecked_ids])
        r.log(f'kept {len(kept)}, unchecked {len(unchecked)}')
    finally:
        r.close()

    dropped = dropped1 + dropped2
    reasons = {}
    for d in dropped:
        k = re.sub(r'\s*(\(.*\)|:\s*".*)$', '', d['reason'])
        reasons[k] = reasons.get(k, 0) + 1
    stamp = r.now.strftime('%Y-%m-%d_%H%M%S')
    path = ROOT / 'output' / f'jobspy_results_{stamp}.json'
    summary = dict(searches=r.calls,raw_jobs=len(raw), unique_jobs=len(dropped1) + len(survivors), kept=len(kept),
                   unchecked=len(unchecked), dropped=len(dropped), dropped_by_reason=dict(sorted(reasons.items(), key=lambda x: -x[1])),
                   minutes=round((time.monotonic() - r.t0) / 60, 1), notes=r.notes, results_file=str(path.relative_to(ROOT)))
    json.dump(dict(summary=summary, kept=kept, unchecked=unchecked, dropped=dropped), open(path, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1, default=str)
    return summary, kept, cfg.max_return


def compact(job, chars=500):
    """What the skill needs to score a job, without the full description."""
    out = {k: job[k] for k in ('title', 'company', 'location', 'date_posted', 'source', 'link', 'link_direct',
                               'required_years', 'sponsorship', 'sponsorship_quote', 'skill_hits', 'must_have_missing')}
    out['description_excerpt'] = re.sub(r'\s+', ' ', job['description'])[:chars]
    return {k: v for k, v in out.items() if v not in (None, '', [], {})}


if __name__ == '__main__':
    mm = int(sys.argv[sys.argv.index('--max-minutes') + 1]) if '--max-minutes' in sys.argv else None
    s, _, _ = run(mm,log=lambda line: print(line, file=sys.stderr, flush=True))
    print(json.dumps(s, indent=1))
