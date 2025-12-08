"""
import_cities.py

Script to create `data/cities.json` from one or more local CSV/JSON city datasets.

Features:
- Supports common CSV formats (SimpleMaps `worldcities.csv`, GeoNames exports) and JSON arrays.
- Auto-detects latitude/longitude and name/country columns.
- Deduplicates by normalized name+country.
- Can produce a combined file prioritizing the most-populous cities.

Usage examples (PowerShell):

# Put downloaded CSV(s) into the `data/` directory, e.g. `data/worldcities.csv` and `data/us_cities.csv`.
python scripts\import_cities.py --sources data/worldcities.csv --max-world 1000 --include-us --out data/cities.json

# If you only have a single world cities CSV and want best 1200 cities:
python scripts\import_cities.py --sources data/worldcities.csv --max-world 1200 --out data/cities.json

If you want me to fetch data for you, allow internet access explicitly and I'll download and prepare the datasets.
"""

import argparse
import csv
import json
import os
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def _normalize(text: str) -> str:
    if text is None:
        return ""
    text = str(text)
    text = unicodedata.normalize("NFKD", text)
    text = "".join([c for c in text if not unicodedata.combining(c)])
    return text.strip().lower()


def detect_columns(headers: List[str]) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str], Optional[str]]:
    """Return (name_col, lat_col, lon_col, country_col, pop_col) if detected"""
    h = [c.lower() for c in headers]
    name_candidates = [c for c in headers if c.lower() in ("city", "name", "city_ascii", "place")]
    lat_candidates = [c for c in headers if c.lower() in ("lat", "latitude")]
    lon_candidates = [c for c in headers if c.lower() in ("lng", "lon", "longitude")]
    country_candidates = [c for c in headers if c.lower() in ("country", "country_name", "countrycode", "country_code")]
    pop_candidates = [c for c in headers if c.lower() in ("population", "pop", "pop2009", "pop2010")]

    name_col = name_candidates[0] if name_candidates else None
    lat_col = lat_candidates[0] if lat_candidates else None
    lon_col = lon_candidates[0] if lon_candidates else None
    country_col = country_candidates[0] if country_candidates else None
    pop_col = pop_candidates[0] if pop_candidates else None
    return name_col, lat_col, lon_col, country_col, pop_col


def read_csv_file(path: Path) -> List[Dict]:
    rows = []
    with path.open("r", encoding="utf-8", errors="replace") as f:
        # sniff dialect
        try:
            sample = f.read(65536)
            f.seek(0)
            dialect = csv.Sniffer().sniff(sample)
        except Exception:
            dialect = csv.excel
            f.seek(0)
        reader = csv.DictReader(f, dialect=dialect)
        for r in reader:
            rows.append(r)
    return rows


def read_json_file(path: Path) -> List[Dict]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    # if object with key 'cities' or similar
    if isinstance(data, dict):
        for k in ("cities", "data", "results"):
            if k in data and isinstance(data[k], list):
                return data[k]
    return []


def extract_entries_from_source(path: Path) -> List[Dict]:
    ext = path.suffix.lower()
    entries = []
    if ext == ".csv":
        rows = read_csv_file(path)
        if not rows:
            return []
        name_col, lat_col, lon_col, country_col, pop_col = detect_columns(list(rows[0].keys()))
        for r in rows:
            name = r.get(name_col) if name_col else (r.get('city') or r.get('name') or r.get('city_ascii'))
            country = r.get(country_col) if country_col else r.get('country') or r.get('admin_name')
            lat = None
            lon = None
            if lat_col and lon_col:
                lat = r.get(lat_col)
                lon = r.get(lon_col)
            else:
                # try common names
                lat = r.get('lat') or r.get('latitude')
                lon = r.get('lng') or r.get('lon') or r.get('longitude')
            pop = None
            if pop_col:
                pop = r.get(pop_col)
            # convert
            try:
                latf = float(lat) if lat not in (None, "") else None
                lonf = float(lon) if lon not in (None, "") else None
            except Exception:
                latf = None
                lonf = None
            entries.append({
                "name": name or "",
                "country": country or "",
                "lat": latf,
                "lng": lonf,
                "population": int(float(pop)) if pop not in (None, "", "NULL") else None,
                "source": str(path.name)
            })
    elif ext in (".json", ".geojson"):
        objs = read_json_file(path)
        for o in objs:
            # try common keys
            name = o.get('city') or o.get('name') or o.get('city_ascii') or o.get('label')
            country = o.get('country') or o.get('country_name') or o.get('admin')
            lat = o.get('lat') or o.get('latitude')
            lon = o.get('lng') or o.get('lon') or o.get('longitude')
            pop = o.get('population') or o.get('pop')
            try:
                latf = float(lat) if lat not in (None, "") else None
                lonf = float(lon) if lon not in (None, "") else None
            except Exception:
                latf = None
                lonf = None
            entries.append({
                "name": name or "",
                "country": country or "",
                "lat": latf,
                "lng": lonf,
                "population": int(float(pop)) if pop not in (None, "", "NULL") else None,
                "source": str(path.name)
            })
    else:
        # unsupported
        return []
    return entries


