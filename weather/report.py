#!/usr/bin/env python3
"""
Print the backtest results as Markdown tables (for the README) from public/data/backtest.json.

  .venv/bin/python weather/report.py
  .venv/bin/python weather/report.py --json path/to/other.json
"""
from __future__ import annotations

import argparse
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LABELS = {
    "persistence": "Persistence (same hour yesterday)",
    "naive_week": "Same hour last week",
    "climatology": "Climatology (±7 d, 2014–2024)",
    "blend": "Blend (persistence → climatology)",
    "nwp": "NWP Open-Meteo best_match",
    "nwp_ecmwf": "NWP ECMWF IFS 0.25°",
    "timesfm": "TimesFM 3.0, 92-day context",
    "timesfm_long": "TimesFM 3.0, 1-year context",
    "timesfm_cov": "TimesFM 3.0 + calendar covariates",
    "timesfm_multi": "TimesFM 3.0, 6 variables",
}
CITY = {"CapeTown": "Cape Town", "Reykjavik": "Reykjavík"}


def f(v, fmt="{:.2f}", none="–"):
    return none if v is None else fmt.format(v)


def pct(v):
    return "–" if v is None else f"{v * 100:.0f} %"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--json", default=os.path.join(ROOT, "public", "data", "backtest.json"))
    a = p.parse_args()
    d = json.load(open(a.json))
    meta, s = d["meta"], d["summary"]
    models = meta["models"]
    cities = meta["cities"]
    n_cut = sum(meta["cutoffsPerCity"].values())
    print(f"Test year {meta['year']}, {len(cities)} cities, {n_cut} cutoffs (every {meta['stepDays']} days), horizon {meta['horizon']} h, generated {meta['generated']}\n")

    print("### Temperature, all cities and lead days pooled\n")
    print("| Model | MAE (°C) | RMSE (°C) | Bias (°C) | Skill vs clim. | Coverage 10–90 % | Band width (°C) | Best cutoffs | CPU time |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for m in models:
        r = s[m]
        print(f"| {LABELS.get(m, m)} | {r['mae']:.2f} | {r['rmse']:.2f} | {r['bias']:+.2f} | {r['skill']:+.2f} | {pct(r['coverage80'])} | "
              f"{f(r['bandWidth'])} | {r['wins']} / {n_cut} | {meta['runtimeSec'][m]:.0f} s |")

    print("\n### Temperature MAE (°C) by lead day\n")
    print("| Model | " + " | ".join(f"Day {l}" for l in range(1, 8)) + " |")
    print("|---|" + "---:|" * 7)
    for m in models:
        print(f"| {LABELS.get(m, m)} | " + " | ".join(f"{x['mae']:.2f}" for x in d["byLead"][m]) + " |")

    print("\n### Skill against climatology (1 − MAE/MAE_clim) by lead day\n")
    print("| Model | " + " | ".join(f"Day {l}" for l in range(1, 8)) + " |")
    print("|---|" + "---:|" * 7)
    for m in models:
        if m == "climatology":
            continue
        print(f"| {LABELS.get(m, m)} | " + " | ".join(f"{x['skill']:+.2f}" for x in d["byLead"][m]) + " |")

    banded = [m for m in models if meta["hasBand"][m]]
    if banded:
        print("\n### Coverage of the 10–90 % band (target 80 %) and band width (°C) by lead day\n")
        print("| Model | " + " | ".join(f"Day {l}" for l in range(1, 8)) + " |")
        print("|---|" + "---:|" * 7)
        for m in banded:
            print(f"| {LABELS.get(m, m)} | " + " | ".join(f"{pct(x['coverage80'])} · {x['bandWidth']:.1f}" for x in d["byLead"][m]) + " |")

    print("\n### Temperature MAE (°C) per city, all lead days\n")
    print("| Model | " + " | ".join(CITY.get(c, c) for c in cities) + " |")
    print("|---|" + "---:|" * len(cities))
    for m in models:
        print(f"| {LABELS.get(m, m)} | " + " | ".join(f"{d['byCity'][c]['models'][m]['mae']:.2f}" for c in cities) + " |")
    print("\nBlend τ (h) per city, fitted on the year before the test year: " + ", ".join(f"{CITY.get(c, c)} {d['byCity'][c]['tau']:.0f}" for c in cities))

    print("\n### Temperature MAE (°C) per city at lead day 1 / 3 / 7\n")
    print("| Model | " + " | ".join(CITY.get(c, c) for c in cities) + " |")
    print("|---|" + "---:|" * len(cities))
    for m in models:
        cells = []
        for c in cities:
            bl = d["byCity"][c]["models"][m]["byLead"]
            cells.append(f"{bl[0]:.1f} / {bl[2]:.1f} / {bl[6]:.1f}")
        print(f"| {LABELS.get(m, m)} | " + " | ".join(cells) + " |")

    sym = [m for m in models if meta["hasSymbol"][m]]
    if sym:
        print("\n### Weather symbol (5 classes) hit rate by lead day, and rain-day Brier score\n")
        print("| Model | " + " | ".join(f"Day {l}" for l in range(1, 8)) + " | All | Brier | Brier skill |")
        print("|---|" + "---:|" * 10)
        for m in sym:
            r = s[m]
            print(f"| {LABELS.get(m, m)} | " + " | ".join(pct(x["symbolHit"]) for x in d["byLead"][m]) +
                  f" | {pct(r['symbolHit'])} | {f(r['brier'], '{:.3f}')} | {f(r['brierSkill'])} |")
        sh = meta["truthClassShares"]
        print(f"\nTruth class shares (all city-days): " + ", ".join(f"{k} {v * 100:.0f} %" for k, v in zip(meta["classes"], sh)) +
              f". The rule set applied to the *true* variables agrees with the weather_code truth in {meta['rulesCeiling'] * 100:.0f} % of the days (ceiling for rule-based symbols).")

    if d.get("byVar"):
        print("\n### Other variables, MAE over all lead days (day 1 → day 7 in brackets)\n")
        units = {"rh": "RH (%)", "precip": "Precip (mm/h)", "cloud": "Cloud (%)", "wind": "Wind (km/h)", "pressure": "Pressure (hPa)"}
        vars_ = [v for v in units if v in d["byVar"]]
        print("| Model | " + " | ".join(units[v] for v in vars_) + " |")
        print("|---|" + "---:|" * len(vars_))
        for m in models:
            cells = []
            for v in vars_:
                r = d["byVar"][v].get(m)
                cells.append("–" if r is None else f"{r['mae']:.2f} ({r['byLead'][0]:.2f} → {r['byLead'][6]:.2f})")
            print(f"| {LABELS.get(m, m)} | " + " | ".join(cells) + " |")

    print("\n### Temperature MAE (°C) by month of the target hour\n")
    print("| Model | " + " | ".join(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]) + " |")
    print("|---|" + "---:|" * 12)
    for m in models:
        print(f"| {LABELS.get(m, m)} | " + " | ".join(f"{d['byMonth'][m].get(str(k), 0):.1f}" for k in range(1, 13)) + " |")


if __name__ == "__main__":
    main()
