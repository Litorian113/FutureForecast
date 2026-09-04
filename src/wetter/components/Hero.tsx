import type { ForecastResponse, Source } from '../types';
import { fmtDeg, fmtPm } from '../lib/format';
import WeatherIcon from './Icons';

interface Props {
  data: ForecastResponse;
  source: Source;
  onSource: (s: Source) => void;
  onChip: () => void;
  days: number;
}

/** Expected temperature error of the shown source at lead day 1 and `days`, from the backtest of
 * the climatically closest test city. TimesFM on the page is the 6-variate variant. */
export function expectedLine(
  data: ForecastResponse,
  source: Source,
  days: number,
): { d1: number | null; dn: number | null; model: string } | null {
  const e = data.expectedError;
  if (!e) return null;
  const chain = source === 'nwp' ? ['nwp'] : ['timesfm_multi', 'timesfm', 'blend'];
  const model = chain.find((m) => e.byLead[m]);
  if (!model) return null;
  const lead = e.byLead[model];
  return { d1: lead[0], dn: lead[days - 1], model };
}

export default function Hero({ data, source, onSource, onChip, days }: Props) {
  const exp = expectedLine(data, source, days);
  return (
    <section className="raised hero" aria-label="Current weather">
      <div className="place">
        <span className="city">{data.city.name}</span>
        <span className="country">{[data.city.country, data.city.tz].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="bigTemp num" aria-label={`Now ${fmtDeg(data.current.temp)}`}>
        {fmtDeg(data.current.temp)}
      </div>
      <WeatherIcon kind={data.current.icon} className="nowIcon" title={`now: ${data.current.icon}`} />
      <div className="sentence">
        <div className="seg" role="group" aria-label="Source">
          {(['timesfm', 'nwp', 'both'] as Source[]).map((s) => (
            <button key={s} aria-pressed={source === s} onClick={() => onSource(s)}>
              {s === 'timesfm' ? 'TimesFM' : s === 'nwp' ? 'Weather model' : 'both'}
            </button>
          ))}
        </div>
        <button className="chip" onClick={onChip} aria-label="Expected error from the backtest, open details">
          <span className="dot" style={{ background: source === 'nwp' ? 'var(--c-nwp)' : 'var(--c-timesfm)' }} />
          {exp ? (
            <>
              Expected error day 1: <b>{fmtPm(exp.d1)}</b> · day {days}: <b>{fmtPm(exp.dn)}</b>
            </>
          ) : (
            <>Expected error: no backtest yet</>
          )}
        </button>
      </div>
    </section>
  );
}
