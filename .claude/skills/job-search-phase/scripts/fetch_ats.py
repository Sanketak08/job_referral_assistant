"""Tier 1-3 fetch with a per-company job snapshot.

Usage: python fetch_ats.py <out_fresh_json> [--no-snapshot-update]

A job is "fresh" if its posting timestamp is within freshness.max_age_hours (default 24h)
OR its URL was not in the company's previous snapshot (first_seen within the window).
Snapshot file: output/company_job_snapshot.json
  {"companies": {"<provider>:<token>": {"jobs": {"<normalized url>": {title, loc, first_seen}}, "last_scan": iso}}}
A board with no snapshot yet is a baseline: it is recorded, nothing is flagged new on that run.
A board whose fetch failed or returned 0 jobs never overwrites its snapshot.
"""
import yaml, requests, re, json, datetime as dt, html, sys, os
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit, parse_qsl

ROOT = str(__import__("pathlib").Path(__file__).resolve().parents[4])
SNAP = os.path.join(ROOT, 'output', 'company_job_snapshot.json')
P = yaml.safe_load(open(os.path.join(ROOT, 'input', 'profile.yaml'), encoding='utf-8'))
D = P['job_search']['discovery']
HOURS = P['job_search']['freshness'].get('max_age_hours', 24)
now = dt.datetime.now(dt.timezone.utc)
CUT = now - dt.timedelta(hours=HOURS)
T = D.get('request_timeout_seconds', 20)
H = {'User-Agent': 'Mozilla/5.0'}
OUT = sys.argv[1]
UPDATE = '--no-snapshot-update' not in sys.argv


def strip(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


ID_PARAMS = ('gh_jid', 'jobid', 'job_id', 'jid', 'jk', 'id')  # some career sites keep the job id only in the query


def norm(u):
    s = urlsplit(u or '')
    ids = sorted(f'{k}={v}' for k, v in parse_qsl(s.query) if k.lower() in ID_PARAMS)
    return (s.netloc.lower() + s.path).rstrip('/') + ('?' + '&'.join(ids) if ids else '')


def pdt(v):
    if v is None or v == '':
        return None
    try:
        if isinstance(v, (int, float)):
            if v > 1e11:
                v /= 1000
            return dt.datetime.fromtimestamp(v, dt.timezone.utc)
        d = dt.datetime.fromisoformat(str(v).replace('Z', '+00:00'))
        return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)
    except Exception:
        return None


boards = {}
JSONCFG = {}  # ats: json target companies, keyed by token
for src in (D['ats_apis']['boards'], D['ats_apis']['boards_verified']):
    for prov, toks in src.items():
        if prov == 'workday':  # entries are dicts; token becomes tenant/wd/site
            boards.setdefault(prov, set()).update(f"{w['tenant']}/{w['wd']}/{w['site']}" for w in toks or [])
        else:
            boards.setdefault(prov, set()).update(toks)
for c in D['target_companies']['companies']:
    if c['ats'] in ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee', 'personio'):
        boards.setdefault(c['ats'], set()).add(c['token'])
    elif c['ats'] == 'workday':
        boards.setdefault('workday', set()).add(f"{c['tenant']}/{c['wd']}/{c['site']}")
    elif c['ats'] == 'json':
        boards.setdefault('json', set()).add(c['token'])
        JSONCFG[c['token']] = c

log = []


def get(url, **kw):
    h = {**H, **kw.pop("headers", {})}
    return requests.get(url, headers=h, timeout=T, **kw)


