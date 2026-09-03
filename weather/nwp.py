"""
Archived numerical-weather-prediction runs from Open-Meteo's previous-runs API, arranged per
lead day: for each city and variable a DataFrame indexed by local hour with columns d1..d7,
where d<k> is the value that the run issued k days earlier predicted for that hour.

    from nwp import load_nwp
    df = load_nwp("Berlin", "2025-01-01", "2026-01-07", ["temp", "precip"], model=None)
    df["temp_d3"]   # 3-day-ahead temperature forecast for each hour

Coverage (checked 2026-09-03, Berlin): best_match / gfs_seamless 2022-01 .. today, all leads;
ecmwf_ifs025 from 2024-02; icon_seamless only leads 1-4. weather_code is archived for best_match
and gfs/icon, not for ecmwf.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from openmeteo import CITIES, COL2VAR, previous_runs  # noqa: E402

LEADS = list(range(1, 8))


def load_nwp(city: str, start: str, end: str, cols: list[str], model: str | None = None) -> pd.DataFrame:
    lat, lon = CITIES[city]
    frames = []
    for col in cols:  # one request per variable keeps each response < 1 MB
        d = previous_runs(lat, lon, start, end, [COL2VAR[col]], leads=LEADS, model=model)
        h = d["hourly"]
        idx = pd.DatetimeIndex(pd.to_datetime(h["time"]))
        data = {f"{col}_d{k}": np.array(h[f"{COL2VAR[col]}_previous_day{k}"], dtype=float) for k in LEADS}
        frames.append(pd.DataFrame(data, index=idx))
    return pd.concat(frames, axis=1)


def assemble(df: pd.DataFrame, col: str, cutoff: pd.Timestamp, horizon: int) -> np.ndarray:
    """One 'issued at the cutoff' forecast: hours of day k after the cutoff come from d<k+1>."""
    out = np.full(horizon, np.nan)
    hours = cutoff + pd.to_timedelta(np.arange(horizon), "h")
    days = ((hours - cutoff.normalize()) / pd.Timedelta(days=1)).astype(int).to_numpy()
    for k in np.unique(days):
        lead = int(k) + 1
        if lead > 7:
            continue
        sel = days == k
        key = f"{col}_d{lead}"
        out[sel] = df[key].reindex(hours[sel]).to_numpy()
    return out


if __name__ == "__main__":
    # download / cache the archive for all seven cities (run once before the backtest)
    import argparse

    p = argparse.ArgumentParser(description="download previous-runs archive into the cache")
    p.add_argument("--start", default="2025-01-01")
    p.add_argument("--end", default="2026-01-07")
    p.add_argument("--cities", nargs="*", default=list(CITIES))
    a = p.parse_args()
    for c in a.cities:
        df = load_nwp(c, a.start, a.end, ["temp", "precip", "cloud", "rh", "wind", "code"], model=None)
        ok = {k: int(df[k].notna().sum()) for k in ["temp_d1", "temp_d7", "code_d1", "code_d7"]}
        print(f"{c:10s} best_match {len(df)} h  {ok}", flush=True)
        df = load_nwp(c, a.start, a.end, ["temp"], model="ecmwf_ifs025")
        print(f"{c:10s} ecmwf      {len(df)} h  temp_d1 {int(df['temp_d1'].notna().sum())} temp_d7 {int(df['temp_d7'].notna().sum())}", flush=True)
