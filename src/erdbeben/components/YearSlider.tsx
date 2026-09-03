interface Props {
  min: number;
  max: number;
  value: number;
  onChange: (year: number) => void;
  /** first year that is a forecast (track turns green from there) */
  forecastFrom?: number;
  playing?: boolean;
  onTogglePlay?: () => void;
  info?: string;
}

export function YearSlider({ min, max, value, onChange, forecastFrom, playing, onTogglePlay, info }: Props) {
  const isForecast = forecastFrom !== undefined && value >= forecastFrom;
  const histPct = forecastFrom === undefined || forecastFrom > max ? 100 : ((forecastFrom - 0.5 - min) / (max - min)) * 100;
  return (
    <div className="yearSlider">
      <div className="yearIndicator">
        Selected Year: <strong>{value}</strong>
        {isForecast && <span className="badge">FORECAST</span>}
        {info && (
          <div style={{ fontSize: 12, color: '#bbb', marginTop: 2 }}>{info}</div>
        )}
      </div>
      <span className="scale">{min}</span>
      <div className="track">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          style={{ ['--hist-pct' as string]: `${histPct}%` }}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Year"
        />
      </div>
      <span className="scale" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {max}
        {onTogglePlay && (
          <button type="button" className="playBtn" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
        )}
      </span>
    </div>
  );
}
