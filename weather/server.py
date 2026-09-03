#!/usr/bin/env python3
"""
Live forecast server for the page: TimesFM 3.0 from the last 92 days of a location's hourly
history (Open-Meteo real-time endpoint) next to the numerical weather model Open-Meteo serves.

  .venv/bin/python weather/server.py            # http://localhost:8000, vite proxies /api here

  GET /api/geocode?q=Berl                 -> up to 6 geocoder hits
  GET /api/forecast?lat=52.52&lon=13.41   -> hourly TimesFM (mean, q10, q90 for temp, precip,
                                             cloud, rh, wind) + NWP hourly, 7 daily cards for both,
                                             336 h of history and the expected error per lead day
                                             from the backtest of the climatically closest test city.

Results are cached in memory per (lat, lon rounded to 2 decimals, hour). The model is loaded
once at start-up (about 5 s).
"""
from __future__ import annotations

import json
import os
import sys
import time

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import torch_compat  # noqa: E402,F401
from openmeteo import CITIES, COLS, HOURLY_VARS, archive, forecast, geocode  # noqa: E402
from symbols import CLASSES, RAIN_DAY_MM, class_from_code_block, code_to_class, symbol_from_means  # noqa: E402
import models_timesfm  # noqa: E402

HORIZON = 168
HISTORY = 336
CONTEXT = models_timesfm.CONTEXT
BACKTEST = os.path.join(ROOT, "public", "data", "backtest.json")

app = FastAPI(title="FutureWeather")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_cache: dict[tuple, dict] = {}
_backtest: dict | None = None
_backtest_mtime = 0.0
_signatures: dict[str, dict] | None = None


def backtest() -> dict | None:
    """public/data/backtest.json, re-read whenever the file changes (the backtest may run while the server is up)."""
    global _backtest, _backtest_mtime
    if not os.path.exists(BACKTEST):
        return None
    mtime = os.path.getmtime(BACKTEST)
    if _backtest is None or mtime != _backtest_mtime:
        _backtest = json.load(open(BACKTEST))
        _backtest_mtime = mtime
        _cache.clear()
    return _backtest


SIG_YEAR = 2025


def _signature(df: pd.DataFrame, lat: float) -> dict:
    t = df["temp"]
    monthly = t.groupby(t.index.month).mean()
    return {"mean": float(t.mean()), "annual": float(monthly.max() - monthly.min()),
            "diurnal": float((t.resample("D").max() - t.resample("D").min()).mean()),
            "pers": float((t - t.shift(24)).abs().mean()), "rain": float((df["precip"] > 0.1).mean()), "lat": abs(lat)}


def city_signatures() -> dict[str, dict]:
    """Climate signature of every test city from one year (SIG_YEAR) of its ERA5 file."""
    global _signatures
    if _signatures is None:
        _signatures = {}
        for name, (lat, lon) in CITIES.items():
            path = os.path.join(HERE, "data", f"{name}.csv")
            if os.path.exists(path):
                df = pd.read_csv(path, parse_dates=["ts"]).set_index("ts")
                _signatures[name] = _signature(df[df.index.year == SIG_YEAR], lat)
    return _signatures


def closest_city(lat: float, lon: float) -> str:
    """Test city with the most similar ERA5 signature (mean temperature, annual and diurnal amplitude,
    day-to-day change, share of rainy hours, |latitude|) over the same year. One cached archive request."""
    sig = city_signatures()
    if not sig:
        return "Berlin"
    d = archive(lat, lon, f"{SIG_YEAR}-01-01", f"{SIG_YEAR}-12-31", ["temperature_2m", "precipitation"])
    h = d["hourly"]
    df = pd.DataFrame({"temp": h["temperature_2m"], "precip": h["precipitation"]}, index=pd.DatetimeIndex(pd.to_datetime(h["time"]))).astype(float)
    me = _signature(df, lat)
    scale = {"mean": 4, "annual": 5, "diurnal": 2.5, "pers": 0.5, "rain": 0.06, "lat": 25}
    return min(sig, key=lambda n: sum(((me[k] - sig[n][k]) / sc) ** 2 for k, sc in scale.items()))


def expected_error(city: str) -> dict | None:
    bt = backtest()
    if bt is None or city not in bt.get("byCity", {}):
        return None
    models = bt["byCity"][city]["models"]
    return {"city": city, "year": bt["meta"]["year"], "cutoffs": bt["byCity"][city]["cutoffs"],
            "byLead": {m: v["byLead"] for m, v in models.items()},
            "skill": {m: v["skill"] for m, v in models.items()},
            "symbolHit": {m: v["symbolHit"] for m, v in models.items()},
            "coverage80": {m: v["coverage80"] for m, v in models.items()}}


def r1(a):
    return [None if not np.isfinite(v) else round(float(v), 1) for v in np.asarray(a, dtype=float)]


