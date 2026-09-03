<div align="center">

# FutureForecast

**Three experiments with a time-series foundation model.**
Earthquakes, electricity demand and weather, each compared with the method people normally use.

[The site](#the-site) · [How it works](#how-it-works) · [Results](#the-results) · [What we learned](#what-we-learned) · [Open work](#open-work-and-known-issues) · [Run it yourself](#run-it-yourself) · [Data & licences](#data-and-licences)

</div>

![Start page](docs/hub.png)

## What this is about

Google released **TimesFM 3.0**, a model trained on billions of time series: sales figures, sensor readings,
web traffic, whatever. The idea: you hand it any series of numbers from the past and it predicts the next
values. **No training, no tuning, no idea what the numbers mean.** That is called *zero-shot*.

I found that interesting and wanted to see what it does on data I had around. So I tried it on three very
different things and compared it each time with the method people normally use.

| | Scenario | The question | Opponent | Result |
|---|---|---|---|---|
| 01 | **Earthquakes** | How often will each region shake in the next ten years? | The frequency of the last 50 years | About the same as the long-term average |
| 02 | **Electricity** | How much load will the grid draw next week, hour by hour? | Classical statistics (Holt-Winters, STL) | Clearly better than the classical methods |
| 03 | **Weather** | How warm will it be in five days? | A real weather model (ICON, ECMWF) | Good for one day, then the weather model is 2–3× more accurate |

Why the three came out so differently is explained at the end; that turned out to be the most interesting part.

## The site

One start page, three sub-pages, each in its own design. Everything runs locally in the browser.

| | |
|---|---|
| ![Earthquakes](docs/erdbeben.png) | ![Electricity](docs/strom.png) |
| **Earthquakes**: 23,000 quakes since 1965 on a point-cloud globe, the forecast up to 2026 in green. Click a region and the globe turns there. | **Electricity**: the backtest as time travel. The slider walks through 104 weeks and shows who was best each week. |

![Weather](docs/screenshot.png)

**Weather**: the only page that computes *live*. Search a city and TimesFM forecasts the next five days on the CPU
in about three seconds, next to the weather model from Open-Meteo. Dashed lines in the past show what both said
five days ago, laid over what really happened. On the right, the measured duel.

## How it works

### The model

TimesFM is a transformer, the same architecture as language models, except that the "words" are chunks of a
number series. You give it the recent values (the *context*, 92 days to a year in our case) and get the next
168 hours back, plus nine quantiles, i.e. an uncertainty band. It runs on an ordinary laptop without a GPU:
183 week-long forecasts in 53 seconds.

### The test

You cannot judge a forecasting model by showing it the future. Hence the **backtest**:

1. Take a day in the past, say 1 March 2025, and cut the data there.
2. Every model sees only what came before and forecasts the next week.
3. Compare with what actually happened.
4. Move two days ahead and repeat. 1,281 times for the weather, 104 times for the grid.

Strict rules apply: no model may peek at the future, not even through the back door. The climatology knows
only the years before the test year, parameters are tuned on an earlier year, and the uncertainty bands of the
classical methods come from earlier errors, never from the test year.

### The opponents

A model is only as good as the opponent it is measured against, so the opponents are deliberately strong:

- **Persistence**: "tomorrow like today". Surprisingly hard to beat for weather.
- **Climatology**: the long-term average for this day and hour.
- **Blend**: persistence that slowly fades into climatology. The best trivial method.
- **Holt-Winters, STL + ETS**: classical statistics for seasonal series (electricity).
- **Weather models**: Open-Meteo serves the best regional model for every place (ICON in Europe, GFS in the
  US, JMA in Japan), plus ECMWF as a worldwide uniform reference. Both come from the archive, exactly as
  published on the day in question.

## The results

### 02 · Electricity: TimesFM wins clearly

Hourly load of the PJM region (USA), 104 weeks, 168 hours ahead. Error in megawatts.

| Model | MAE | vs. best classical | Best weeks |
|---|---:|---:|---:|
| Seasonal naive (same hour last week) | 3,541 | | 1 |
| Naive, mean of the last 4 weeks | 3,205 | | 5 |
| Holt-Winters, weekly season | 3,463 | | 2 |
| STL + ETS | 3,272 | | 2 |
| TimesFM 3.0, 8-week context | 1,846 | −42 % | 5 |
| **TimesFM 3.0, 1-year context** | **1,461** | **−54 %** | **62** |
| TimesFM 3.0, 4 regions jointly | 1,768 | −45 % | 21 |

TimesFM beats the seasonal naive in **100 of 104 weeks**. At a lead of 1 h it sits at 143 MW while the
classical methods are around 3,000 MW, because they are anchored to last week. In heat weeks the classical
errors double; TimesFM with a year of context does not: it has seen the previous summer.

### 03 · Weather: the weather model wins, but TimesFM has one good day

Hourly temperature, seven cities in seven climates, 1,281 forecasts in 2025. Error in °C per lead day.

| Model | Day 1 | Day 2 | Day 3 | Day 5 | Day 7 |
|---|---:|---:|---:|---:|---:|
| Persistence | 2.01 | 2.67 | 2.99 | 3.27 | 3.38 |
| Climatology | 2.64 | 2.63 | 2.65 | 2.66 | 2.67 |
| Blend | 1.92 | 2.34 | 2.50 | 2.61 | 2.65 |
| TimesFM 3.0 (Berlin) | **1.41** | 2.43 | 2.96 | 3.15 | 3.36 |
| Weather model Open-Meteo | 1.34 | 1.63 | 1.72 | 2.04 | 2.48 |
| **Weather model ECMWF** | **0.83** | **0.99** | **1.13** | **1.52** | **2.05** |

On day 1 TimesFM beats every trivial method. From day 3 it is at climatology level, from day 2 behind the
simple blend. ECMWF at day 7 is still more accurate than TimesFM at day 2. Remarkable, though: TimesFM's
**uncertainty bands are right** (78–82 % coverage, the fan grows from 5 to 10 °C). The model knows what it
does not know. It just knows nothing about the front arriving the day after tomorrow.

For the weather, TimesFM has so far been run for Berlin (all variants) and Reykjavík; the other five cities
follow (commands below). The full tables with all variants, symbol hit rates and bands are in
[docs/README-weather-details.md](docs/README-weather-details.md).

### 01 · Earthquakes: a draw, with a twist

23,000 quakes of magnitude 5.5+ (USGS, 1965–2016). For every 5° cell TimesFM forecasts how *often* it shakes
there, ten years ahead. Scored against the real quakes of one month (August 2026, 50 quakes):

| Measure | TimesFM | Climatology 1965–2016 |
|---|---:|---:|
| Expected count (observed: 50) | 57.5 | 36–42 |
| Real quakes inside a forecast cell | 49 / 50 | 49 / 50 |
| Log-likelihood of the cell counts (higher is better) | −170.9 | −155.3 |

"49 of 50" sounds spectacular and is not, because the frequency of the last 50 years achieves the same:
quakes happen where they have always happened. The model gets the **level** better than climatology, the
spatial pattern not. And one month is far too short for a ten-year forecast.

## What we learned

**The one rule.** TimesFM wins exactly as long as the future is contained in the series' own past. Grid load
is calendar plus habit, so it wins all week. Temperature has about one day of memory, after that a front that
formed a thousand kilometres away decides, so it wins one day. Earthquakes are spatially stable and temporally
almost random, so only the frequency is left. That is not a weakness of the model; it is a property of the subject.

**The bands are right.** Without any calibration the 10–90 % band covers about 80 % of the truth in every
scenario. Honest uncertainty out of the box is often worth more in practice than a few tenths less error.

**Context yes, explanations no.** A year of context helps in both backtests. Calendar covariates (hour, weekday
as extra input) hurt slightly in both and cost ten times the compute.

**It does not forget.** TimesFM extends the last few days instead of returning to climatology. In Phoenix it
holds on to last week's heat after it is gone. A blend of TimesFM and climatology from day 2 on would probably
beat every trivial method on every day.

**The opponent has to be strong.** Open-Meteo's `best_match` in Phoenix (GFS) is worse than our blend at
day 3. Without the ECMWF column we would have drawn the wrong conclusion.

**The bugs were in the data.** Open-Meteo returns 58 of the promised 92 days; an `interpolate()` turned that
into 34 days of flat line and fed it to the model as context. Contexts of unequal length in one batch come
back silently as NaN. Either bug would have distorted the result unnoticed. The measurement infrastructure
was more work than the models, and rightly so.

## Open work and known issues

### To do, roughly in order of how much they would change the picture

- [ ] **Weather model as a covariate** (`timesfm_nwp`). So far TimesFM and the weather model are opponents.
      Given the model's 120 h forecast as a `past_future_covariate`, TimesFM could learn how that model is
      biased at this very place, which is what weather services build by hand as MOS post-processing.
      The backtest for it already exists; it is one more entry in `weather/models_timesfm.py`.
- [ ] **TimesFM for the remaining five weather cities.** Phoenix, Singapore, Cape Town, Denver and Tokyo, plus
      `timesfm_long` for Reykjavík. About two hours of CPU:
      `weather/backtest.py --cities Phoenix Singapore CapeTown Denver Tokyo --models timesfm timesfm_multi timesfm_cov timesfm_long --no-json`
- [ ] **Hybrid TimesFM → climatology.** Blend the TimesFM mean into the climatology from day 2 on, the way the
      `blend` baseline does with persistence. Expected to beat every trivial method on every day. Two lines.
- [ ] **A live scorecard that accumulates.** The daily launchd job already archives the weather-model forecast
      for the seven cities; store TimesFM's forecast next to it, and after a few months the page can show a
      measured duel for those cities instead of one from the backtest year.
- [ ] **Earthquakes: keep scoring.** One month against a ten-year rate forecast is nothing. Re-run the
      evaluation monthly and watch the log-likelihood against climatology over a year.
- [ ] **Electricity: weather as a covariate.** The mirror image of the first item; the gain is probably smaller
      (TimesFM is already at 4.6 % MAPE), but it would show whether covariates ever help this model.
- [ ] **A better weather symbol.** Even applied to the *true* variables the rule set matches the weather code on
      only 84 % of days. A small classifier trained on ERA5 variables → code would lift the ceiling for every model.
- [ ] **Validate "closest test city".** The honesty chip picks the backtest city with the most similar ERA5
      signature. Once all seven cities have TimesFM numbers, check the mapping against real cross-city errors.
- [ ] **Longer live context.** The real-time endpoint delivers ~58 of the requested 92 days; falling back to the
      archive API would give the live page the full year of context the backtest showed to help.
- [ ] Translate `docs/README-weather-details.md`; it is still the German write-up with all tables.

### Known issues and limitations

- **Weather test year is one year (2025).** The archived weather-model runs are complete only from 2022 on for
  `best_match` and from Feb 2024 for ECMWF; a multi-year test would need the ECMWF column to start later.
- **`previous_day1` is the previous day's model run.** The weather model had observations up to 12–24 h before
  the cutoff, TimesFM up to the last hour. The comparison is tilted slightly in TimesFM's favour.
- **Grid values, not stations.** Truth and history are ERA5 grid cells (9–25 km), smoother than a station.
  The weather models are scored against that same ERA5; `best_match` carries a +0.7 °C bias against it.
- **Open-Meteo returns less past data than requested.** `past_days=92` yields ~58 days for Berlin; the server
  drops the empty leading block instead of back-filling it (which it silently did before, feeding TimesFM a
  month of flat line). The page shows the real context length.
- **Ragged multivariate batches come back as NaN** from `timesfm3`. Contexts of different length in one
  `predict_batch` call produce all-NaN output without an error; the server trims them to equal length.
- **First request per city takes ~4 s** (live forecast plus three chained hindcast runs on the CPU); results
  are cached per hour in memory only and vanish on restart.
- **`timesfm_cov` is ten times slower** than the plain variant (515 s vs 53 s per city) and no better.
- **Dead code in `src/erdbeben/pages/`.** Overview, Time Beam, Comparison and Depth are kept from the original
  project but not routed; `react-router-dom` stays a dependency only because of them.
- **The globe preview on the start page is synthetic.** The seismic belts there are drawn by hand; the real
  data only loads on the earthquake page.
- **Desktop only.** The pages are laid out for 1440 × 900; the start page stacks below 1100 px, the three
  scenario pages do not. The electricity and earthquake pages are dark-mode only.
- **Intel Macs are stuck on torch 2.2.2**, hence `numpy<2` and the `RMSNorm` shim. Apple Silicon and Linux
  run a current torch.
- **The TimesFM 3.0 weights are non-commercial.** Run it locally, do not ship it as a service.

## Run it yourself

Requirements: Node 22, Python 3.12, [uv](https://docs.astral.sh/uv/). The TimesFM weights (1.2 GB) are
downloaded from Hugging Face on the first run.

```bash
git clone https://github.com/Litorian113/FutureForecast.git && cd FutureForecast
npm install
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt

npm run dev                          # http://localhost:5503  (start page, all three scenarios)
.venv/bin/python weather/server.py   # port 8000, only the weather page needs it (it computes live)
```

The backtest results ship as JSON in the repo, so the pages work right away. To recompute the numbers:

```bash
.venv/bin/python weather/prepare_weather.py     # ERA5 history for seven cities (cached)
.venv/bin/python weather/nwp.py                 # archived weather-model runs of 2025
.venv/bin/python weather/backtest.py --models persistence naive_week climatology blend nwp nwp_ecmwf
.venv/bin/python weather/backtest.py --models timesfm timesfm_multi timesfm_cov timesfm_long   # ≈ 25 min per city
.venv/bin/python weather/backtest.py            # assemble the JSON
.venv/bin/python weather/report.py              # Markdown tables
```

The compute pipelines for electricity and earthquakes live in their original projects (FutureGrid, the
earthquake visualisation); this repo contains their pages and finished results.

Intel Mac: torch 2.2.2 is the last release, hence `numpy<2` and the RMSNorm shim in `weather/torch_compat.py`.
On Apple Silicon and Linux a current torch works as-is.

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

Stack: React 18, TypeScript, Vite (multi-page), three.js for the globe, every chart hand-written SVG.
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
The remaining graphics are original work. The bundled JSON files are results derived from the sources above,
not raw data.

## About

Made in 2026 at HfG Schwäbisch Gmünd as a question to a new tool: how far does a foundation model for time
series get when measured honestly? The answer in one sentence:

> *A foundation model for time series is a very good statistician who knows nothing about the world.
> Where the series contains the world, it wins. Where the world happens outside the series, you have to bring it in.*

Franz Anhäupl · built with Claude Code
