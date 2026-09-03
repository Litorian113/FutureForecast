import type { DayCard, ForecastResponse, Source } from '../types';
import { fmtDate, fmtDay, fmtDeg, parseLocal } from '../lib/format';
import WeatherIcon from './Icons';

interface Props {
  data: ForecastResponse;
  source: Source;
  selected: number | null;
  onSelect: (i: number | null) => void;
  days: number;
}

/** Seven raised day cards; the selected one is pressed in. With "both" the card splits into two
 * rows, one per source, separated by a hairline and marked by the source's colour. */
export default function DayCards({ data, source, selected, onSelect, days }: Props) {
  return (
    <div className="days" role="list" aria-label={`${days} Tage`} style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
      {data.daily.timesfm.slice(0, days).map((tf, i) => {
        const nwp = data.daily.nwp[i];
        const d = parseLocal(tf.date);
        const one: DayCard = source === 'nwp' ? nwp : tf;
        return (
          <button
            key={tf.date}
            className={`day${source === 'both' ? ' split' : ''}`}
            role="listitem"
            aria-pressed={selected === i}
            onClick={() => onSelect(selected === i ? null : i)}
            aria-label={`${fmtDay(d)}: ${source === 'both' ? `TimesFM ${describe(tf)}; Wettermodell ${describe(nwp)}` : describe(one)}`}
          >
            <span className="head">
              <span className="dow">{i === 0 ? 'Heute' : i === 1 ? 'Morgen' : fmtDay(d)}</span>
              <span className="date">{fmtDate(d)}</span>
            </span>
            {source === 'both' ? (
              <>
                <Row card={tf} accent="var(--c-timesfm)" label="TimesFM" />
                <Row card={nwp} accent="var(--c-nwp)" label="Wettermodell" />
              </>
            ) : (
              <span className="single">
                <WeatherIcon kind={one.icon} className="icon" />
                <span className="temps">
                  <span className="hi num">{fmtDeg(one.tmax)}</span>
                  <span className="lo num">{fmtDeg(one.tmin)}</span>
                </span>
                <span className="rain num">{Math.round(one.pRain * 100)} % Regen</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Row({ card, accent, label }: { card: DayCard; accent: string; label: string }) {
  return (
    <span className="row">
      <span className="src" style={{ color: accent }}>
        {label}
      </span>
      <WeatherIcon kind={card.icon} className="icon" title={`${label}: ${card.icon ?? '–'}`} />
      <span className="temps">
        <span className="hi num">{fmtDeg(card.tmax)}</span>
        <span className="lo num">{fmtDeg(card.tmin)}</span>
      </span>
      <span className="rain num">{Math.round(card.pRain * 100)} %</span>
    </span>
  );
}

function describe(c: DayCard): string {
  return `${c.icon ?? 'unbekannt'}, ${fmtDeg(c.tmax)} bis ${fmtDeg(c.tmin)}, Regen ${Math.round(c.pRain * 100)} %`;
}
