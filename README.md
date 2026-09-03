# FutureForecast

Three small forecasting experiments with Google's time-series model TimesFM 3.0: earthquakes, electricity
demand and weather. An interactive site plus the code and numbers behind it.

![Start page](docs/hub.png)

## What this is

I've been looking into forecasting on small, everyday cases and came across TimesFM 3.0. It's a foundation
model for time series: you give it the past values of any series and it predicts the next ones. No training,
no tuning. It has 300 million parameters and runs on a normal laptop without a GPU, which makes it easy to
just try on whatever data you have around.

I wanted to see what it actually does on real data, so I put it into three examples and compared it each time
with the method people normally use for that kind of data.

| | Data | What I asked | Compared with | What came out |
|---|---|---|---|---|
| 01 | 23,000 earthquakes since 1965 | How often will each region shake in the next ten years? | The frequency of the last 50 years | About the same |
| 02 | Hourly electricity demand of a US grid | How much load next week, hour by hour? | Classical statistics (Holt-Winters, STL) | Clearly better |
| 03 | Hourly temperature, any city | How warm in the next five days? | A real weather model (ICON, ECMWF) | Good for one day, then the weather model is well ahead |

Why the three came out so differently is at the end. That turned out to be the most interesting part for me.

## The site

A start page and three sub-pages, each in its own design. Everything runs locally.

| | |
|---|---|
| ![Earthquakes](docs/erdbeben.png) | ![Electricity](docs/strom.png) |
| **Earthquakes**: the quakes since 1965 on a point-cloud globe, the forecast up to 2026 in green. This is my older visualisation project, with the forecast added. | **Electricity**: the test as a time travel. A slider walks through 104 weeks and shows how each method did that week. |

![Weather](docs/screenshot.png)

**Weather**: the only page that computes live. Search a city and TimesFM forecasts the next five days on the
CPU in a few seconds, next to the weather model from Open-Meteo. The dashed lines in the past are what both
said five days ago, laid over what actually happened, so you can see for yourself where each one was off.

## How I tested it

### The model

TimesFM is a transformer, like a language model, but the "words" are pieces of a number series. You give it
the recent values (92 days up to a year in my case) and get the next 168 hours back, together with nine
quantiles, which gives you an uncertainty band. On my Intel MacBook it does 183 week-long forecasts in
about a minute.

### The test

You can't judge a forecast by showing the model the future, so I used a backtest:

1. Take a day in the past, say 1 March 2025, and cut the data there.
2. Every method sees only what came before and forecasts the next week.
3. Compare with what actually happened.
4. Move two days ahead and repeat. 1,281 times for the weather, 104 times for the grid.

Nothing is allowed to peek: the long-term averages only use years before the test year, parameters are set
on an earlier year, and the uncertainty bands of the classical methods come from earlier errors.

### What it's compared with

- **Persistence**: tomorrow like today. Surprisingly hard to beat for weather.
- **Climatology**: the long-term average for this day and hour.
- **Blend**: persistence that slowly fades into climatology. The best of the simple rules.
- **Holt-Winters, STL + ETS**: the usual statistical methods for seasonal series (electricity).
- **Weather models**: Open-Meteo serves the best regional model for each place (ICON in Europe, GFS in the
  US, JMA in Japan), and ECMWF as one model for everywhere. Both taken from the archive, as published on the
  day in question.

## The results

### 02 · Electricity

Hourly load of the PJM region (USA), 104 weeks, 168 hours ahead. Error in megawatts.

| Method | MAE | vs. best classical | Best weeks |
|---|---:|---:|---:|
| Seasonal naive (same hour last week) | 3,541 | | 1 |
| Naive, mean of the last 4 weeks | 3,205 | | 5 |
| Holt-Winters, weekly season | 3,463 | | 2 |
| STL + ETS | 3,272 | | 2 |
| TimesFM 3.0, 8-week context | 1,846 | −42 % | 5 |
| **TimesFM 3.0, 1-year context** | **1,461** | **−54 %** | **62** |
| TimesFM 3.0, 4 regions jointly | 1,768 | −45 % | 21 |

This is the case where the model does really well. The daily and weekly rhythm is all in the data. It had the
lower error than "same hour last week" in 100 of 104 weeks, and in heat weeks, where the classical methods
double their error, the version with a year of context stays stable because it has seen the previous summer.

### 03 · Weather

Hourly temperature, seven cities in seven climates, 1,281 forecasts in 2025. Error in °C per lead day.

