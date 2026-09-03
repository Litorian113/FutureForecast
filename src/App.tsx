import { useCallback, useEffect, useState } from 'react';
import { ServerDown, fetchForecast } from './lib/api';
import type { ForecastResponse, GeoHit, Source } from './types';
import Search from './components/Search';
import Hero from './components/Hero';
import DayCards from './components/DayCards';
import HourlyChart from './components/HourlyChart';
import ErrorPopup from './components/ErrorPopup';

const LS_CITY = 'fw.city';
const LS_SOURCE = 'fw.source';
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

  // ?theme=dark|light forces the palette (used for screenshots); otherwise prefers-color-scheme rules.
  useEffect(() => {
    const t = new URLSearchParams(location.search).get('theme');
    if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  }, []);

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
          <span className="tag">Sieben Tage aus der Historie allein · TimesFM 3.0 gegen ein Wettermodell</span>
        </div>
        <Search onPick={pick} />
        <div className="topRight">
          {data && (
            <span className="num">
              Stand {data.generated.replace('T', ' ')} · Kontext {data.contextHours} h · {(data.runtimeMs / 1000).toFixed(1)} s
            </span>
          )}
          {loading && <span className="loading">lädt …</span>}
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
            <Hero data={data} source={source} onSource={setSource} onChip={() => setPopup(true)} />
            <DayCards data={data} source={source} selected={selected} onSelect={setSelected} />
          </div>
          <section className={`raised chartPanel${loading ? ' skeleton' : ''}`} aria-label="Stundenkurve">
            <div className="chartHead">
              <span className="label">Stündliche Temperatur · 14 Tage zurück, 7 Tage voraus</span>
              <div className="legend">
                <span>
                  <i className="swatch" style={{ color: 'var(--c-history)' }} /> gemessen (ERA5 / Analyse)
                </span>
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
            <HourlyChart data={data} source={source} selectedDay={selected} />
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
