"""
Baselines for the hourly-weather backtest. Every model is a per-cutoff function

    fn(hist: dict[str, np.ndarray], horizon: int, aux: dict) -> dict

hist holds the variables (temp, rh, precip, cloud, wind, pressure, code) BEFORE the cutoff, aux
holds {"cutoff", "city", "clim": Climatology, "tau", "nwp", "nwp_ecmwf"}. The result maps each
forecast variable to {"mean", "q10", "q90"} (horizon,) and may add "pRain" (7,) and "icon" (7,).
Bands are empirical quantiles of the method's own PAST out-of-sample errors per lead day
(no in-sample residuals, no future data).

  persistence   same hour yesterday, repeated; band from lag-24·d errors of the last 8 weeks
  naive_week    same hour last week; band from lag-168 errors of the last 8 weeks
  climatology   mean of the same hour on the same day of year ± 7 days over the years before the
                test year; band = empirical 10/90 % of those values; pRain = rain-day frequency
  blend         clim(t) + (yesterday's anomaly per hour of day) · exp(−h/τ), τ per city fitted on
                the year before the test year; band from 28 earlier origins (out of sample)
  nwp           Open-Meteo best_match model run archived before the cutoff (previous-runs API),
                lead day k from `previous_day<k>`; deterministic, no band
  nwp_ecmwf     the same from ECMWF IFS 0.25°, temperature only
"""
from __future__ import annotations

import json
import os
import warnings

import numpy as np
import pandas as pd
from numpy.lib.stride_tricks import sliding_window_view

from nwp import assemble
from symbols import daily_from_codes, rain_day

warnings.filterwarnings("ignore")

NUMERIC = ["temp", "rh", "precip", "cloud", "wind", "pressure"]
NONNEG = {"rh", "precip", "cloud", "wind"}
RESID_HOURS = 8 * 168  # error sample for the naive bands
BLEND_ORIGINS = range(7, 35)  # out-of-sample origins for the blend band: 7..34 days before the cutoff
TAU_GRID = [6, 12, 18, 24, 36, 48, 72, 96, 144, 240]
HERE = os.path.dirname(os.path.abspath(__file__))


def _clip(var: str, a: np.ndarray) -> np.ndarray:
    if var in NONNEG:
        a = np.maximum(a, 0)
    if var in ("rh", "cloud"):
        a = np.minimum(a, 100)
    return a


def _lead_days(H: int) -> np.ndarray:
    return np.arange(H) // 24 + 1


# ---------------------------------------------------------------- climatology table

class Climatology:
    """(day of year, hour) tables of mean / p10 / p90 of every variable, ± WINDOW days, years < test_year."""

    WINDOW = 7

    def __init__(self, df: pd.DataFrame, test_year: int):
        train = df[df.index.year < test_year]
        years = np.array(sorted(train.index.year.unique()))
        self.years = (int(years[0]), int(years[-1]))
        yi = np.searchsorted(years, train.index.year.to_numpy())
        doy = train.index.dayofyear.to_numpy() - 1
        hod = train.index.hour.to_numpy()
        self.mean, self.q10, self.q90 = {}, {}, {}
        for var in NUMERIC:
            arr = np.full((len(years), 366, 24), np.nan)
            arr[yi, doy, hod] = train[var].to_numpy()
            win = self._window(arr)  # (366, 24, years*15)
            self.mean[var] = np.nanmean(win, axis=-1)
            q = np.nanquantile(win, [0.1, 0.9], axis=-1)
            self.q10[var], self.q90[var] = q[0], q[1]
        daily = train["precip"].resample("D").sum()
        rd = np.full((len(years), 366), np.nan)
        rd[np.searchsorted(years, daily.index.year.to_numpy()), daily.index.dayofyear.to_numpy() - 1] = (daily.to_numpy() >= 1.0)
        self.rain_freq = np.nanmean(self._window(rd), axis=-1)  # (366,)

    @classmethod
    def _window(cls, arr: np.ndarray) -> np.ndarray:
        w = cls.WINDOW
        p = np.concatenate([arr[:, -w:], arr, arr[:, :w]], axis=1)
        sw = sliding_window_view(p, 2 * w + 1, axis=1)  # (years, 366, ..., 15)
        sw = np.moveaxis(sw, 0, -2)  # (366, ..., years, 15)
        return sw.reshape(sw.shape[:-2] + (-1,))

    def series(self, var: str, start: pd.Timestamp, horizon: int):
        idx = start + pd.to_timedelta(np.arange(horizon), "h")
        d, h = idx.dayofyear.to_numpy() - 1, idx.hour.to_numpy()
        return self.mean[var][d, h], self.q10[var][d, h], self.q90[var][d, h]

    def rain_prob(self, start: pd.Timestamp, ndays: int) -> np.ndarray:
        days = start.normalize() + pd.to_timedelta(np.arange(ndays), "D")
        return self.rain_freq[days.dayofyear.to_numpy() - 1]