def do(prov, tok):
    out = []
    try:
        if prov == 'greenhouse':
            r = get(f'https://boards-api.greenhouse.io/v1/boards/{tok}/jobs?content=true'); r.raise_for_status()
            for j in r.json()['jobs']:
                out.append(dict(title=j['title'], loc=(j.get('location') or {}).get('name', ''), date=pdt(j.get('first_published') or j.get('updated_at')),
                                link=j['absolute_url'], desc=strip(j.get('content'))))
        elif prov == 'lever':
            r = get(f'https://api.lever.co/v0/postings/{tok}?mode=json'); r.raise_for_status()
            for j in r.json():
                out.append(dict(title=j['text'], loc=(j.get('categories') or {}).get('location', ''), date=pdt(j.get('createdAt')), link=j['hostedUrl'],
                                desc=j.get('descriptionPlain', '') + ' ' + ' '.join(l.get('text', '') + ' ' + strip(l.get('content')) for l in j.get('lists', []))))
        elif prov == 'ashby':
            r = get(f'https://api.ashbyhq.com/posting-api/job-board/{tok}'); r.raise_for_status()
            for j in r.json()['jobs']:
                out.append(dict(title=j['title'], loc=j.get('location', '') + ' ' + ' '.join(s.get('location', '') for s in j.get('secondaryLocations', [])),
                                date=pdt(j.get('publishedAt')), link=j['jobUrl'], desc=j.get('descriptionPlain') or strip(j.get('descriptionHtml'))))
        elif prov == 'smartrecruiters':
            off = 0
            while off < 3000:  # full listing: some companies (Delivery Hero) have 900+ postings
                r = get(f'https://api.smartrecruiters.com/v1/companies/{tok}/postings?limit=100&offset={off}'); r.raise_for_status()
                js = r.json().get('content', [])
                for j in js:
                    l = j.get('location', {})
                    out.append(dict(title=j['name'], loc=f"{l.get('city','')}, {l.get('country','')}", date=pdt(j.get('releasedDate')),
                                    link=f"https://jobs.smartrecruiters.com/{j['company']['identifier']}/{j['id']}", desc='', ref=j.get('ref')))
                if len(js) < 100:
                    break
                off += 100
        elif prov == 'workable':
            r = get(f'https://apply.workable.com/api/v1/widget/accounts/{tok}?details=true'); r.raise_for_status()
            for j in r.json().get('jobs', []):
                out.append(dict(title=j['title'], loc=f"{j.get('city','')}, {j.get('country','')}", date=pdt(j.get('published_on') or j.get('created_at')),
                                link=j.get('url'), desc=strip(j.get('description'))))
        elif prov == 'recruitee':
            r = get(f'https://{tok}.recruitee.com/api/offers/'); r.raise_for_status()
            for j in r.json().get('offers', []):
                out.append(dict(title=j['title'], loc=j.get('location', ''), date=pdt(j.get('published_at')), link=j.get('careers_url'), desc=strip(j.get('description'))))
        elif prov == 'personio':
            r = get(f'https://{tok}.jobs.personio.de/xml'); r.raise_for_status()
            for p in ET.fromstring(r.content).iter('position'):
                g = lambda k: (p.findtext(k) or '')
                out.append(dict(title=g('name'), loc=g('office'), date=pdt(g('createdAt')), link=f"https://{tok}.jobs.personio.de/job/{g('id')}",
                                desc=' '.join(strip(x.findtext('value')) for x in p.iter('jobDescription'))))
        elif prov == 'workday':  # CXS API; postedOn is only "Posted 3 Days Ago", so newness comes from the snapshot
            tenant, wd, site = tok.split('/')
            base = f'https://{tenant}.{wd}.myworkdayjobs.com'
            off, total = 0, 1
            while off < min(total, 2000):
                r = requests.post(f'{base}/wday/cxs/{tenant}/{site}/jobs', json={'appliedFacets': {}, 'limit': 20, 'offset': off, 'searchText': ''},
                                  headers={**H, 'Accept': 'application/json'}, timeout=T); r.raise_for_status()
                js = r.json()
                if off == 0:  # Workday only reports the total on the first page
                    total = js.get('total', 0)
                for j in js.get('jobPostings', []):
                    posted = (j.get('postedOn') or '').lower()
                    days = 0 if 'today' in posted else 1 if 'yesterday' in posted else int(m.group(1)) if (m := re.search(r'(\d+)\+? days', posted)) else None
                    out.append(dict(title=j['title'], loc=j.get('locationsText', ''), link=f"{base}/en-US/{site}{j['externalPath']}", desc='',
                                    date=None if days is None else now - dt.timedelta(days=days, hours=12)))
                if not js.get('jobPostings'):
                    break
                off += 20
        elif prov == 'json':  # a company's own careers JSON (fields mapped in the profile)
            c = JSONCFG[tok]
            r = get(c['api_url']); r.raise_for_status()
            pick = lambda j, path: __import__('functools').reduce(lambda a, k: (a or {}).get(k), path.split('.'), j)
            for j in pick(r.json(), c['jobs_path']):
                out.append(dict(title=pick(j, c['title_field']), loc=pick(j, c['location_field']) or '', date=pdt(pick(j, c['date_field'])) if c.get('date_field') else None,
                                link=c['link_template'].format(**j), desc=''))
    except Exception as e:
        log.append(f'{prov}:{tok} {type(e).__name__}')
        return prov, tok, None
    for o in out:
        o['company'] = JSONCFG[tok]['name'] if prov == 'json' else tok.split('/')[0]
        o['source'] = 'Careers site' if prov == 'json' else prov.capitalize()
    return prov, tok, out


