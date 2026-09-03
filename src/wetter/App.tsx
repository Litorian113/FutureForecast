import { useCallback, useEffect, useState } from 'react';
import { ServerDown, fetchForecast } from './lib/api';
import type { ForecastResponse, GeoHit, Source } from './types';
import Search from './components/Search';
import Hero from './components/Hero';
import DayCards from './components/DayCards';
import HourlyChart from './components/HourlyChart';
import ErrorPopup from './components/ErrorPopup';
import Duel from './components/Duel';

/** How far the page looks ahead. The server and the backtest keep the full 168 h; the cards, the
 * curve and the duel widget show the first DAYS_SHOWN days of it. */
const DAYS_SHOWN = 5;

const LS_CITY = 'fw.city.v2'; // v2: entries from the German version carried German country names
const LS_SOURCE = 'fw.source';
const LS_THEME = 'fw.theme';
type Theme = 'system' | 'light' | 'dark';
const THEME_LABEL: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

function loadTheme(): Theme {
  const q = new URLSearchParams(location.search).get('theme');
  if (q === 'dark' || q === 'light') return q;
  try {
    const t = localStorage.getItem(LS_THEME);
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* ignore */
  }
  return 'system';
}
const DEFAULT_CITY: GeoHit = { name: 'Berlin', country: 'Germany', admin1: 'Land Berlin', lat: 52.52437, lon: 13.41053, tz: 'Europe/Berlin' };

function loadCity(): GeoHit {
  try {
    const raw = localStorage.getItem(LS_CITY);
    if (raw) return JSON.parse(raw) as GeoHit;
  } catch {
    /* ignore */
  }
  return DEFAULT_CITY;
}

function loadSource(): Source {
  try {
    const s = localStorage.getItem(LS_SOURCE);
    if (s === 'timesfm' || s === 'nwp' || s === 'both') return s;
  } catch {
    /* ignore */
  }
  return 'both';
}

export default function App() {
  const [city, setCity] = useState<GeoHit>(loadCity);
  const [source, setSourceState] = useState<Source>(loadSource);
  const [data, setData] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'down' | string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [popup, setPopup] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);

  // 'system' follows prefers-color-scheme; 'light' / 'dark' stamp data-theme on <html>.
  // ?theme=dark|light in the URL forces one (used for screenshots).
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      if (theme === 'system') localStorage.removeItem(LS_THEME);
      else localStorage.setItem(LS_THEME, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const cycleTheme = () => setTheme((t) => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system'));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchForecast(city)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setSelected(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ServerDown ? 'down' : String((e as Error).message ?? e));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [city]);

  const pick = useCallback((h: GeoHit) => {
    setCity(h);
    try {
      localStorage.setItem(LS_CITY, JSON.stringify(h));
    } catch {
      /* ignore */
    }
  }, []);

  const setSource = (s: Source) => {
    setSourceState(s);
    try {
      localStorage.setItem(LS_SOURCE, s);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="frame">
      <header className="top">
        <div className="brand">
          <a className="back" href="./">← Scenarios</a>
          <span className="name">FutureWeather</span>
          <span className="tag">{DAYS_SHOWN} days from the history alone · TimesFM 3.0 against a weather model</span>
        </div>
        <Search onPick={pick} />
        <div className="topRight">
          {data && (
            <span className="num">
              Updated {data.generated.replace('T', ' ')} · context {data.contextHours} h · {(data.runtimeMs / 1000).toFixed(1)} s
            </span>
          )}
          {loading && <span className="loading">loading …</span>}
          <button className="pillBtn" onClick={cycleTheme} aria-label={`Colour scheme: ${THEME_LABEL[theme]}, switch`} title="Switch colour scheme">
            {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'} {THEME_LABEL[theme]}
          </button>
        </div>
      </header>

      {error === 'down' && !data ? (
        <section className="raised state" aria-live="polite">
          <h2>The forecast server is not running</h2>
          <p>The page computes live with TimesFM 3.0. Start the server in the project folder, then reload:</p>
          <code>.venv/bin/python weather/server.py</code>
        </section>
      ) : error && !data ? (
        <section className="raised state" aria-live="polite">
          <h2>No forecast</h2>
          <p>{error}</p>
        </section>
      ) : data ? (
        <>
          <div className={`heroRow${loading ? ' skeleton' : ''}`}>
            <Hero data={data} source={source} onSource={setSource} onChip={() => setPopup(true)} days={DAYS_SHOWN} />
            <DayCards data={data} source={source} selected={selected} onSelect={setSelected} days={DAYS_SHOWN} />
            <Duel err={data.expectedError} hind={data.hindcast} days={DAYS_SHOWN} source={source} onOpen={() => setPopup(true)} />
          </div>
          <section className={`chartPanel${loading ? ' skeleton' : ''}`} aria-label="Hourly curve">
            <div className="chartHead">
              <span className="label">Hourly temperature · 14 days back, {DAYS_SHOWN} days ahead</span>
              <div className="legend">
                <span>
                  <i className="swatch" style={{ color: 'var(--c-history)' }} /> measured
                </span>
                {data.hindcast && (
                  <span title={`${data.hindcast.runs} runs of ${data.hindcastDays} days, started on ${data.hindcast.origins.map((o) => o.slice(5, 10)).join(', ')}`}>
                    <i className="swatch dashed" style={{ color: 'var(--muted)' }} /> predicted back then
                  </span>
                )}
                {source !== 'nwp' && (
                  <span>
                    <i className="swatch" style={{ color: 'var(--c-timesfm)' }} /> TimesFM 3.0 <i className="swatch band" /> 10–90 %
                  </span>
                )}
                {source !== 'timesfm' && (
                  <span>
                    <i className="swatch" style={{ color: 'var(--c-nwp)' }} /> Weather model (Open-Meteo)
                  </span>
                )}
              </div>
            </div>
            <HourlyChart data={data} source={source} selectedDay={selected} days={DAYS_SHOWN} />
          </section>
          {popup && <ErrorPopup err={data.expectedError} source={source} onClose={() => setPopup(false)} />}
        </>
      ) : (
        <section className="raised state" aria-live="polite">
          <h2>Computing the forecast …</h2>
          <p>TimesFM 3.0 runs on the CPU, this takes a few seconds.</p>
        </section>
      )}
    </div>
  );
}
