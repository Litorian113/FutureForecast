import type { DayCard, ForecastResponse, Source } from '../types';
import { fmtDate, fmtDay, fmtDeg, parseLocal } from '../lib/format';
import WeatherIcon from './Icons';

interface Props {
  data: ForecastResponse;
  source: Source;
  selected: number | null;
  onSelect: (i: number | null) => void;
}

/** Seven raised day cards; the selected one is pressed in. With "both", two compact rows. */
export default function DayCards({ data, source, selected, onSelect }: Props) {
  return (
    <div className="days" role="list" aria-label="Sieben Tage">
      {data.daily.timesfm.map((tf, i) => {
        const nwp = data.daily.nwp[i];
        const d = parseLocal(tf.date);
        const one: DayCard = source === 'nwp' ? nwp : tf;
        return (
          <button
            key={tf.date}
            className="day"
            role="listitem"
            aria-pressed={selected === i}
            onClick={() => onSelect(selected === i ? null : i)}
            aria-label={`${fmtDay(d)}: ${describe(one)}`}
          >
            <span className="dow">{i === 0 ? 'Heute' : i === 1 ? 'Morgen' : fmtDay(d)}</span>
            <span className="date">{fmtDate(d)}</span>
            {source === 'both' ? (
              <>
                <Row card={tf} color="var(--c-timesfm)" label="TimesFM" />
                <Row card={nwp} color="var(--c-nwp)" label="Wettermodell" />
              </>
            ) : (
              <>
                <WeatherIcon kind={one.icon} className="icon" />
                <span className="hi num">{fmtDeg(one.tmax)}</span>
                <span className="lo num">{fmtDeg(one.tmin)}</span>
                <span className="rain num">Regen {Math.round(one.pRain * 100)} %</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Row({ card, color, label }: { card: DayCard; color: string; label: string }) {
  return (
    <span className="row" title={label} style={{ borderLeft: `3px solid ${color}` }}>
      <WeatherIcon kind={card.icon} className="icon" title={`${label}: ${card.icon ?? '–'}`} />
      <span className="t num">
        {fmtDeg(card.tmax)} <small>{fmtDeg(card.tmin)}</small>
      </span>
      <span className="p num">{Math.round(card.pRain * 100)} %</span>
    </span>
  );
}

function describe(c: DayCard): string {
  return `${c.icon ?? 'unbekannt'}, ${fmtDeg(c.tmax)} bis ${fmtDeg(c.tmin)}, Regen ${Math.round(c.pRain * 100)} %`;
}