tasks = [(p, t) for p, ts in boards.items() for t in ts]
results = {}
with ThreadPoolExecutor(D.get('max_parallel_requests', 10)) as ex:
    for prov, tok, out in ex.map(lambda a: do(*a), tasks):
        if out is not None:
            results[f'{prov}:{tok}'] = out

# ---- snapshot diff -------------------------------------------------------
snap = {'companies': {}}
if os.path.exists(SNAP):
    try:
        snap = json.load(open(SNAP, encoding='utf-8'))
    except Exception:
        log.append('snapshot unreadable, treating all boards as baseline')
comp = snap.setdefault('companies', {})
baseline, anomalies, new_by_company = [], [], {}
nowiso = now.isoformat()
window = dt.timedelta(hours=HOURS)
jobs = []
for key, out in results.items():
    prev = comp.get(key)
    cur = {norm(o['link']): o for o in out if o.get('link')}
    flagged, anomaly = {}, False
    if prev is None:
        baseline.append(key)
    else:
        pj = prev['jobs']
        new_urls = [u for u in cur if u not in pj]
        if len(out) and len(new_urls) > max(30, 0.5 * len(out)):
            anomalies.append(f'{key}: {len(new_urls)}/{len(out)} new, ignoring (id scheme change?)')
            anomaly = True
        else:
            for u in new_urls:
                flagged[u] = nowiso
        for u, meta in pj.items():  # jobs first seen inside the window still count as new
            fs = pdt(meta.get('first_seen'))
            if u in cur and fs and now - fs <= window:
                flagged[u] = meta['first_seen']
    for u, o in cur.items():
        o['new_id'] = u in flagged
        jobs.append(o)
    if flagged:
        new_by_company[key] = len(flagged)
    # new snapshot entry (only for boards that returned jobs)
    if out:
        old = prev['jobs'] if prev else {}
        # first_seen stays None for jobs present at baseline or in an ignored anomaly burst (age unknown, never "new" by window)
        comp[key] = {'last_scan': nowiso, 'jobs': {u: {'title': o['title'], 'loc': o['loc'].strip(),
                     'first_seen': old[u].get('first_seen') if u in old else (nowiso if prev is not None and not anomaly else None)} for u, o in cur.items()}}

# ---- Tier 3 (no company snapshot; date only) ---------------------------------
try:
    for pg in range(1, 6):
        r = get(f'https://www.arbeitnow.com/api/job-board-api?page={pg}'); r.raise_for_status()
        for j in r.json()['data']:
            jobs.append(dict(title=j['title'], company=j['company_name'], loc=j.get('location', ''), date=pdt(j['created_at']), link=j['url'],
                             desc=strip(j.get('description')), source='Arbeitnow', new_id=False))