| Method | Day 1 | Day 2 | Day 3 | Day 5 | Day 7 |
|---|---:|---:|---:|---:|---:|
| Persistence | 2.01 | 2.67 | 2.99 | 3.27 | 3.38 |
| Climatology | 2.64 | 2.63 | 2.65 | 2.66 | 2.67 |
| Blend | 1.92 | 2.34 | 2.50 | 2.61 | 2.65 |
| TimesFM 3.0 (Berlin) | **1.41** | 2.43 | 2.96 | 3.15 | 3.36 |
| Weather model Open-Meteo | 1.34 | 1.63 | 1.72 | 2.04 | 2.48 |
| **Weather model ECMWF** | **0.83** | **0.99** | **1.13** | **1.52** | **2.05** |

For the first day the model is better than any of the simple rules. After that it drops to the level of the
long-term average, while the weather model stays accurate, because it sees the weather system coming and a
single temperature series doesn't. One thing I found nice: the model's uncertainty band was right (78–82 %
of the time the truth lies inside the 10–90 % band) and it widens from 5 to 10 °C over the week, without
any calibration.

So far TimesFM ran for Berlin (all variants) and Reykjavík; the other five cities are next (commands below).
All tables, including symbol hit rates and bands, are in
[docs/README-weather-details.md](docs/README-weather-details.md).

### 01 · Earthquakes

23,000 quakes of magnitude 5.5+ (USGS, 1965–2016). For each 5° cell the model forecasts how often it
shakes there over ten years. Checked against the real quakes of one month (August 2026, 50 quakes):

| Measure | TimesFM | Frequency 1965–2016 |
|---|---:|---:|
| Expected count (observed: 50) | 57.5 | 36–42 |
| Real quakes inside a forecast cell | 49 / 50 | 49 / 50 |
| Log-likelihood of the cell counts (higher is better) | −170.9 | −155.3 |

This was the first thing I tried, in my old earthquake project, and it didn't add much: quakes happen where
they always happen, but the timing is close to random, so there isn't much in the history to work with. The
model gets the overall count closer than the long-term average, the spatial pattern not. And one month is
far too short to judge a ten-year forecast anyway.

## What I took away

**Where the past contains the future, it works.** Grid load is calendar plus habit, so the model is good all
week. Temperature has about one day of memory, after that a front from far away decides, so it's good for
one day. Earthquakes are spatially stable and temporally almost random, so only the frequency is left. The
model didn't fail in any of these; the data simply contains a different amount of the future in each case.

**The uncertainty bands are usable as they are.** Around 80 % coverage in every case, no calibration.

**More context helps, extra inputs didn't.** A year of history helped in both backtests. Adding the hour and
weekday as extra inputs made things slightly worse and ten times slower.

**It keeps going instead of settling back.** The model extends the last few days rather than returning to
the long-term average. In Phoenix it held on to last week's heat after it was gone. Blending it with the
average from day 2 on would probably fix that.

**Pick a strong comparison.** Open-Meteo's regional model in Phoenix (GFS) is worse than the simple blend
at day 3. Without the ECMWF column I would have drawn the wrong conclusion.

**Most of the bugs were in the data handling.** Open-Meteo returned 58 of the requested 92 days and an
`interpolate()` quietly turned the gap into a month of flat line as model input. Contexts of unequal length
in one batch came back as NaN without an error. Checking the data took longer than running the models.

## Open work and known issues

### Things I'd do next

- [ ] **Weather model as an extra input** (`timesfm_nwp`). Give TimesFM the weather model's forecast as a
      covariate and see whether it learns the model's local bias, the way weather services do by hand (MOS).
      The backtest for it already exists.
- [ ] **TimesFM for the remaining five weather cities**, plus `timesfm_long` for Reykjavík. About two hours:
      `weather/backtest.py --cities Phoenix Singapore CapeTown Denver Tokyo --models timesfm timesfm_multi timesfm_cov timesfm_long --no-json`
- [ ] **Blend TimesFM into climatology from day 2** like the `blend` baseline does with persistence.
- [ ] **A live scorecard.** The daily job already stores the weather-model forecasts for the seven cities;
      store TimesFM's next to it and the page can show real results for those cities after a few months.
- [ ] **Earthquakes: keep checking monthly** and look at the log-likelihood over a year, not one month.
- [ ] **Electricity: weather as an extra input**, the mirror image of the first item.
- [ ] **A better weather symbol.** Even on the true variables the rule set matches the weather code on only
      84 % of days; a small classifier on ERA5 would raise that for every method.
- [ ] **Check the "closest test city"** mapping of the expected-error chip once all seven cities have numbers.
- [ ] **Longer live context** via the archive API, since the real-time endpoint gives ~58 of 92 days.
- [ ] Translate `docs/README-weather-details.md` (still German).

### Known issues and limitations

- Weather is tested on one year (2025); the archived weather-model runs are complete only from 2022
  (`best_match`) and Feb 2024 (ECMWF).
- `previous_day1` is the previous day's model run, so the weather model had data up to 12–24 h before the
  cutoff and TimesFM up to the last hour. This favours TimesFM a little.