def daily_cards(obs: pd.DataFrame, fc: pd.DataFrame, precip_q: np.ndarray | None, ndays: int = 7) -> list[dict]:
    """Calendar-day cards. Today mixes the observed hours with the remaining forecast hours; the other
    days are pure forecast. precip_q (len(fc), 9): quantile paths of the forecast precipitation (TimesFM);
    None means a deterministic forecast (NWP), whose rain-day flag comes from the daily sum. The symbol
    comes from the NWP weather_code when fc has a `code` column, otherwise from the rule set."""
    both = pd.concat([obs, fc])
    both = both[~both.index.duplicated(keep="last")]
    n_obs = len(obs)
    q_all = None
    if precip_q is not None:
        q_all = np.concatenate([np.repeat(obs["precip"].to_numpy()[:, None], 9, axis=1), np.clip(precip_q, 0, None)])
    out = []
    today = fc.index[0].normalize()
    for d in range(ndays):
        day = today + pd.Timedelta(days=d)
        sel = (both.index >= day) & (both.index < day + pd.Timedelta(days=1))
        blk = both[sel]
        if blk.empty:
            break
        pos = np.where(sel)[0]
        if q_all is not None:
            p_rain = float((q_all[pos].sum(0) >= RAIN_DAY_MM).mean())
        else:
            p_rain = float(blk["precip"].sum() >= RAIN_DAY_MM)
        if "code" in fc and "code" in blk and blk["code"].notna().all():
            icon = int(class_from_code_block(code_to_class(blk["code"].to_numpy())))
        else:
            icon = int(symbol_from_means(blk["temp"].mean(), blk["cloud"].mean(), blk["rh"].mean(), blk["wind"].mean(), p_rain))
        out.append({"date": day.strftime("%Y-%m-%d"), "tmin": round(float(blk["temp"].min()), 1), "tmax": round(float(blk["temp"].max()), 1),
                    "precip": round(float(blk["precip"].sum()), 1), "pRain": round(p_rain, 2),
                    "icon": CLASSES[icon] if icon >= 0 else None, "observedHours": int((pos < n_obs).sum())})
    return out


@app.get("/api/geocode")
def api_geocode(q: str = Query(min_length=1)):
    hits = geocode(q, count=6)
    return [{"name": h["name"], "country": h.get("country"), "admin1": h.get("admin1"), "lat": h["latitude"], "lon": h["longitude"],
             "tz": h.get("timezone")} for h in hits]


@app.get("/api/forecast")
def api_forecast(lat: float, lon: float, name: str | None = None, country: str | None = None):
    key = (round(lat, 2), round(lon, 2), time.strftime("%Y-%m-%dT%H"))
    if key in _cache:
        return _cache[key]
    t0 = time.time()
    d = forecast(lat, lon, past_days=92, forecast_days=8, variables=HOURLY_VARS, refresh=True)
    h = d["hourly"]
    df = pd.DataFrame({c: h[v] for v, c in zip(HOURLY_VARS, COLS)}, index=pd.DatetimeIndex(pd.to_datetime(h["time"]))).astype(float)
    # the cutoff: the first hour after "now" in local time; everything before is context (analysis / observations)
    now_local = pd.Timestamp.now(tz=d["timezone"]).tz_localize(None).floor("h")
    cutoff = now_local + pd.Timedelta(hours=1)
    if cutoff not in df.index or len(df.loc[: cutoff - pd.Timedelta(hours=1)]) < 24 * 30:
        raise HTTPException(502, "not enough history from Open-Meteo")
    hist = df.loc[: cutoff - pd.Timedelta(hours=1)].tail(CONTEXT)
    fut = df.loc[cutoff:].head(HORIZON)
    if len(fut) < HORIZON:
        raise HTTPException(502, "NWP horizon incomplete")
    for c in COLS:
        hist[c] = hist[c].interpolate(limit_direction="both")
    ts = fut.index
    # TimesFM: 6-variate context (temp, rh, precip, cloud, wind, pressure)
    hist_dict = {c: hist[c].to_numpy() for c in COLS}
    out = models_timesfm.timesfm_multi([hist_dict], HORIZON, [{"cutoff": cutoff}])[0]
    tf_df = pd.DataFrame({v: out[v]["mean"] for v in ("temp", "rh", "precip", "cloud", "wind")}, index=ts)
    history = hist.tail(HISTORY)
    obs_today = hist[hist.index >= cutoff.normalize()]
    closest = closest_city(lat, lon)
    res = {
        "city": {"name": name or f"{lat:.2f}, {lon:.2f}", "country": country, "tz": d["timezone"], "lat": lat, "lon": lon,
                 "elevation": d.get("elevation")},
        "generated": now_local.strftime("%Y-%m-%dT%H:%M"), "cutoff": cutoff.strftime("%Y-%m-%dT%H:%M"),
        "runtimeMs": 0,
        "current": {"temp": round(float(hist["temp"].iloc[-1]), 1), "code": int(hist["code"].iloc[-1]),
                    "icon": CLASSES[int(code_to_class(hist["code"].iloc[-1]))], "rh": float(hist["rh"].iloc[-1]),
                    "wind": float(hist["wind"].iloc[-1])},
        "hourly": {
            "ts": [t.strftime("%Y-%m-%dT%H:%M") for t in ts],
            "timesfm": {v: {"mean": r1(out[v]["mean"]), "q10": r1(out[v]["q10"]), "q90": r1(out[v]["q90"])} for v in ("temp", "precip", "cloud", "rh", "wind")},
            "nwp": {v: r1(fut[v].to_numpy()) for v in ("temp", "precip", "cloud", "rh", "wind")} | {"code": [int(x) for x in fut["code"].to_numpy()]},
        },
        "daily": {"timesfm": daily_cards(obs_today, tf_df, out["precip"]["q"]),
                  "nwp": daily_cards(obs_today, fut[["temp", "rh", "precip", "cloud", "wind", "code"]], None)},
        "history": {"ts": [t.strftime("%Y-%m-%dT%H:%M") for t in history.index], "temp": r1(history["temp"].to_numpy())},
        "expectedError": expected_error(closest),
        "contextHours": int(len(hist)),
    }
    res["runtimeMs"] = int((time.time() - t0) * 1000)
    _cache[key] = res
    return res


@app.get("/api/health")
def health():
    return {"ok": True, "backtest": backtest() is not None}


if __name__ == "__main__":
    import uvicorn

    models_timesfm.forecaster()  # warm-up
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
