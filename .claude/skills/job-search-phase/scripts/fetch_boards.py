"""Headless Playwright fetch for pages without a JSON API:
  --group boards     Tier 4 extra boards (Xing, Reed, NoFluffJobs, BerlinStartupJobs)
  --group companies  Tier 2 target companies with ats: custom (Booking.com, Zalando, Meta, Personio)
  (default: both)

Usage: python fetch_boards.py <out_fresh_json> [--group boards|companies] [--no-snapshot-update] [--only Xing,Reed]

Each board in job_search.discovery.jobspy_mcp.extra_boards.boards is either
  type: list  -> load every url built from queries x locations, read job cards with CSS selectors
  type: rss   -> load an RSS feed through the browser (some feeds 403 plain HTTP clients)
Each custom target company lists its careers_url (paged via page=N up to max_pages) and a
job_link_regex; every matching link is one job. Only job rows come back; no page dumps.

A job is "fresh" if its age (card text like "22 hours ago", or RSS pubDate) is within
freshness.max_age_hours, OR its URL was not in the previous snapshot (same rules as fetch_ats.py:
first run per board/company is a baseline, an implausible burst of new URLs is ignored). URLs stay
in the snapshot for RETAIN_DAYS after they were last seen, so paged or search-limited listings
do not re-flag jobs that drop out of view and come back.
Snapshots: output/board_job_snapshot.json (boards), output/company_job_snapshot.json (custom:<name>).
"""
import yaml, re, json, datetime as dt, html, sys, os
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit, quote
from playwright.sync_api import sync_playwright

ROOT = str(__import__("pathlib").Path(__file__).resolve().parents[4])
SNAP = os.path.join(ROOT, 'output', 'board_job_snapshot.json')
COMP_SNAP = os.path.join(ROOT, 'output', 'company_job_snapshot.json')
RETAIN_DAYS = 30
P = yaml.safe_load(open(os.path.join(ROOT, 'input', 'profile.yaml'), encoding='utf-8'))
CFG = P['job_search']['discovery']['jobspy_mcp']['extra_boards']
HOURS = P['job_search']['freshness'].get('max_age_hours', 24)
now = dt.datetime.now(dt.timezone.utc)
CUT = now - dt.timedelta(hours=HOURS)
LOCAL_TODAY = now.astimezone().date()
DATE_ONLY = P['job_search']['freshness'].get('date_only_sources_action', 'keep_if_today_or_yesterday')
OUT = sys.argv[1]
UPDATE = '--no-snapshot-update' not in sys.argv
ONLY = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
GROUP = sys.argv[sys.argv.index('--group') + 1] if '--group' in sys.argv else 'all'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
CONSENT = ['Accept all', 'Accept All', 'Alle akzeptieren', 'Akzeptieren', 'Accept', 'Akkoord']
AGE = re.compile(r'\b(\d+)\s*(min|minute|hr|hour|day|week)s?\s+ago\b', re.I)
UNIT = {'min': 'minutes', 'minute': 'minutes', 'hr': 'hours', 'hour': 'hours', 'day': 'days', 'week': 'weeks'}

CARDS_JS = r"""(c) => [...document.querySelectorAll(c.card)].map(el => {
  const q = s => s ? el.querySelector(s) : null;
  const txt = s => { const e = q(s); return e ? e.innerText.trim() : ''; };
  const a = el.matches('a[href]') ? el : q(c.link || 'a[href]');
  return {title: txt(c.title), company: txt(c.company), loc: txt(c.location), link: a ? a.href : '',
          text: el.innerText.replace(/\s+/g, ' ')};
})"""


def norm(u):
    s = urlsplit(u or '')
    return (s.netloc.lower() + s.path).rstrip('/')


def age_to_date(text):
    """(date, date_only) from card text: "22 hours ago", "Just now", or day words like "Yesterday"."""
    if re.search(r'\bjust now\b|\bjust posted\b', text, re.I):
        return now, False
    m = AGE.search(text)
    if m:
        return now - dt.timedelta(**{UNIT[m.group(2).lower()]: int(m.group(1))}), False
    m = re.search(r'\b(today|yesterday)\b', text, re.I)
    if m:
        day = LOCAL_TODAY - dt.timedelta(days=m.group(1).lower() == 'yesterday')
        return dt.datetime.combine(day, dt.time(), now.astimezone().tzinfo), True
    return None, False


