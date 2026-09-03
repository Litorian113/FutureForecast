#!/usr/bin/env python3
"""
Rolling-origin backtest of hourly weather forecasts (2-m temperature + weather symbol), 168 h
ahead, for seven cities: trivial baselines vs TimesFM 3.0 zero-shot vs an archived numerical
weather model (Open-Meteo previous runs). Writes public/data/backtest.json.

Protocol
--------
* Test year --year (default 2025: the previous-runs NWP archive is complete for it and the ERA5
  history reaches 2026-08). Cutoffs every --step days at 00:00 local time, horizon --horizon h.
  The cutoff is the first forecast hour; every model only sees hours BEFORE it.
* Climatology uses only years before the test year; the blend's τ is fitted on the year before.
* Metrics per model, per lead day 1..7 (pooled over cities, and per city): MAE, RMSE, bias,
  coverage of the 10-90 % band, pinball loss, band width, skill = 1 − MAE/MAE_climatology on
  the same hours; symbol hit rate (5 classes) and Brier score of the rain-day probability
  (event: >= 1 mm/day) with the climatological frequency as reference.

Each model's raw forecasts are cached in weather/data/cache/bt_<city>_<model>.npz, so slow
TimesFM variants can be run separately and the JSON re-assembled at any time:

  .venv/bin/python weather/backtest.py --models persistence naive_week climatology blend nwp nwp_ecmwf
  .venv/bin/python weather/backtest.py --models timesfm --max-cutoffs 10 --no-json   # timing test
  .venv/bin/python weather/backtest.py --models timesfm timesfm_long timesfm_cov timesfm_multi
  .venv/bin/python weather/backtest.py                                               # JSON from cache
  .venv/bin/python weather/backtest.py --cities Berlin --models blend --no-json

Model names come from models_classic.MODELS (per-cutoff) and models_timesfm.MODELS (batch).
Needs weather/data/<CITY>.csv from prepare_weather.py and the previous-runs cache from nwp.py.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_DIR = os.path.join(HERE, "data")
CACHE_DIR = os.path.join(DATA_DIR, "cache")
sys.path.insert(0, HERE)
from openmeteo import CITIES, COLS  # noqa: E402
from symbols import CLASSES, daily_from_codes, daily_from_vars, rain_day, rain_prob_from_quantiles  # noqa: E402

VARS = COLS  # temp rh precip cloud wind pressure code
NUMERIC = [v for v in VARS if v != "code"]
HISTORY_SHOWN = 336
CUTOFF_CITIES = ["Berlin", "Denver"]  # cities whose individual cutoffs go into the JSON
CUTOFF_EVERY = 4  # ... every 4th cutoff (size)
LEAD_DAYS = 7


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--cities", nargs="*", default=list(CITIES))
    p.add_argument("--models", nargs="*", default=[], help="models to (re)compute; others come from the cache")
    p.add_argument("--year", type=int, default=2025)
    p.add_argument("--step", type=int, default=2, help="days between cutoffs")
    p.add_argument("--horizon", type=int, default=168)
    p.add_argument("--max-cutoffs", type=int, default=0, help="debug: only the first N cutoffs per city")
    p.add_argument("--no-json", action="store_true", help="only fill the cache")
    p.add_argument("--out", default=os.path.join(ROOT, "public", "data", "backtest.json"))
    return p.parse_args()


# ---------------------------------------------------------------- data

def load_city(city: str) -> pd.DataFrame:
    path = os.path.join(DATA_DIR, f"{city}.csv")
    if not os.path.exists(path):
        sys.exit(f"{path} missing - run prepare_weather.py first")
    df = pd.read_csv(path, parse_dates=["ts"]).set_index("ts")
    return df[VARS].astype(float)


def make_cutoffs(year: int, step: int) -> list[pd.Timestamp]:
    return list(pd.date_range(f"{year}-01-01", f"{year}-12-31", freq=f"{step}D"))


# ---------------------------------------------------------------- models

def resolve_model(name: str):
    import models_classic

    if name in models_classic.MODELS:
        fn = models_classic.MODELS[name]

        def batch(histories, H, aux, _fn=fn):
            out = []
            for i, (h, a) in enumerate(zip(histories, aux)):
                out.append(_fn(h, H, a))
                if (i + 1) % 50 == 0:
                    print(f"    {i + 1}/{len(histories)}", flush=True)
            return out

        return batch
    import models_timesfm

    if name in models_timesfm.MODELS:
        return models_timesfm.MODELS[name]
    sys.exit(f"unknown model {name!r}; known: {list(models_classic.MODELS) + list(models_timesfm.MODELS)}")


def all_model_names() -> list[str]:
    import models_classic

    names = list(models_classic.MODELS)
    try:
        import models_timesfm

        names += list(models_timesfm.MODELS)
    except Exception:  # torch missing etc.: still assemble the JSON from the cache
        names += ["timesfm", "timesfm_long", "timesfm_cov", "timesfm_multi"]
    return names


def stack_outputs(outs: list[dict], H: int) -> dict:
    """list of per-cutoff dicts -> {var: {mean (n,H), q10, q90, q (n,H,9)|None}, icon (n,7)|None, pRain (n,7)|None}."""
    n = len(outs)
    res = {"vars": {}}
    for var in VARS:
        if not all(var in o for o in outs):
            continue
        mean = np.stack([o[var]["mean"] for o in outs]).astype(np.float64)
        has_band = all(o[var].get("q10") is not None for o in outs)
        q10 = np.stack([o[var]["q10"] for o in outs]).astype(np.float64) if has_band else None
        q90 = np.stack([o[var]["q90"] for o in outs]).astype(np.float64) if has_band else None
        has_q = all(o[var].get("q") is not None for o in outs)
        q = np.stack([o[var]["q"] for o in outs]).astype(np.float32) if has_q else None
        res["vars"][var] = {"mean": mean, "q10": q10, "q90": q90, "q": q}
    res["icon"] = np.stack([o["icon"] for o in outs]).astype(int) if all("icon" in o for o in outs) else None
    res["pRain"] = np.stack([o["pRain"] for o in outs]).astype(np.float64) if all("pRain" in o for o in outs) else None
    return res


def cache_path(city: str, model: str) -> str:
    return os.path.join(CACHE_DIR, f"bt_{city}_{model}.npz")


def save_cache(city: str, model: str, res: dict, cutoffs: list[pd.Timestamp]) -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)
    arrays = {"seconds": res["seconds"], "cutoffs": np.array([c.strftime("%Y-%m-%dT%H:%M") for c in cutoffs])}
    for var, d in res["vars"].items():
        for k in ("mean", "q10", "q90", "q"):
            if d[k] is not None:
                arrays[f"{var}__{k}"] = d[k]
    for k in ("icon", "pRain"):
        if res[k] is not None:
            arrays[k] = res[k]
    np.savez_compressed(cache_path(city, model), **arrays)


def load_cache(city: str, model: str, cutoffs: list[pd.Timestamp]) -> dict | None:
    path = cache_path(city, model)
    if not os.path.exists(path):
        return None
    z = np.load(path)
    want = [c.strftime("%Y-%m-%dT%H:%M") for c in cutoffs]
    if list(z["cutoffs"]) != want:
        print(f"   cache {city}/{model} has {len(z['cutoffs'])} cutoffs, need {len(want)} - skipped")
        return None
    res = {"vars": {}, "seconds": float(z["seconds"]), "icon": None, "pRain": None}
    for key in z.files:
        if "__" in key:
            var, k = key.split("__")
            res["vars"].setdefault(var, {"mean": None, "q10": None, "q90": None, "q": None})[k] = z[key]
    for k in ("icon", "pRain"):
        if k in z.files:
            res[k] = z[k]
    return res


def run_model(name: str, histories: list[dict], H: int, aux: list[dict]) -> dict:
    fn = resolve_model(name)
    print(f"-- {name}: {len(histories)} cutoffs", flush=True)
    t0 = time.time()
    outs = fn(histories, H, aux)
    secs = time.time() - t0
    res = stack_outputs(outs, H)
    res["seconds"] = secs
    print(f"   done in {secs:.1f} s", flush=True)
    return res


def complete_daily(res: dict) -> None:
    """Fill icon / pRain from the hourly variables where a model did not set them (rule-based)."""
    v = res["vars"]
    if res["pRain"] is None and "precip" in v:
        res["pRain"] = rain_prob_from_quantiles(v["precip"]["q"]) if v["precip"]["q"] is not None else rain_day(v["precip"]["mean"])
    if res["icon"] is None and res["pRain"] is not None and all(k in v for k in ("temp", "cloud", "rh", "wind")):
        res["icon"] = daily_from_vars(v["temp"]["mean"], v["cloud"]["mean"], v["rh"]["mean"], v["wind"]["mean"], res["pRain"])


# ---------------------------------------------------------------- metrics

def pinball(y, q, tau):
    d = y - q
    return np.maximum(tau * d, (tau - 1) * d)


def nm(a) -> float | None:
    a = np.asarray(a, dtype=float)
    return None if not np.isfinite(a).any() else float(np.nanmean(a))


def temp_metrics(actual: np.ndarray, d: dict, clim_mean: np.ndarray, sl=slice(None)) -> dict:
    """Metrics on the hours `sl` (columns) of actual (n,H); NaN forecasts are excluded consistently."""
    mean, a, cm = d["mean"][:, sl], actual[:, sl], clim_mean[:, sl]
    valid = np.isfinite(mean)
    err = np.where(valid, mean - a, np.nan)
    ae = np.abs(err)
    ae_clim = np.where(valid, np.abs(cm - a), np.nan)
    out = {"mae": nm(ae), "rmse": None if nm(ae) is None else float(np.sqrt(np.nanmean(err**2))), "bias": nm(err),
           "n": int(valid.all(axis=1).sum())}
    out["skill"] = None if out["mae"] is None else float(1 - out["mae"] / np.nanmean(ae_clim))
    if d["q10"] is not None:
        q10, q90 = d["q10"][:, sl], d["q90"][:, sl]
        out["pinball"] = nm(np.where(valid, 0.5 * (pinball(a, q10, 0.1) + pinball(a, q90, 0.9)), np.nan))
        out["coverage80"] = nm(np.where(valid, ((a >= q10) & (a <= q90)).astype(float), np.nan))
        out["bandWidth"] = nm(np.where(valid, q90 - q10, np.nan))
    else:
        out["pinball"] = out["coverage80"] = out["bandWidth"] = None
    return out


def symbol_metrics(truth_icon: np.ndarray, truth_rain: np.ndarray, res: dict, clim_p: np.ndarray, day=slice(None)) -> dict:
    out = {"symbolHit": None, "brier": None, "brierSkill": None}
    if res["icon"] is not None:
        ti, mi = truth_icon[:, day], res["icon"][:, day]
        ok = (ti >= 0) & (mi >= 0)
        out["symbolHit"] = float((ti[ok] == mi[ok]).mean()) if ok.any() else None
    if res["pRain"] is not None:
        p, y, pc = res["pRain"][:, day], truth_rain[:, day], clim_p[:, day]
        ok = np.isfinite(p) & np.isfinite(y)
        if ok.any():
            b = float(((p - y) ** 2)[ok].mean())
            bc = float(((pc - y) ** 2)[ok].mean())
            out["brier"], out["brierSkill"] = b, float(1 - b / bc) if bc > 0 else None
    return out


def r1(a) -> list:
    return [None if not np.isfinite(v) else round(float(v), 1) for v in np.asarray(a, dtype=float)]


def rd(x, nd=3):
    if x is None:
        return None
    if isinstance(x, dict):
        return {k: rd(v, nd) for k, v in x.items()}
    if isinstance(x, list):
        return [rd(v, nd) for v in x]
    if isinstance(x, (float, np.floating)):
        return None if not np.isfinite(x) else round(float(x), nd)
    return x


# ---------------------------------------------------------------- main

def main() -> None:
    args = parse_args()
    H = args.horizon
    all_names = all_model_names()
    per_city: dict[str, dict] = {}  # city -> {"cutoffs", "actual", "hist_temp", "results", "truth_icon", ...}

    from models_classic import Climatology, fit_tau
    from nwp import load_nwp

    nwp_end = (pd.Timestamp(f"{args.year}-12-31") + pd.Timedelta(days=LEAD_DAYS)).strftime("%Y-%m-%d")
    for city in args.cities:
        df = load_city(city)
        arrays = {v: df[v].to_numpy() for v in VARS}
        pos = {t: i for i, t in enumerate(df.index)}
        cutoffs = [c for c in make_cutoffs(args.year, args.step) if c in pos and pos[c] + H <= len(df)]
        if args.max_cutoffs:
            cutoffs = cutoffs[: args.max_cutoffs]
        print(f"== {city}: {len(df):,} h ({df.index[0].date()} .. {df.index[-1].date()}), {len(cutoffs)} cutoffs, horizon {H} h", flush=True)
        clim = Climatology(df, args.year)
        tau = fit_tau(df, args.year - 1, city, H)
        print(f"   climatology {clim.years[0]}-{clim.years[1]}, blend tau = {tau:.0f} h (fitted on {args.year - 1})", flush=True)
        nwp_df = nwp_ecmwf_df = None
        need_nwp = any(m in args.models for m in ("nwp", "nwp_ecmwf"))
        if need_nwp:
            nwp_df = load_nwp(city, f"{args.year}-01-01", nwp_end, ["temp", "precip", "cloud", "rh", "wind", "code"])
            nwp_ecmwf_df = load_nwp(city, f"{args.year}-01-01", nwp_end, ["temp"], model="ecmwf_ifs025")
        histories = [{v: arrays[v][: pos[c]] for v in VARS} for c in cutoffs]
        actual = {v: np.stack([arrays[v][pos[c] : pos[c] + H] for c in cutoffs]) for v in VARS}
        aux = [{"cutoff": c, "city": city, "clim": clim, "tau": tau, "nwp": nwp_df, "nwp_ecmwf": nwp_ecmwf_df} for c in cutoffs]
        if np.isnan(actual["temp"]).any() or any(np.isnan(h["temp"][-8760:]).any() for h in histories):
            sys.exit("NaN in the test window or the last year of history")

        results: dict[str, dict] = {}
        for name in args.models:
            res = run_model(name, histories, H, aux)
            save_cache(city, name, res, cutoffs)
            results[name] = res
        if args.no_json:
            continue
        for name in all_names:
            if name not in results:
                res = load_cache(city, name, cutoffs)
                if res is not None:
                    results[name] = res
        results = {n: results[n] for n in all_names if n in results}
        for res in results.values():
            complete_daily(res)
        clim_res = results.get("climatology")
        if clim_res is None:
            sys.exit("climatology results are needed for the skill score - run --models climatology first")
        per_city[city] = {
            "cutoffs": cutoffs, "actual": actual, "results": results, "tau": tau,
            "hist_temp": np.stack([h["temp"][-HISTORY_SHOWN:] for h in histories]),
            "truth_icon": daily_from_codes(actual["code"]),
            "truth_icon_rules": daily_from_vars(actual["temp"], actual["cloud"], actual["rh"], actual["wind"], rain_day(actual["precip"])),
            "truth_rain": rain_day(actual["precip"]),
            "clim_mean": clim_res["vars"]["temp"]["mean"],
            "clim_p": clim_res["pRain"],
            "months": np.stack([(c + pd.to_timedelta(np.arange(H), "h")).month for c in cutoffs]),
        }
    if args.no_json:
        return

    # ------------------------------------------------------------ pooled arrays
    cities = list(per_city)
    names = [n for n in all_names if all(n in per_city[c]["results"] for c in cities)]
    print(f"\nmodels in every city: {names}")

    def pooled(key):
        return np.concatenate([per_city[c][key] for c in cities])

    actual_t = pooled("actual") if False else np.concatenate([per_city[c]["actual"]["temp"] for c in cities])
    clim_mean = pooled("clim_mean")
    clim_p = pooled("clim_p")
    truth_icon, truth_rain, months = pooled("truth_icon"), pooled("truth_rain"), pooled("months")
    truth_icon_rules = pooled("truth_icon_rules")

    def pooled_res(name):
        rs = [per_city[c]["results"][name] for c in cities]
        out = {"vars": {}, "icon": None, "pRain": None, "seconds": sum(r["seconds"] for r in rs)}
        for var in VARS:
            if all(var in r["vars"] for r in rs):
                out["vars"][var] = {k: (np.concatenate([r["vars"][var][k] for r in rs]) if rs[0]["vars"][var][k] is not None else None)
                                    for k in ("mean", "q10", "q90")}
                out["vars"][var]["q"] = None
        if all(r["icon"] is not None for r in rs):
            out["icon"] = np.concatenate([r["icon"] for r in rs])
        if all(r["pRain"] is not None for r in rs):
            out["pRain"] = np.concatenate([r["pRain"] for r in rs])
        return out

    P = {n: pooled_res(n) for n in names}
    lead_sl = [slice(24 * d, 24 * (d + 1)) for d in range(LEAD_DAYS)]

    summary, by_lead, by_lead_hour, by_month, by_var = {}, {}, {}, {}, {}
    for n, r in P.items():
        t = r["vars"]["temp"]
        summary[n] = {**temp_metrics(actual_t, t, clim_mean), **symbol_metrics(truth_icon, truth_rain, r, clim_p), "wins": 0}
        by_lead[n] = [{**temp_metrics(actual_t, t, clim_mean, sl), **symbol_metrics(truth_icon, truth_rain, r, clim_p, slice(d, d + 1))}
                      for d, sl in enumerate(lead_sl)]
        by_lead_hour[n] = np.nanmean(np.abs(t["mean"] - actual_t), axis=0)
        ae = np.abs(t["mean"] - actual_t)
        by_month[n] = {str(m): nm(ae[months == m]) for m in range(1, 13) if (months == m).any()}
    for var in NUMERIC[1:]:
        by_var[var] = {}
        for n, r in P.items():
            if var in r["vars"]:
                a = np.concatenate([per_city[c]["actual"][var] for c in cities])
                m = r["vars"][var]["mean"]
                by_var[var][n] = {"mae": nm(np.abs(m - a)), "bias": nm(m - a),
                                  "byLead": [nm(np.abs(m[:, sl] - a[:, sl])) for sl in lead_sl]}
    # wins: cutoffs where every model is valid
    mae_cut = {n: np.mean(np.abs(P[n]["vars"]["temp"]["mean"] - actual_t), axis=1) for n in names}
    valid_all = np.all([np.isfinite(mae_cut[n]) for n in names], axis=0)
    for i in np.where(valid_all)[0]:
        summary[min(names, key=lambda n: mae_cut[n][i])]["wins"] += 1

    by_city = {}
    for c in cities:
        pc = per_city[c]
        by_city[c] = {"tau": pc["tau"], "cutoffs": len(pc["cutoffs"]), "models": {}}
        for n in names:
            r = pc["results"][n]
            t = r["vars"]["temp"]
            m = temp_metrics(pc["actual"]["temp"], t, pc["clim_mean"])
            s = symbol_metrics(pc["truth_icon"], pc["truth_rain"], r, pc["clim_p"])
            by_city[c]["models"][n] = {
                "mae": m["mae"], "rmse": m["rmse"], "bias": m["bias"], "skill": m["skill"], "coverage80": m["coverage80"],
                "bandWidth": m["bandWidth"], "symbolHit": s["symbolHit"], "brier": s["brier"], "brierSkill": s["brierSkill"],
                "byLead": [temp_metrics(pc["actual"]["temp"], t, pc["clim_mean"], sl)["mae"] for sl in lead_sl],
                "byLeadSkill": [temp_metrics(pc["actual"]["temp"], t, pc["clim_mean"], sl)["skill"] for sl in lead_sl],
                "byLeadCoverage": [temp_metrics(pc["actual"]["temp"], t, pc["clim_mean"], sl)["coverage80"] for sl in lead_sl],
                "byLeadSymbolHit": [symbol_metrics(pc["truth_icon"], pc["truth_rain"], r, pc["clim_p"], slice(d, d + 1))["symbolHit"] for d in range(LEAD_DAYS)],
            }

    # symbol confusion (pooled, all lead days) and truth class shares
    confusion = {}
    for n, r in P.items():
        if r["icon"] is None:
            continue
        ok = (truth_icon >= 0) & (r["icon"] >= 0)
        cm = np.zeros((5, 5), dtype=int)
        np.add.at(cm, (truth_icon[ok], r["icon"][ok]), 1)
        confusion[n] = cm.tolist()
    ok = (truth_icon >= 0) & (truth_icon_rules >= 0)
    truth_shares = [float((truth_icon[ok] == k).mean()) for k in range(5)]
    rules_ceiling = float((truth_icon[ok] == truth_icon_rules[ok]).mean())

    # per-cutoff records for two cities
    cut_records = {}
    for c in cities:
        if c not in CUTOFF_CITIES:
            continue
        pc = per_city[c]
        recs = []
        for i, cut in enumerate(pc["cutoffs"]):
            if i % CUTOFF_EVERY:
                continue
            a = pc["actual"]["temp"][i]
            rec = {"cutoff": cut.strftime("%Y-%m-%dT%H:%M"), "history": r1(pc["hist_temp"][i]), "actual": r1(a),
                   "forecasts": {}, "mae": {}, "truthIcon": pc["truth_icon"][i].tolist(),
                   "truthTmin": r1(a.reshape(7, 24).min(1)), "truthTmax": r1(a.reshape(7, 24).max(1)),
                   "truthRain": pc["truth_rain"][i].tolist(), "icon": {}, "pRain": {}}
            for n in names:
                r = pc["results"][n]
                t = r["vars"]["temp"]
                rec["forecasts"][n] = {"mean": r1(t["mean"][i]), "q10": r1(t["q10"][i]) if t["q10"] is not None else None,
                                       "q90": r1(t["q90"][i]) if t["q90"] is not None else None}
                rec["mae"][n] = rd(nm(np.abs(t["mean"][i] - a)), 2)
                if r["icon"] is not None:
                    rec["icon"][n] = r["icon"][i].tolist()
                if r["pRain"] is not None:
                    rec["pRain"][n] = rd(r["pRain"][i].tolist(), 2)
            recs.append(rec)
        cut_records[c] = recs

    out = {
        "meta": {
            "year": args.year, "horizon": H, "stepDays": args.step, "leadDays": LEAD_DAYS, "cities": cities, "models": names,
            "generated": time.strftime("%Y-%m-%dT%H:%M"),
            "cutoffsPerCity": {c: len(per_city[c]["cutoffs"]) for c in cities},
            "runtimeSec": {n: round(P[n]["seconds"], 1) for n in names},
            "hasBand": {n: P[n]["vars"]["temp"]["q10"] is not None for n in names},
            "hasSymbol": {n: P[n]["icon"] is not None for n in names},
            "historyShown": HISTORY_SHOWN, "cutoffEvery": CUTOFF_EVERY, "classes": CLASSES,
            "truthClassShares": rd(truth_shares), "rulesCeiling": rd(rules_ceiling),
            "climatologyYears": {c: list(per_city[c]["results"]["climatology"] and [args.year - 12, args.year - 1]) for c in cities},
            "coords": {c: CITIES[c] for c in cities},
        },
        "summary": rd(summary),
        "byLead": rd(by_lead),
        "byLeadHour": {n: rd(by_lead_hour[n].tolist(), 2) for n in names},
        "byMonth": rd(by_month),
        "byCity": rd(by_city),
        "byVar": rd(by_var),
        "confusion": confusion,
        "cutoffs": cut_records,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print(f"\n{'model':14s} {'MAE':>6s} {'RMSE':>6s} {'bias':>6s} {'skill':>6s} {'cov80':>6s} {'width':>6s} {'symbol':>7s} {'brier':>6s} {'wins':>5s} {'n':>5s} {'sec':>7s}")
    for n, m in summary.items():
        f = lambda v, fmt: "-" if v is None else format(v, fmt)  # noqa: E731
        print(f"{n:14s} {m['mae']:6.2f} {m['rmse']:6.2f} {m['bias']:+6.2f} {m['skill']:+6.2f} {f(m['coverage80'], '6.2f')} "
              f"{f(m['bandWidth'], '6.2f')} {f(m['symbolHit'], '7.2f')} {f(m['brier'], '6.3f')} {m['wins']:5d} {m['n']:5d} {P[n]['seconds']:7.1f}")
    print("\nMAE by lead day (°C)")
    for n in names:
        print(f"{n:14s} " + " ".join(f"{by_lead[n][d]['mae']:5.2f}" for d in range(LEAD_DAYS)))
    print(f"\nrules-on-truth vs code-truth agreement: {rules_ceiling:.2f}; truth class shares {[round(s, 2) for s in truth_shares]}")
    print(f"wrote {args.out} ({os.path.getsize(args.out) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
