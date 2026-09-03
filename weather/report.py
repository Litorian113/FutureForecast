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
    "persistence": "Persistenz (gleiche Stunde gestern)",
    "naive_week": "Gleiche Stunde letzte Woche",
    "climatology": "Klimatologie (±7 d, 2014–2024)",
    "blend": "Blend (Persistenz → Klimatologie)",
    "nwp": "Wettermodell Open-Meteo best_match",
    "nwp_ecmwf": "Wettermodell ECMWF IFS 0,25°",
    "timesfm": "TimesFM 3.0, 92 Tage Kontext",
    "timesfm_long": "TimesFM 3.0, 1 Jahr Kontext",
    "timesfm_cov": "TimesFM 3.0 + Kalender-Kovariaten",
    "timesfm_multi": "TimesFM 3.0, 6 Variablen",
}
CITY = {"CapeTown": "Kapstadt", "Reykjavik": "Reykjavík", "Singapore": "Singapur", "Tokyo": "Tokio"}


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
    print(f"Testjahr {meta['year']}, {len(cities)} Städte, {n_cut} Cutoffs (alle {meta['stepDays']} Tage), Horizont {meta['horizon']} h, erzeugt {meta['generated']}\n")

    print("### Temperatur, alle Städte und Vorlauftage zusammen\n")
    print("| Modell | MAE (°C) | RMSE (°C) | Bias (°C) | Skill vs. Klima | Abdeckung 10–90 % | Bandbreite (°C) | Beste Cutoffs | CPU-Zeit |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for m in models:
        r = s[m]
        print(f"| {LABELS.get(m, m)} | {r['mae']:.2f} | {r['rmse']:.2f} | {r['bias']:+.2f} | {r['skill']:+.2f} | {pct(r['coverage80'])} | "
              f"{f(r['bandWidth'])} | {r['wins']} / {n_cut} | {meta['runtimeSec'][m]:.0f} s |")

    print("\n### Temperatur-MAE (°C) je Vorlauftag\n")
    print("| Modell | " + " | ".join(f"Tag {l}" for l in range(1, 8)) + " |")
    print("|---|" + "---:|" * 7)
    for m in models:
        print(f"| {LABELS.get(m, m)} | " + " | ".join(f"{x['mae']:.2f}" for x in d["byLead"][m]) + " |")

    print("\n### Skill gegen Klimatologie (1 − MAE/MAE_Klima) je Vorlauftag\n")
    print("| Modell | " + " | ".join(f"Tag {l}" for l in range(1, 8)) + " |")
    print("|---|" + "---:|" * 7)
    for m in models:
        if m == "climatology":
            continue
        print(f"| {LABELS.get(m, m)} | " + " | ".join(f"{x['skill']:+.2f}" for x in d["byLead"][m]) + " |")

    banded = [m for m in models if meta["hasBand"][m]]
    if banded:
        print("\n### Abdeckung des 10–90-%-Bands (Ziel 80 %) · Bandbreite (°C) je Vorlauftag\n")
        print("| Modell | " + " | ".join(f"Tag {l}" for l in range(1, 8)) + " |")
        print("|---|" + "---:|" * 7)
        for m in banded:
            print(f"| {LABELS.get(m, m)} | " + " | ".join(f"{pct(x['coverage80'])} · {x['bandWidth']:.1f}" for x in d["byLead"][m]) + " |")

    print("\n### Temperatur-MAE (°C) je Stadt, alle Vorlauftage\n")
    print("| Modell | " + " | ".join(CITY.get(c, c) for c in cities) + " |")
    print("|---|" + "---:|" * len(cities))
    for m in models:
        print(f"| {LABELS.get(m, m)} | " + " | ".join(f"{d['byCity'][c]['models'][m]['mae']:.2f}" for c in cities) + " |")
    print("\nBlend-τ (h) je Stadt, gefittet auf dem Jahr vor dem Testjahr: " + ", ".join(f"{CITY.get(c, c)} {d['byCity'][c]['tau']:.0f}" for c in cities))

    print("\n### Temperatur-MAE (°C) je Stadt an Vorlauftag 1 / 3 / 7\n")
    print("| Modell | " + " | ".join(CITY.get(c, c) for c in cities) + " |")
    print("|---|" + "---:|" * len(cities))
    for m in models:
        cells = []
        for c in cities:
            bl = d["byCity"][c]["models"][m]["byLead"]
            cells.append(f"{bl[0]:.1f} / {bl[2]:.1f} / {bl[6]:.1f}")
        print(f"| {LABELS.get(m, m)} | " + " | ".join(cells) + " |")

    sym = [m for m in models if meta["hasSymbol"][m]]
    if sym:
        print("\n### Wettersymbol (5 Klassen): Trefferquote je Vorlauftag, Brier-Score der Regentag-Wahrscheinlichkeit\n")
        print("| Modell | " + " | ".join(f"Tag {l}" for l in range(1, 8)) + " | Gesamt | Brier | Brier-Skill |")
        print("|---|" + "---:|" * 10)
        for m in sym:
            r = s[m]
            print(f"| {LABELS.get(m, m)} | " + " | ".join(pct(x["symbolHit"]) for x in d["byLead"][m]) +
                  f" | {pct(r['symbolHit'])} | {f(r['brier'], '{:.3f}')} | {f(r['brierSkill'])} |")
        sh = meta["truthClassShares"]
        print(f"\nAnteile der wahren Klassen (alle Stadt-Tage): " + ", ".join(f"{k} {v * 100:.0f} %" for k, v in zip(meta["classes"], sh)) +
              f". Der Regelsatz auf den *wahren* Variablen trifft die weather_code-Wahrheit an {meta['rulesCeiling'] * 100:.0f} % der Tage (Obergrenze für regelbasierte Symbole).")

    if d.get("byVar"):
        print("\n### Weitere Variablen, MAE über alle Vorlauftage (Tag 1 → Tag 7 in Klammern)\n")
        units = {"rh": "Feuchte (%)", "precip": "Niederschlag (mm/h)", "cloud": "Bewölkung (%)", "wind": "Wind (km/h)", "pressure": "Druck (hPa)"}
        vars_ = [v for v in units if v in d["byVar"]]
        print("| Modell | " + " | ".join(units[v] for v in vars_) + " |")
        print("|---|" + "---:|" * len(vars_))
        for m in models:
            cells = []
            for v in vars_:
                r = d["byVar"][v].get(m)
                cells.append("–" if r is None else f"{r['mae']:.2f} ({r['byLead'][0]:.2f} → {r['byLead'][6]:.2f})")
            print(f"| {LABELS.get(m, m)} | " + " | ".join(cells) + " |")

    print("\n### Temperatur-MAE (°C) je Monat der Zielstunde\n")
    print("| Modell | " + " | ".join(["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]) + " |")
    print("|---|" + "---:|" * 12)
    for m in models:
        print(f"| {LABELS.get(m, m)} | " + " | ".join(f"{d['byMonth'][m].get(str(k), 0):.1f}" for k in range(1, 13)) + " |")


if __name__ == "__main__":
    main()
