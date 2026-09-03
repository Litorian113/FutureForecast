"""
Weather symbols (5 classes) from WMO codes or from forecast variables, plus the rain-day event.

Classes: 0 clear, 1 cloudy, 2 rain, 3 snow, 4 fog.  Thunderstorms count as rain (not derivable
from a single time series).  A "rain day" is a day with >= 1 mm precipitation.

Truth per day, from the hourly ERA5 weather_code:  snow if >= 3 snow hours, else rain if >= 3
rain hours, else fog if >= 3 fog hours, else cloudy if >= 12 hours are not clear, else clear.

Model symbol per day, from forecast variables (the roadmap's rules): rain if pRain > 0.5 (snow
if in addition the daily mean temperature < 1 °C), else fog if mean RH > 95 % and mean wind
< 2 m/s (7.2 km/h), else cloudy if mean cloud cover > 60 %, else clear.
"""
from __future__ import annotations

import numpy as np

CLASSES = ["clear", "cloudy", "rain", "snow", "fog"]
CLEAR, CLOUDY, RAIN, SNOW, FOG = range(5)
RAIN_DAY_MM = 1.0


def code_to_class(code: np.ndarray) -> np.ndarray:
    c = np.asarray(code, dtype=float)
    out = np.full(c.shape, -1, dtype=int)
    out[(c == 0) | (c == 1)] = CLEAR
    out[(c == 2) | (c == 3)] = CLOUDY
    out[(c == 45) | (c == 48)] = FOG
    out[((c >= 51) & (c <= 67)) | ((c >= 80) & (c <= 82)) | (c >= 95)] = RAIN
    out[((c >= 71) & (c <= 77)) | (c == 85) | (c == 86)] = SNOW
    return out


def class_from_code_block(cls: np.ndarray) -> np.ndarray:
    """Hourly classes (..., h) of one day (or part of it) -> one class per block, -1 if < half the hours are known."""
    valid = (cls >= 0).sum(-1)
    snow = (cls == SNOW).sum(-1)
    rain = (cls == RAIN).sum(-1)
    fog = (cls == FOG).sum(-1)
    notclear = ((cls >= 0) & (cls != CLEAR)).sum(-1)
    out = np.where(snow >= 3, SNOW, np.where(rain >= 3, RAIN, np.where(fog >= 3, FOG, np.where(notclear * 2 >= valid, CLOUDY, CLEAR))))
    return np.where(valid * 2 >= cls.shape[-1], out, -1)


def daily_from_codes(codes: np.ndarray) -> np.ndarray:
    """codes (..., 24*d) -> class per day (..., d); -1 where most codes are missing."""
    cls = code_to_class(codes)
    return class_from_code_block(cls.reshape(cls.shape[:-1] + (cls.shape[-1] // 24, 24)))


def symbol_from_means(t, c, r, w, p_rain) -> np.ndarray:
    """The roadmap's rules on daily means (temperature, cloud, RH, wind) and a rain probability."""
    out = np.where(p_rain > 0.5, np.where(t < 1.0, SNOW, RAIN),
                   np.where((r > 95) & (w < 7.2), FOG, np.where(c > 60, CLOUDY, CLEAR)))
    ok = np.isfinite(t) & np.isfinite(c) & np.isfinite(p_rain)
    return np.where(ok, out, -1)


def rain_prob_from_quantiles(precip_q: np.ndarray) -> np.ndarray:
    """precip_q (..., 24*d, 9) quantile paths -> share of quantile levels whose daily sum >= 1 mm."""
    q = np.clip(np.asarray(precip_q, dtype=float), 0, None)
    shp = q.shape[:-2] + (q.shape[-2] // 24, 24, q.shape[-1])
    sums = q.reshape(shp).sum(-2)  # (..., d, 9)
    return (sums >= RAIN_DAY_MM).mean(-1)


def rain_day(precip: np.ndarray) -> np.ndarray:
    """precip (..., 24*d) -> 1.0 where the daily sum >= 1 mm (nan where missing)."""
    p = np.asarray(precip, dtype=float)
    shp = p.shape[:-1] + (p.shape[-1] // 24, 24)
    s = p.reshape(shp).sum(-1)
    return np.where(np.isfinite(s), (s >= RAIN_DAY_MM).astype(float), np.nan)


def daily_from_vars(temp, cloud, rh, wind, p_rain) -> np.ndarray:
    """Rule-based symbol (..., d) from hourly forecasts (..., 24*d) and a rain probability (..., d)."""
    def dm(x):
        x = np.asarray(x, dtype=float)
        return x.reshape(x.shape[:-1] + (x.shape[-1] // 24, 24)).mean(-1)

    return symbol_from_means(dm(temp), dm(cloud), dm(rh), dm(wind), np.asarray(p_rain, dtype=float))
