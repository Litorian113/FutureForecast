"""
TimesFM 3.0 zero-shot variants for the hourly-weather backtest. Every entry in MODELS is a
batch function

    fn(histories: list[dict[str, np.ndarray]], horizon: int, aux: list[dict]) -> list[dict]

with the same result layout as models_classic (variable -> mean/q10/q90 (+ "q": all nine
quantiles p = 0.1 … 0.9, shape (horizon, 9)), used for the rain probability).

  timesfm        temperature only, context 2 208 h (92 days, what the live server has)
  timesfm_long   temperature only, context 8 760 h (one year: sees last year's season)
  timesfm_cov    temperature, 2 208 h + hour-of-day / day-of-year sin-cos as past+future covariates
  timesfm_multi  temp + rh + precip + cloud + wind + pressure as a 6-variate context (variate
                 attention), all six forecast; the only variant that yields a weather symbol

make_positive is off (temperatures go below zero); rh/precip/cloud/wind are clipped to their
physical range afterwards. No calibration, no training. The 3.0 weights are non-commercial.
"""
from __future__ import annotations

import os
import sys
import time
import warnings

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import torch_compat  # noqa: E402,F401  (must precede timesfm3)
from models_classic import NUMERIC, _clip  # noqa: E402

MODEL_ID = "google/timesfm-3.0-pytorch"
BATCH = 8
CONTEXT = 2208
MULTI_VARS = ["temp", "rh", "precip", "cloud", "wind", "pressure"]
_forecaster = None


def forecaster():
    global _forecaster
    if _forecaster is None:
        from timesfm3 import ModelConfig, TimesFM3Forecaster

        t0 = time.time()
        _forecaster = TimesFM3Forecaster(ModelConfig(checkpoint_path=MODEL_ID, per_core_batch_size=BATCH, device="cpu"))
        print(f"   TimesFM loaded in {time.time() - t0:.1f} s", flush=True)
    return _forecaster


def _pack(var: str, fc: np.ndarray, q: np.ndarray, H: int) -> dict:
    fc, q = fc[:H].astype(np.float64), q[:H].astype(np.float64)
    q = np.sort(q, axis=1)  # monotone quantiles
    mean = np.clip(fc, q[:, 0], q[:, 8])  # q10 <= mean <= q90
    return {"mean": _clip(var, mean), "q10": _clip(var, q[:, 0]), "q90": _clip(var, q[:, 8]), "q": _clip(var, q)}


def _run(contexts, H, pf_cov=None, variates=None) -> list[dict]:
    fc = forecaster()
    outs = []
    for b in range(0, len(contexts), BATCH):
        ctx = contexts[b : b + BATCH]
        cov = pf_cov[b : b + BATCH] if pf_cov is not None else None
        res = list(fc.predict_batch(ctx, horizon=H, past_future_covariates=cov, return_quantiles=True, make_positive=False))
        for o in res:
            f, q = np.asarray(o.forecast), np.asarray(o.quantiles)
            if variates is None:
                outs.append({"temp": _pack("temp", f, q, H)})
            else:
                outs.append({v: _pack(v, f[i], q[i], H) for i, v in enumerate(variates)})
        print(f"    {min(b + BATCH, len(contexts))}/{len(contexts)}", flush=True)
    return outs


def _ctx(x: np.ndarray, n: int) -> np.ndarray:
    return x[-n:].astype(np.float32)


def timesfm(histories, H, aux, context: int = CONTEXT):
    return _run([_ctx(h["temp"], context) for h in histories], H)


def timesfm_long(histories, H, aux):
    return timesfm(histories, H, aux, context=8760)


def calendar_covariates(cutoff: pd.Timestamp, context: int, H: int) -> np.ndarray:
    ts = cutoff - pd.Timedelta(hours=context) + pd.to_timedelta(np.arange(context + H), "h")
    hour = ts.hour.to_numpy() / 24.0
    doy = (ts.dayofyear.to_numpy() - 1 + ts.hour.to_numpy() / 24.0) / 365.25
    return np.stack([np.sin(2 * np.pi * hour), np.cos(2 * np.pi * hour),
                     np.sin(2 * np.pi * doy), np.cos(2 * np.pi * doy)]).astype(np.float32)


def timesfm_cov(histories, H, aux, context: int = CONTEXT):
    covs = [calendar_covariates(a["cutoff"], context, H) for a in aux]
    return _run([_ctx(h["temp"], context) for h in histories], H, pf_cov=covs)


def timesfm_multi(histories, H, aux, context: int = CONTEXT):
    contexts = [np.stack([_ctx(h[v], context) for v in MULTI_VARS]) for h in histories]
    return _run(contexts, H, variates=MULTI_VARS)


MODELS = {
    "timesfm": timesfm,
    "timesfm_long": timesfm_long,
    "timesfm_cov": timesfm_cov,
    "timesfm_multi": timesfm_multi,
}