def build_cities(sources: List[Path], max_world: int = 1000, include_us: bool = True) -> List[Dict]:
    all_entries: List[Dict] = []
    for s in sources:
        if not s.exists():
            print(f"Warning: source {s} not found, skipping")
            continue
        ext = s.suffix.lower()
        print(f"Reading {s}...")
        ents = extract_entries_from_source(s)
        print(f"  -> {len(ents)} entries parsed")
        all_entries.extend(ents)

    # Deduplicate by normalized name + country
    by_key: Dict[Tuple[str, str], Dict] = {}
    usa_entries: List[Dict] = []

    for e in all_entries:
        name = (e.get('name') or '').strip()
        country = (e.get('country') or '').strip()
        if not name or e.get('lat') is None or e.get('lng') is None:
            continue
        key = (_normalize(name), _normalize(country))
        # choose entry with larger population if duplicates
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = e
        else:
            pop_old = existing.get('population') or 0
            pop_new = e.get('population') or 0
            if pop_new > pop_old:
                by_key[key] = e

    # Separate US entries and non-US
    for (n, c), e in by_key.items():
        if c in ("united states", "usa", "us", "united states of america") or (_normalize(e.get('country') or '') in ("united states", "usa", "us")):
            usa_entries.append(e)

    non_us = [e for k, e in by_key.items() if e not in usa_entries]

    # Sort non-US by population desc if available, otherwise by name
    def pop_key(x):
        p = x.get('population')
        return p if p is not None else 0

    non_us_sorted = sorted(non_us, key=lambda x: pop_key(x), reverse=True)
    usa_sorted = sorted(usa_entries, key=lambda x: pop_key(x), reverse=True)

    # Select top world cities up to max_world
    selected_world = non_us_sorted[:max_world]

    # If include_us, include all USA entries after world selection (or you can limit)
    final = selected_world + usa_sorted

    # If we don't have enough (e.g., world list smaller), pad from remaining
    if len(final) < 1200:
        remaining = [e for e in non_us_sorted if e not in selected_world]
        for e in remaining:
            final.append(e)
            if len(final) >= 1200:
                break

    # Trim to 1200 maximum
    final = final[:1200]

    # Normalize final format
    out = []
    for e in final:
        out.append({
            "name": str(e.get('name') or '').strip(),
            "country": str(e.get('country') or '').strip(),
            "lat": float(e.get('lat')),
            "lng": float(e.get('lng')),
            "alt_names": [],
        })
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", nargs="+", required=True, help="Paths to CSV/JSON source files (local)")
    parser.add_argument("--max-world", type=int, default=1000, help="Number of top 'world' cities to include (default 1000)")
    parser.add_argument("--include-us", action="store_true", help="Include all USA entries from sources after world list")
    parser.add_argument("--out", default="data/cities.json", help="Output file path")
    args = parser.parse_args()

    sources = [Path(p) for p in args.sources]
    out_path = Path(args.out)
    cities = build_cities(sources, max_world=args.max_world, include_us=args.include_us)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(cities, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(cities)} cities to {out_path}")


if __name__ == '__main__':
    main()