except Exception as e:
    log.append('arbeitnow ' + str(e))
try:
    r = get('https://justjoin.it/api/candidate-api/offers', headers={**H, 'Version': '2'}); r.raise_for_status()
    for j in r.json().get('data', []):
        jobs.append(dict(title=j['title'], company=j['companyName'], loc=j.get('city', ''), date=pdt(j.get('publishedAt')),
                         link='https://justjoin.it/job-offer/' + j['slug'], desc='', source='JustJoinIT', new_id=False))
except Exception as e:
    log.append('justjoin ' + str(e))



def adzuna_creds():
    """ADZUNA_APP_ID / ADZUNA_APP_KEY from env, else from .claude/settings.local.json (env loads only at Claude Code start)."""
    ids = {k: os.environ.get(k) for k in ('ADZUNA_APP_ID', 'ADZUNA_APP_KEY')}
    if not all(ids.values()):
        try:
            env = json.load(open(os.path.join(ROOT, '.claude', 'settings.local.json'), encoding='utf-8')).get('env', {})
            ids = {k: ids[k] or env.get(k) for k in ids}
        except Exception:
            pass
    return ids if all(ids.values()) else None


adz = next((s for s in D['eu_open_api']['sources'] if s['name'] == 'Adzuna'), None)
if D['eu_open_api'].get('enabled', True) and adz and adz.get('enabled'):
    creds = adzuna_creds()
    if not creds:
        log.append('adzuna: ADZUNA_APP_ID / ADZUNA_APP_KEY not set')
    else:
        n_adz, adz_seen = 0, set()  # the same ad comes back for several queries
        for country, cc in adz['countries'].items():
            for q in adz.get('queries') or D['search_queries']:
                for pg in range(1, adz.get('max_pages', 1) + 1):
                    try:
                        r = get(adz['url'].format(country_code=cc, page=pg, query=requests.utils.quote(q), **creds)); r.raise_for_status()
                    except Exception as e:
                        log.append(f'adzuna {cc} "{q}" {type(e).__name__}')
                        break
                    res = r.json().get('results', [])
                    for j in res:
                        if norm(j.get('redirect_url')) in adz_seen:
                            continue
                        adz_seen.add(norm(j.get('redirect_url')))
                        jobs.append(dict(title=strip(j.get('title')), company=(j.get('company') or {}).get('display_name', ''),
                                         loc=f"{(j.get('location') or {}).get('display_name', '')}, {country}", date=pdt(j.get('created')),
                                         link=j.get('redirect_url', ''), desc=strip(j.get('description')), source='Adzuna', new_id=False))
                    n_adz = len(adz_seen)
                    if len(res) < 50:
                        break
        print(f'adzuna: {n_adz} jobs', file=sys.stderr)

fresh = [j for j in jobs if (j['date'] and j['date'] >= CUT) or j['new_id']]
for j in fresh:
    j['why'] = 'new_id' if j['new_id'] and not (j['date'] and j['date'] >= CUT) else 'date'
    j['date'] = j['date'].isoformat() if j['date'] else None
json.dump(dict(jobs=fresh, log=log), open(OUT, 'w'))

if UPDATE:
    os.makedirs(os.path.dirname(SNAP), exist_ok=True)
    json.dump(snap, open(SNAP, 'w', encoding='utf-8'))

print(f'boards ok {len(results)}/{len(tasks)} | jobs {len(jobs)} | fresh {len(fresh)} '
      f'(by new-id only: {sum(j["why"]=="new_id" for j in fresh)}) | baseline boards {len(baseline)} | failed {len(log)}', file=sys.stderr)
if new_by_company:
    print('new IDs:', dict(sorted(new_by_company.items(), key=lambda x: -x[1])[:15]), file=sys.stderr)
for a in anomalies:
    print('ANOMALY', a, file=sys.stderr)