def is_fresh(j):
    if j['new_id']:
        return True
    if not j['date']:
        return False
    if j.get('date_only'):  # freshness.date_only_sources_action
        return DATE_ONLY == 'keep_if_today_or_yesterday' and j['date'].date() >= LOCAL_TODAY - dt.timedelta(days=1)
    return j['date'] >= CUT


def consent(page):
    for t in CONSENT:
        b = page.get_by_role('button', name=t, exact=True)
        if b.count():
            try:
                b.first.click(timeout=3000)
                page.wait_for_timeout(1000)
            except Exception:
                pass
            return


def urls(b):
    qs, locs = b.get('queries') or [''], b.get('locations') or ['']
    return [b['url'].format(query=quote(q), query_slug=re.sub(r'\W+', '-', q.lower()).strip('-'), location=quote(l))
            for q in qs for l in locs]


def fetch_list(page, b):
    out = []
    for u in urls(b):
        page.goto(u, wait_until='domcontentloaded', timeout=30000)
        page.wait_for_timeout(b.get('wait_ms', 3500))
        consent(page)
        rows = page.evaluate(CARDS_JS, b)
        if not rows and page.title().lower() in ('access denied', 'just a moment...'):
            raise RuntimeError(f'blocked ({page.title()})')
        for r in rows:
            if r['title'] and r['link']:
                date, date_only = age_to_date(r['text'])
                out.append(dict(title=r['title'], company=r['company'], loc=r['loc'] or b.get('country', ''),
                                date=date, date_only=date_only, link=r['link'].split('?')[0], desc='', source=b['name']))
    return out


def fetch_rss(page, b):
    page.goto(b['url'], timeout=30000)
    body = page.evaluate('() => document.documentElement.outerHTML')
    out = []
    for item in re.findall(r'<item>(.*?)</item>', body.replace('&lt;', '<').replace('&gt;', '>'), re.S):
        f = lambda tag: (re.search(rf'<{tag}>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</{tag}>', item, re.S) or [None, ''])[1].strip()
        title, company = html.unescape(f('title')), ''
        if b.get('title_company_sep') and b['title_company_sep'] in title:
            title, company = [s.strip() for s in title.rsplit(b['title_company_sep'], 1)]
        try:
            date = parsedate_to_datetime(f('pubDate'))
        except Exception:
            date = None
        out.append(dict(title=title, company=company, loc=b.get('country', ''), date=date,
                        link=f('link'), desc='', source=b['name']))
    return out


def fetch_links(page, c):
    """ats: custom target company: every link on the careers page matching job_link_regex is one job."""
    out, seen_links = [], set()
    for pg in range(1, c.get('max_pages', 1) + 1):
        url = re.sub(r'([?&]page=)\d+', rf'\g<1>{pg}', c['careers_url'])
        if pg > 1 and url == c['careers_url']:
            break
        page.goto(url, wait_until='domcontentloaded', timeout=30000)
        page.wait_for_timeout(c.get('wait_ms', 5000))
        consent(page)
        before = len(seen_links)
        for href, text in page.evaluate("() => [...document.querySelectorAll('a[href]')].map(a => [a.href, a.innerText.trim()])"):
            link = href.split('?')[0].split('#')[0]
            title = next((l.strip() for l in text.split('\n') if l.strip()), '')
            if not re.search(c['job_link_regex'], link) or not title or link in seen_links:
                continue
            seen_links.add(link)
            rest = [l.strip() for l in text.split('\n')[1:] if l.strip()]
            out.append(dict(title=title, company=c['name'], loc=' '.join(rest)[:120] or c.get('country', ''),
                            date=None, link=link, desc='', source=f"{c['name']} careers"))
        if len(seen_links) == before:  # page added nothing new: past the last page
            break
    if not out:
        raise RuntimeError('0 job links matched job_link_regex (page layout changed?)')
    return out


def entry(v):
    """Snapshot entries were plain first_seen strings before last_seen was tracked."""
    return v if isinstance(v, dict) else {'first_seen': v, 'last_seen': now.isoformat()}


