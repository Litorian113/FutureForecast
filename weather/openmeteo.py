"""
Small Open-Meteo client with a disk cache (weather/data/cache/<lat>_<lon>_<endpoint>_<hash>.json).

Every call is keyed by endpoint + parameters, so backtests are reproducible and never re-download.
No API key, fair-use limit ~10 000 requests/day. All times are LOCAL time (timezone=auto).

    from openmeteo import geocode, archive, forecast, previous_runs
    archive(52.52, 13.41, "2024-01-01", "2024-01-31", ["temperature_2m"])   -> dict (raw JSON)

`refresh=True` bypasses the cache (used by the daily forecast archiver, whose answer changes).
"""
from __future__ import annotations

import hashlib
import json
import os
import time

import httpx

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, "data", "cache")

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
PREVIOUS_URL = "https://previous-runs-api.open-meteo.com/v1/forecast"

HOURLY_VARS = ["temperature_2m", "relative_humidity_2m", "precipitation", "cloud_cover",
               "wind_speed_10m", "surface_pressure", "weather_code"]
# column names used in the CSVs / JSON, in the same order
COLS = ["temp", "rh", "precip", "cloud", "wind", "pressure", "code"]
VAR2COL = dict(zip(HOURLY_VARS, COLS))
COL2VAR = dict(zip(COLS, HOURLY_VARS))


def _cache_path(endpoint: str, params: dict) -> str:
    key = json.dumps(params, sort_keys=True, separators=(",", ":"))
    h = hashlib.sha1(key.encode()).hexdigest()[:12]
    lat = params.get("latitude", "x")
    lon = params.get("longitude", "x")
    return os.path.join(CACHE_DIR, f"{lat}_{lon}_{endpoint}_{h}.json")


def _get(url: str, endpoint: str, params: dict, refresh: bool = False, retries: int = 6) -> dict:
    path = _cache_path(endpoint, params)
    if not refresh and os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    last = None
    for attempt in range(retries):
        try:
            r = httpx.get(url, params=params, timeout=60)
            if r.status_code == 429:  # fair-use limit: back off hard, the minute window resets
                last = RuntimeError("HTTP 429 rate limited")
                time.sleep(20 * (attempt + 1))
                continue
            r.raise_for_status()
            d = r.json()
            if "error" in d and d.get("error"):
                raise RuntimeError(f"open-meteo: {d.get('reason')}")
            os.makedirs(CACHE_DIR, exist_ok=True)
            tmp = path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(d, f, separators=(",", ":"))
            os.replace(tmp, path)
            return d
        except (httpx.HTTPError, ValueError) as e:  # network / JSON hiccup
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"open-meteo {endpoint} failed after {retries} tries: {last}")


def geocode(name: str, count: int = 6, language: str = "en", refresh: bool = False) -> list[dict]:
    """City name -> list of {name, country, admin1, latitude, longitude, timezone}."""
    d = _get(GEOCODE_URL, "geocode", {"name": name, "count": count, "language": language, "format": "json"}, refresh)
    return d.get("results", [])


def archive(lat: float, lon: float, start: str, end: str, variables: list[str] | None = None,
            refresh: bool = False) -> dict:
    """ERA5 reanalysis, hourly, local time. Lags ~5 days behind real time."""
    params = {"latitude": round(lat, 4), "longitude": round(lon, 4), "start_date": start, "end_date": end,
              "hourly": ",".join(variables or HOURLY_VARS), "timezone": "auto"}
    return _get(ARCHIVE_URL, "archive", params, refresh)


def forecast(lat: float, lon: float, past_days: int = 92, forecast_days: int = 7,
             variables: list[str] | None = None, model: str | None = None, refresh: bool = False) -> dict:
    """Real-time endpoint: `past_days` of recent observations/analysis + `forecast_days` of NWP forecast."""
    params = {"latitude": round(lat, 4), "longitude": round(lon, 4), "past_days": past_days,
              "forecast_days": forecast_days, "hourly": ",".join(variables or HOURLY_VARS), "timezone": "auto"}
    if model:
        params["models"] = model
    return _get(FORECAST_URL, "forecast", params, refresh)


def previous_runs(lat: float, lon: float, start: str, end: str, variables: list[str] | None = None,
                  leads: range | list[int] = range(1, 8), model: str | None = None, refresh: bool = False) -> dict:
    """Archived model runs: `<var>_previous_dayN` = value forecast N days earlier for that hour."""
    variables = variables or ["temperature_2m"]
    hourly = ",".join(f"{v}_previous_day{n}" for v in variables for n in leads)
    params = {"latitude": round(lat, 4), "longitude": round(lon, 4), "start_date": start, "end_date": end,
              "hourly": hourly, "timezone": "auto"}
    if model:
        params["models"] = model
    return _get(PREVIOUS_URL, "previous_runs", params, refresh)


CITIES = {
    # name: (lat, lon) - the seven backtest cities, coordinates from the Open-Meteo geocoder
    "Berlin": (52.52, 13.41),
    "Reykjavik": (64.1355, -21.8954),
    "Phoenix": (33.4484, -112.074),
    "Singapore": (1.2897, 103.8501),
    "CapeTown": (-33.9258, 18.4232),
    "Denver": (39.7392, -104.9847),
    "Tokyo": (35.6895, 139.6917),
}
