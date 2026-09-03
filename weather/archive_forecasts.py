#!/usr/bin/env python3
"""
Daily archiver of the live Open-Meteo 7-day forecast for the seven backtest cities.
Meant for cron (06:00 local): appends one JSON file per city and day to
weather/data/forecast_archive/<CITY>/<YYYY-MM-DD>.json (all hourly variables, 168 h, local time).

  .venv/bin/python weather/archive_forecasts.py            # today's runs
  .venv/bin/python weather/archive_forecasts.py --model ecmwf_ifs025

This is the belt-and-braces fallback for the previous-runs API (which already reaches back to
2022 for temperature): it stores the full variable set including weather_code, which the
previous-runs endpoint does not archive for every model.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from openmeteo import CITIES, HOURLY_VARS, forecast  # noqa: E402

OUT = os.path.join(HERE, "data", "forecast_archive")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model", default=None, help="Open-Meteo model id, default best_match")
    a = p.parse_args()
    today = dt.date.today().isoformat()
    for name, (lat, lon) in CITIES.items():
        d = forecast(lat, lon, past_days=1, forecast_days=8, variables=HOURLY_VARS, model=a.model, refresh=True)
        folder = os.path.join(OUT, name + (f"_{a.model}" if a.model else ""))
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, f"{today}.json")
        with open(path, "w") as f:
            json.dump({"fetched": dt.datetime.now().isoformat(timespec="seconds"), "model": a.model or "best_match",
                       "timezone": d["timezone"], "hourly": d["hourly"]}, f, separators=(",", ":"))
        print(f"{name}: {len(d['hourly']['time'])} h -> {path}")


if __name__ == "__main__":
    main()