def diff(key, out, store):
    """Flag new URLs against store[key] and update it. URLs stay remembered for RETAIN_DAYS after they
    were last seen, so a job that drops off a paged listing and comes back is not 'new' again."""
    cur = {norm(o['link']): o for o in out}
    prev = store.get(key)
    new, anomaly = set(), False
    if prev is None:
        baseline.append(key)
        pj = {}
    else:
        pj = {u: entry(v) for u, v in prev['jobs'].items()}
        fresh_new = [u for u in cur if u not in pj]
        if len(fresh_new) > max(30, 0.5 * len(cur)):
            anomalies.append(f'{key}: {len(fresh_new)}/{len(cur)} new, ignoring')
            anomaly = True
        else:
            new.update(fresh_new)
        for u, e in pj.items():  # first seen inside the window still counts as new
            if u in cur and e.get('first_seen') and now - dt.datetime.fromisoformat(e['first_seen']) <= dt.timedelta(hours=HOURS):
                new.add(u)
    for u, o in cur.items():
        o['new_id'] = u in new
        jobs.append(o)
    if cur:
        nowiso = now.isoformat()
        keep = {u: e for u, e in pj.items() if u not in cur and now - dt.datetime.fromisoformat(e['last_seen']) <= dt.timedelta(days=RETAIN_DAYS)}
        store[key] = {'last_scan': nowiso, 'jobs': {**keep, **{u: {'title': o['title'], 'loc': o['loc'],
                      'first_seen': pj[u]['first_seen'] if u in pj else (nowiso if prev is not None and not anomaly else None), 'last_seen': nowiso}
                      for u, o in cur.items()}}}


def load(path, root):
    try:
        return json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {root: {}}
    except Exception:
        log.append(f'{os.path.basename(path)} unreadable, treating all as baseline')
        return {root: {}}


jobs, log, baseline, anomalies, ok = [], [], [], [], []
board_snap = load(SNAP, 'boards')
comp_snap = load(COMP_SNAP, 'companies')  # shared with fetch_ats.py; custom pages use keys custom:<name>
work = []
if GROUP in ('all', 'boards'):
    work += [(b['name'], b, fetch_rss if b.get('type') == 'rss' else fetch_list, board_snap.setdefault('boards', {}))
             for b in CFG['boards'] if b.get('enabled', True)]
if GROUP in ('all', 'companies') and P['job_search']['discovery']['target_companies'].get('enabled', True):
    work += [(f"custom:{c['name']}", c, fetch_links, comp_snap.setdefault('companies', {}))
             for c in P['job_search']['discovery']['target_companies']['companies'] if c['ats'] == 'custom']
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_context(locale='en-GB', user_agent=UA).new_page()
    for key, cfg, fetch, store in work:
        if ONLY and cfg['name'] not in ONLY:
            continue
        try:
            out = fetch(page, cfg)
        except Exception as e:
            log.append(f"{key}: {str(e).splitlines()[0][:150]}")
            continue
        ok.append(f"{key} {len(out)}")
        diff(key, out, store)
    browser.close()

fresh = [j for j in jobs if is_fresh(j)]
for j in fresh:
    j['why'] = 'new_id' if j['new_id'] and not is_fresh({**j, 'new_id': False}) else 'date'
    j['date'] = j['date'].isoformat() if j['date'] else None
json.dump(dict(jobs=fresh, log=log), open(OUT, 'w'), ensure_ascii=False)

if UPDATE:
    os.makedirs(os.path.dirname(SNAP), exist_ok=True)
    if GROUP in ('all', 'boards'):
        json.dump(board_snap, open(SNAP, 'w', encoding='utf-8'))
    if GROUP in ('all', 'companies'):
        json.dump(comp_snap, open(COMP_SNAP, 'w', encoding='utf-8'))

print(f'{GROUP} ok [{", ".join(ok)}] | jobs {len(jobs)} | fresh {len(fresh)} '
      f'(by new-id only: {sum(j["why"] == "new_id" for j in fresh)}) | baseline {baseline} | failed {log}', file=sys.stderr)
for a in anomalies:
    print('ANOMALY', a, file=sys.stderr)
