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

const LS_CITY = 'fw.city';
const LS_SOURCE = 'fw.source';
const LS_THEME = 'fw.theme';
type Theme = 'system' | 'light' | 'dark';
const THEME_LABEL: Record<Theme, string> = { system: 'Auto', light: 'Hell', dark: 'Dunkel' };

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
const DEFAULT_CITY: GeoHit = { name: 'Berlin', country: 'Deutschland', admin1: 'Land Berlin', lat: 52.52437, lon: 13.41053, tz: 'Europe/Berlin' };

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
          <span className="name">FutureWeather</span>
          <span className="tag">{DAYS_SHOWN} Tage aus der Historie allein · TimesFM 3.0 gegen ein Wettermodell</span>
        </div>
        <Search onPick={pick} />
        <div className="topRight">
          {data && (
            <span className="num">
              Stand {data.generated.replace('T', ' ')} · Kontext {data.contextHours} h · {(data.runtimeMs / 1000).toFixed(1)} s
            </span>
          )}
          {loading && <span className="loading">lädt …</span>}
          <button className="pillBtn" onClick={cycleTheme} aria-label={`Farbschema: ${THEME_LABEL[theme]}, wechseln`} title="Farbschema wechseln">
            {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'} {THEME_LABEL[theme]}
          </button>
        </div>
      </header>

      {error === 'down' && !data ? (
        <section className="raised state" aria-live="polite">
          <h2>Der Vorhersage-Server läuft nicht</h2>
          <p>Die Seite rechnet live mit TimesFM 3.0. Server im Projektordner starten, dann neu laden:</p>
          <code>.venv/bin/python weather/server.py</code>
        </section>
      ) : error && !data ? (
        <section className="raised state" aria-live="polite">
          <h2>Keine Vorhersage</h2>
          <p>{error}</p>
        </section>
      ) : data ? (
        <>
          <div className={`heroRow${loading ? ' skeleton' : ''}`}>
            <Hero data={data} source={source} onSource={setSource} onChip={() => setPopup(true)} days={DAYS_SHOWN} />
            <DayCards data={data} source={source} selected={selected} onSelect={setSelected} days={DAYS_SHOWN} />
            <Duel err={data.expectedError} hind={data.hindcast} days={DAYS_SHOWN} source={source} onOpen={() => setPopup(true)} />
          </div>
          <section className={`chartPanel${loading ? ' skeleton' : ''}`} aria-label="Stundenkurve">
            <div className="chartHead">
              <span className="label">Stündliche Temperatur · 14 Tage zurück, {DAYS_SHOWN} Tage voraus</span>
              <div className="legend">
                <span>
                  <i className="swatch" style={{ color: 'var(--c-history)' }} /> gemessen
                </span>
                {data.hindcast && (
                  <span title={`${data.hindcast.runs} Läufe à ${data.hindcastDays} Tage, gestartet am ${data.hindcast.origins.map((o) => o.slice(5, 10)).join(', ')}`}>
                    <i className="swatch dashed" style={{ color: 'var(--muted)' }} /> damals vorhergesagt
                  </span>
                )}
                {source !== 'nwp' && (
                  <span>
                    <i className="swatch" style={{ color: 'var(--c-timesfm)' }} /> TimesFM 3.0 <i className="swatch band" /> 10–90 %
                  </span>
                )}
                {source !== 'timesfm' && (
                  <span>
                    <i className="swatch" style={{ color: 'var(--c-nwp)' }} /> Wettermodell (Open-Meteo)
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
          <h2>Berechne Vorhersage …</h2>
          <p>TimesFM 3.0 rechnet auf der CPU, das dauert ein paar Sekunden.</p>
        </section>
      )}
    </div>
  );
}
