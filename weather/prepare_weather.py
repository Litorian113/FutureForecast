#!/usr/bin/env python3
"""
Download the ERA5 hourly history (Open-Meteo archive API) for the seven backtest cities and
write weather/data/<CITY>.csv with columns ts, temp, rh, precip, cloud, wind, pressure, code
(local time, complete hourly index, gaps <= 3 h linearly interpolated, weather_code forward-filled).

  .venv/bin/python weather/prepare_weather.py                  # 2014-01-01 .. today - 5 days
  .venv/bin/python weather/prepare_weather.py --cities Berlin  # one city
  .venv/bin/python weather/prepare_weather.py --start 2020-01-01

Downloads are cached per calendar year in weather/data/cache, so a re-run only fetches the
current (incomplete) year. Prints a sanity report per city (range, gaps, min/max, diurnal and
annual amplitude of the temperature).
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from openmeteo import CITIES, COLS, HOURLY_VARS, archive  # noqa: E402

DATA_DIR = os.path.join(HERE, "data")
MAX_GAP = 3


def fetch_city(lat: float, lon: float, start: str, end: str) -> pd.DataFrame:
    """One archive request per calendar year (cacheable, ~0.6 MB each), concatenated."""
    frames = []
    y0, y1 = int(start[:4]), int(end[:4])
    for y in range(y0, y1 + 1):
        s = start if y == y0 else f"{y}-01-01"
        e = end if y == y1 else f"{y}-12-31"
        d = archive(lat, lon, s, e, HOURLY_VARS)
        h = d["hourly"]
        df = pd.DataFrame({c: h[v] for v, c in zip(HOURLY_VARS, COLS)}, index=pd.DatetimeIndex(pd.to_datetime(h["time"])))
        frames.append(df)
        print(f"   {y}: {len(df)} h, tz {d['timezone']}", flush=True)
    df = pd.concat(frames)
    df = df[~df.index.duplicated(keep="first")].sort_index()
    return df


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    full = pd.date_range(df.index[0], df.index[-1], freq="h")
    df = df.reindex(full)
    info = {"hours": len(full)}
    # drop trailing rows where everything is NaN (archive lag)
    last_ok = df["temp"].last_valid_index()
    df = df.loc[:last_ok]
    info["missing_before"] = int(df["temp"].isna().sum())
    num = [c for c in COLS if c != "code"]
    # longest gap
    isna = df["temp"].isna().to_numpy()
    longest = 0
    run = 0
    for v in isna:
        run = run + 1 if v else 0
        longest = max(longest, run)
    info["longest_gap_h"] = int(longest)
    df[num] = df[num].interpolate(limit=MAX_GAP, limit_area="inside")
    df["code"] = df["code"].ffill(limit=MAX_GAP)
    info["missing_after"] = int(df["temp"].isna().sum())
    return df, info


def report(name: str, df: pd.DataFrame, info: dict) -> None:
    t = df["temp"]
    daily_amp = (t.resample("D").max() - t.resample("D").min()).mean()
    monthly = t.resample("ME").mean()
    annual_amp = monthly.max() - monthly.min()
    print(f"   {name}: {df.index[0]} .. {df.index[-1]}  ({info['hours']:,} h, missing {info['missing_before']} -> "
          f"{info['missing_after']}, longest gap {info['longest_gap_h']} h)")
    print(f"      temp min {t.min():5.1f}  max {t.max():5.1f}  mean {t.mean():5.1f}  "
          f"diurnal amplitude {daily_amp:4.1f} K  annual amplitude {annual_amp:4.1f} K  "
          f"rain h/yr {(df['precip'] > 0.1).mean() * 8760:.0f}  mean cloud {df['cloud'].mean():.0f} %")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--cities", nargs="*", default=list(CITIES))
    p.add_argument("--start", default="2014-01-01")
    p.add_argument("--end", default=(dt.date.today() - dt.timedelta(days=5)).isoformat())
    a = p.parse_args()
    os.makedirs(DATA_DIR, exist_ok=True)
    for name in a.cities:
        lat, lon = CITIES[name]
        print(f"-- {name} ({lat}, {lon})", flush=True)
        df = fetch_city(lat, lon, a.start, a.end)
        df, info = clean(df)
        out = df.reset_index().rename(columns={"index": "ts"})
        out["ts"] = out["ts"].dt.strftime("%Y-%m-%dT%H:%M")
        path = os.path.join(DATA_DIR, f"{name}.csv")
        out.to_csv(path, index=False, float_format="%.1f")
        report(name, df, info)
        print(f"   wrote {path} ({os.path.getsize(path) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
