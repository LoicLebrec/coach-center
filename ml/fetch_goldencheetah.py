#!/usr/bin/env python3
"""Download ride summaries from the GoldenCheetah OpenData project (OSF 6hfpz).

Each athlete is a ZIP (~20 MB avg, 6.6k athletes, ~128 GB total) holding one
JSON with per-ride METRICS plus raw CSV traces. We only need the JSON, so we
read it with HTTP range requests (remotezip) and skip the traces entirely.

Output: data/gc/<athlete_id>.parquet — one row per ride, selected metrics.
Resumable: athletes already on disk are skipped.

Usage: .venv/bin/python fetch_goldencheetah.py [--limit N] [--workers 6]
"""
import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import pandas as pd
import requests
from remotezip import RemoteZip

OSF_LIST = 'https://api.osf.io/v2/nodes/6hfpz/files/osfstorage/'
OUT = Path(__file__).parent / 'data' / 'gc'
LISTING = Path(__file__).parent / 'data' / 'osf_listing.json'

# Per-ride metrics kept (GoldenCheetah names). Values come as strings or [value, count].
METRICS = [
    'workout_time', 'time_riding', 'total_work', 'average_power', 'coggan_np', 'coggan_if',
    'coggan_tss', 'average_hr', 'athlete_weight', 'elevation_gain', 'cp_setting',
    '5s_critical_power', '1m_critical_power', '5m_critical_power', '20m_critical_power',
    '30m_critical_power',
    *[f'time_in_zone_L{i}' for i in range(1, 8)],
]


def list_files():
    if LISTING.exists():
        return json.loads(LISTING.read_text())
    files, url = [], f'{OSF_LIST}?page%5Bsize%5D=100'
    while url:
        for attempt in range(8):  # OSF API rate-limits (429 / empty body)
            r = requests.get(url, timeout=60, headers={'User-Agent': 'coach-center-research'})
            if r.ok and r.text.strip():
                break
            wait = int(r.headers.get('Retry-After', 0)) or 10 * (attempt + 1)
            print(f'listing throttled (HTTP {r.status_code}), retry in {wait}s', flush=True)
            time.sleep(wait)
        else:
            r.raise_for_status()
        d = r.json()
        files += [{'name': x['attributes']['name'], 'size': x['attributes']['size'],
                   'url': x['links']['download']} for x in d['data'] if x['attributes']['kind'] == 'file']
        url = d['links'].get('next')
        print(f'listing… {len(files)}', flush=True)
    LISTING.parent.mkdir(parents=True, exist_ok=True)
    LISTING.write_text(json.dumps(files))
    return files


def num(v):
    if isinstance(v, list):
        v = v[0] if v else None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def fetch_athlete(f):
    athlete = f['name'].removesuffix('.zip')
    out = OUT / f'{athlete}.parquet'
    if out.exists():
        return athlete, 'skip'
    for attempt in range(5):
        try:
            with RemoteZip(f['url'], timeout=120) as z:
                member = next(i for i in z.infolist() if i.filename.endswith('.json'))
                data = json.loads(z.read(member))
            break
        except json.JSONDecodeError as err:  # corrupt upload — retrying won't help
            return athlete, f'error: {err}'
        except Exception as err:  # network hiccups, OSF throttling (429)
            if attempt == 4:
                return athlete, f'error: {err}'
            time.sleep((60 if '429' in str(err) else 5) * (attempt + 1))
    prof = data.get('ATHLETE', {})
    rows = []
    for ride in data.get('RIDES', []):
        m = ride.get('METRICS', {})
        rows.append({
            'athlete_id': athlete, 'gender': prof.get('gender'), 'yob': prof.get('yob'),
            'date': ride.get('date'), 'sport': ride.get('sport'),
            **{k: num(m.get(k)) for k in METRICS},
        })
    pd.DataFrame(rows).to_parquet(out, index=False)
    return athlete, f'{len(rows)} rides'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=None)
    ap.add_argument('--workers', type=int, default=6)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    files = list_files()[: args.limit]
    print(f'{len(files)} athletes to fetch', flush=True)
    done = 0
    with ThreadPoolExecutor(args.workers) as pool:
        for fut in as_completed(pool.submit(fetch_athlete, f) for f in files):
            athlete, status = fut.result()
            done += 1
            if status != 'skip':
                print(f'[{done}/{len(files)}] {athlete[:8]} {status}', flush=True)


if __name__ == '__main__':
    main()