# ---------------------------------------------------------------- bands

def _band_from_lags(x: np.ndarray, mean: np.ndarray, lag_of_h: np.ndarray, n: int = RESID_HOURS) -> tuple:
    q10, q90 = np.empty_like(mean), np.empty_like(mean)
    for lag in np.unique(lag_of_h):
        r = x[-n:] - x[-n - lag : -lag]
        r = r[np.isfinite(r)]
        lo, hi = np.quantile(r, [0.1, 0.9]) if r.size > 24 else (np.nan, np.nan)
        sel = lag_of_h == lag
        q10[sel], q90[sel] = mean[sel] + lo, mean[sel] + hi
    return q10, q90


def _band_from_residuals(mean: np.ndarray, resid: np.ndarray) -> tuple:
    """resid (k, H) out-of-sample errors -> per-lead-day 10/90 % quantiles added to mean."""
    H = mean.shape[0]
    q10, q90 = np.empty(H), np.empty(H)
    for d in range(H // 24):
        r = resid[:, 24 * d : 24 * (d + 1)].ravel()
        r = r[np.isfinite(r)]
        lo, hi = np.quantile(r, [0.1, 0.9]) if r.size > 24 else (np.nan, np.nan)
        q10[24 * d : 24 * (d + 1)] = mean[24 * d : 24 * (d + 1)] + lo
        q90[24 * d : 24 * (d + 1)] = mean[24 * d : 24 * (d + 1)] + hi
    return q10, q90


# ---------------------------------------------------------------- persistence / naive

def _yesterday_symbol(hist: dict, ndays: int) -> tuple:
    icon = daily_from_codes(hist["code"][-24:])  # (1,)
    p = rain_day(hist["precip"][-24:])
    return np.repeat(icon, ndays), np.repeat(p, ndays)


def persistence(hist: dict, H: int, aux: dict) -> dict:
    lag = 24 * _lead_days(H)
    out = {}
    for var in NUMERIC:
        x = hist[var]
        mean = np.tile(x[-24:], H // 24 + 1)[:H]
        q10, q90 = _band_from_lags(x, mean, lag)
        out[var] = {"mean": mean, "q10": _clip(var, q10), "q90": _clip(var, q90)}
    out["code"] = {"mean": np.tile(hist["code"][-24:], H // 24 + 1)[:H], "q10": None, "q90": None}
    out["icon"], out["pRain"] = _yesterday_symbol(hist, H // 24)
    return out


def naive_week(hist: dict, H: int, aux: dict) -> dict:
    lag = np.full(H, 168)
    out = {}
    for var in NUMERIC:
        x = hist[var]
        mean = np.tile(x[-168:], H // 168 + 1)[:H]
        q10, q90 = _band_from_lags(x, mean, lag)
        out[var] = {"mean": mean, "q10": _clip(var, q10), "q90": _clip(var, q90)}
    codes = np.tile(hist["code"][-168:], H // 168 + 1)[:H]
    out["code"] = {"mean": codes, "q10": None, "q90": None}
    out["icon"] = daily_from_codes(codes)
    out["pRain"] = rain_day(np.tile(hist["precip"][-168:], H // 168 + 1)[:H])
    return out


# ---------------------------------------------------------------- climatology / blend

def climatology(hist: dict, H: int, aux: dict) -> dict:
    clim, c = aux["clim"], aux["cutoff"]
    out = {}
    for var in NUMERIC:
        m, lo, hi = clim.series(var, c, H)
        out[var] = {"mean": m, "q10": lo, "q90": hi}
    out["pRain"] = clim.rain_prob(c, H // 24)
    return out


def _blend_mean(x: np.ndarray, clim: Climatology, var: str, origin: pd.Timestamp, H: int, tau: float) -> np.ndarray:
    m, _, _ = clim.series(var, origin, H)
    my, _, _ = clim.series(var, origin - pd.Timedelta(hours=24), 24)
    anom = x[-24:] - my
    decay = np.exp(-(np.arange(H) + 1) / tau)
    return m + np.tile(anom, H // 24 + 1)[:H] * decay


def blend(hist: dict, H: int, aux: dict) -> dict:
    clim, c, tau = aux["clim"], aux["cutoff"], aux["tau"]
    out = {}
    for var in NUMERIC:
        x = hist[var]
        mean = _blend_mean(x, clim, var, c, H, tau)
        resid = []
        for k in BLEND_ORIGINS:  # earlier origins whose full horizon lies before the cutoff
            n = len(x) - 24 * k
            pred = _blend_mean(x[:n], clim, var, c - pd.Timedelta(days=k), H, tau)
            resid.append(x[n : n + H] - pred)
        q10, q90 = _band_from_residuals(mean, np.stack(resid))
        out[var] = {"mean": _clip(var, mean), "q10": _clip(var, q10), "q90": _clip(var, q90)}
    pc = clim.rain_prob(c, H // 24)
    p0 = clim.rain_prob(c - pd.Timedelta(days=1), 1)[0]
    r_yday = rain_day(hist["precip"][-24:])[0]
    out["pRain"] = np.clip(pc + (r_yday - p0) * np.exp(-24 * np.arange(1, H // 24 + 1) / tau), 0, 1)
    return out


def fit_tau(df: pd.DataFrame, fit_year: int, city: str, H: int = 168, step_days: int = 4) -> float:
    """Grid-search τ (hours) on cutoffs in `fit_year` with a climatology from the years before it. Cached."""
    path = os.path.join(HERE, "data", "cache", f"tau_{city}_{fit_year}.json")
    if os.path.exists(path):
        return float(json.load(open(path))["tau"])
    clim = Climatology(df, fit_year)
    x = df["temp"].to_numpy()
    pos = {t: i for i, t in enumerate(df.index)}
    cutoffs = [c for c in pd.date_range(f"{fit_year}-01-01", f"{fit_year}-12-31", freq=f"{step_days}D") if c in pos and pos[c] + H <= len(x)]
    scores = {}
    for tau in TAU_GRID:
        ae = []
        for c in cutoffs:
            i = pos[c]
            ae.append(np.abs(_blend_mean(x[:i], clim, "temp", c, H, tau) - x[i : i + H]).mean())
        scores[tau] = float(np.mean(ae))
    best = min(scores, key=scores.get)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump({"tau": best, "mae_by_tau": scores, "cutoffs": len(cutoffs)}, open(path, "w"), indent=1)
    return float(best)


# ---------------------------------------------------------------- archived NWP runs

def nwp(hist: dict, H: int, aux: dict) -> dict:
    df, c = aux["nwp"], aux["cutoff"]
    out = {}
    for var in ["temp", "precip", "cloud", "rh", "wind", "code"]:
        if f"{var}_d1" in df:
            out[var] = {"mean": assemble(df, var, c, H), "q10": None, "q90": None}
    if "code" in out:
        out["icon"] = daily_from_codes(out["code"]["mean"])
    if "precip" in out:
        out["pRain"] = rain_day(out["precip"]["mean"])
    return out


def nwp_ecmwf(hist: dict, H: int, aux: dict) -> dict:
    return {"temp": {"mean": assemble(aux["nwp_ecmwf"], "temp", aux["cutoff"], H), "q10": None, "q90": None}}


MODELS = {
    "persistence": persistence,
    "naive_week": naive_week,
    "climatology": climatology,
    "blend": blend,
    "nwp": nwp,
    "nwp_ecmwf": nwp_ecmwf,
}
