import type { ForecastResponse, Source } from '../types';
import { fmtDeg, fmtPm } from '../lib/format';
import WeatherIcon from './Icons';

interface Props {
  data: ForecastResponse;
  source: Source;
  onSource: (s: Source) => void;
  onChip: () => void;
}

const SENTENCE: Record<Source, string> = {
  timesfm: 'Nächste Woche laut Historie allein',
  nwp: 'Nächste Woche laut Wettermodell',
  both: 'Nächste Woche: Historie allein neben dem Wettermodell',
};

/** Expected temperature error of the shown source at lead day 1 and 5, from the backtest of the
 * climatically closest test city. TimesFM on the page is the 6-variate variant. */
export function expectedLine(data: ForecastResponse, source: Source): { d1: number | null; d5: number | null; model: string } | null {
  const e = data.expectedError;
  if (!e) return null;
  const chain = source === 'nwp' ? ['nwp'] : ['timesfm_multi', 'timesfm', 'blend'];
  const model = chain.find((m) => e.byLead[m]);
  if (!model) return null;
  const lead = e.byLead[model];
  return { d1: lead[0], d5: lead[4], model };
}

export default function Hero({ data, source, onSource, onChip }: Props) {
  const exp = expectedLine(data, source);
  return (
    <section className="raised hero" aria-label="Aktuelles Wetter">
      <div className="place">
        <span className="city">{data.city.name}</span>
        <span className="country">{[data.city.country, data.city.tz].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="bigTemp num" aria-label={`Aktuell ${fmtDeg(data.current.temp)}`}>
        {fmtDeg(data.current.temp)}
      </div>
      <WeatherIcon kind={data.current.icon} className="nowIcon" title={`jetzt: ${data.current.icon}`} />
      <div className="sentence">
        <span>{SENTENCE[source]}</span>
        <div className="seg" role="group" aria-label="Quelle">
          {(['timesfm', 'nwp', 'both'] as Source[]).map((s) => (
            <button key={s} aria-pressed={source === s} onClick={() => onSource(s)}>
              {s === 'timesfm' ? 'TimesFM' : s === 'nwp' ? 'Wettermodell' : 'beide'}
            </button>
          ))}
        </div>
        <button className="chip" onClick={onChip} aria-label="Erwarteter Fehler aus dem Backtest, Details öffnen">
          <span className="dot" style={{ background: source === 'nwp' ? 'var(--c-nwp)' : 'var(--c-timesfm)' }} />
          {exp ? (
            <>
              Erwarteter Fehler Tag 1: <b>{fmtPm(exp.d1)}</b> · Tag 5: <b>{fmtPm(exp.d5)}</b>
            </>
          ) : (
            <>Erwarteter Fehler: Backtest fehlt</>
          )}
        </button>
      </div>
    </section>
  );
}