- Truth and history are ERA5 grid cells (9–25 km), smoother than a station. The weather models are scored
  against that same ERA5; `best_match` carries a +0.7 °C bias against it.
- Open-Meteo returns less past data than requested (~58 of 92 days). The server drops the empty leading
  block; the page shows the real context length.
- Contexts of different length in one `predict_batch` call come back as NaN from `timesfm3` without an
  error; the server trims them to equal length.
- First request per city takes ~4 s (one live forecast plus three past runs on the CPU); cached per hour
  in memory only.
- `timesfm_cov` is ten times slower than the plain variant and not better.
- `src/erdbeben/pages/` still contains the unused pages of the original project; `react-router-dom` stays a
  dependency because of them.
- The globe on the start page is drawn by hand; the real data only loads on the earthquake page.
- Desktop only, laid out for 1440 × 900. The electricity and earthquake pages are dark-mode only.
- Intel Macs need torch 2.2.2, hence `numpy<2` and the `RMSNorm` shim.
- The TimesFM 3.0 weights are non-commercial; run it locally.

## Run it yourself

Requirements: Node 22, Python 3.12, [uv](https://docs.astral.sh/uv/). The TimesFM weights (1.2 GB) are
downloaded from Hugging Face on the first run.

```bash
git clone https://github.com/Litorian113/FutureForecast.git && cd FutureForecast
npm install
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt

npm run dev                          # http://localhost:5503  (start page, all three)
.venv/bin/python weather/server.py   # port 8000, only the weather page needs it
```

The backtest results ship as JSON, so the pages work right away. To recompute the numbers:

```bash
.venv/bin/python weather/prepare_weather.py     # ERA5 history for seven cities (cached)
.venv/bin/python weather/nwp.py                 # archived weather-model runs of 2025
.venv/bin/python weather/backtest.py --models persistence naive_week climatology blend nwp nwp_ecmwf
.venv/bin/python weather/backtest.py --models timesfm timesfm_multi timesfm_cov timesfm_long   # ≈ 25 min per city
.venv/bin/python weather/backtest.py            # assemble the JSON
.venv/bin/python weather/report.py              # Markdown tables
```

The pipelines for electricity and earthquakes live in their original projects (FutureGrid, the earthquake
visualisation); this repo has their pages and finished results.

Intel Mac: torch 2.2.2 is the last release, hence `numpy<2` and the RMSNorm shim in `weather/torch_compat.py`.
Apple Silicon and Linux run a current torch as-is.

## Layout

```
index.html · wetter.html · strom.html · erdbeben.html   four Vite entries, each page with its own bundle
src/hub/          start page
src/wetter/       weather: React app, live against the FastAPI server
src/strom/        FutureGrid, taken over unchanged
src/erdbeben/     earthquake visualisation (three.js), only the globe here
weather/          Python: Open-Meteo client, backtest, models, server
public/data/      backtest results (JSON), earthquake and tsunami data
docs/             screenshots and the detailed weather write-up
```

Stack: React 18, TypeScript, Vite (multi-page), three.js for the globe, charts as hand-written SVG.
Python 3.12 with TimesFM 3.0 (PyTorch), pandas, FastAPI. Screenshots via headless Chrome (`scripts/shot.mjs`).

## Data and licences

The code in this repository is under the [MIT licence](LICENSE).

| What | Source | Licence |
|---|---|---|
| TimesFM 3.0 (code) | [google-research/timesfm](https://github.com/google-research/timesfm) | Apache 2.0 |
| TimesFM 3.0 (weights) | [Hugging Face](https://huggingface.co/google/timesfm-3.0-pytorch) | **non-commercial**; not shipped, downloaded on first run |
| Weather data, weather-model archive, geocoding | [Open-Meteo](https://open-meteo.com) | CC BY 4.0 |
| ERA5 reanalysis (via Open-Meteo) | Copernicus / ECMWF | free with attribution |
| PJM grid load | Kaggle, [robikscube/hourly-energy-consumption](https://www.kaggle.com/datasets/robikscube/hourly-energy-consumption) | CC0 |
| Earthquakes | USGS | public domain |
| Tsunamis | NOAA NCEI | public domain |
| Fonts | Inter, Sometype Mono via Google Fonts | SIL Open Font License |
| Libraries | React, three.js, Vite, PyTorch, pandas, FastAPI and others | MIT / BSD |

The globe's world map is
["Equirectangular projection world map without borders"](https://commons.wikimedia.org/wiki/File:Equirectangular_projection_world_map_without_borders.svg)
by Ebrahim, Wikimedia Commons, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), used unchanged.
The other graphics are my own. The bundled JSON files are results derived from the sources above, not raw data.

## About

Made in 2026 at HfG Schwäbisch Gmünd, out of curiosity about what a small time-series model can do on data
I had lying around. Most of the code was written together with Claude Code.

Franz Anhäupl
