import { useEffect } from 'react';
import type { CutoffRecord } from '../types';
import { styleOf } from '../lib/models';
import { fmtDate, parseLocal } from '../lib/format';

interface Props {
  cutoffs: CutoffRecord[];
  index: number;
  playing: boolean;
  winner: string | null;
  onChange: (i: number) => void;
  onPlay: (p: boolean) => void;
}

const PlayIcon = () => (
  <svg viewBox="0 0 16 16">
    <path d="M4 2.5v11l9-5.5z" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 16 16">
    <path d="M3.5 2.5h3v11h-3zm6 0h3v11h-3z" />
  </svg>
);
const Prev = () => (
  <svg viewBox="0 0 16 16">
    <path d="M11 2.5v11L4 8zM3 2.5h1.5v11H3z" />
  </svg>
);
const Next = () => (
  <svg viewBox="0 0 16 16">
    <path d="M5 2.5v11L12 8zM11.5 2.5H13v11h-1.5z" />
  </svg>
);

/** Bottom toolbar (play, prev/next, cutoff date, winner) plus the cutoff slider with tick marks. */
export default function BacktestSlider({ cutoffs, index, playing, winner, onChange, onPlay }: Props) {
  const n = cutoffs.length;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => onChange((index + 1) % n), 900);
    return () => window.clearInterval(id);
  }, [playing, index, n, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onChange((index - 1 + n) % n);
      else if (e.key === 'ArrowRight') onChange((index + 1) % n);
      else if (e.key === ' ') {
        e.preventDefault();
        onPlay(!playing);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, n, playing, onChange, onPlay]);

  const date = parseLocal(cutoffs[index].cutoff);
  const st = winner ? styleOf(winner) : null;
  const yearStarts = cutoffs
    .map((c, i) => ({ i, y: parseLocal(c.cutoff).getFullYear() }))
    .filter((c, i, arr) => i === 0 || arr[i - 1].y !== c.y);

  return (
    <div className="bottom">
      <div className="toolbar">
        <button className="btn" onClick={() => onChange((index - 1 + n) % n)} aria-label="previous week">
          <Prev />
        </button>
        <button className="btn" onClick={() => onPlay(!playing)} aria-label={playing ? 'pause' : 'play'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button className="btn" onClick={() => onChange((index + 1) % n)} aria-label="next week">
          <Next />
        </button>
        <span className="sepv" />
        <span className="label">Cutoff</span>
        <span className="value">{fmtDate(date)}</span>
        <span className="sepv" />
        <span className="label">Week</span>
        <span className="value">
          {index + 1} / {n}
        </span>
        <span className="sepv" />
        <span className="label">Best this week</span>
        <span className="value win">
          {st ? (
            <>
              <i style={{ background: st.color }} />
              {st.label}
            </>
          ) : (
            '–'
          )}
        </span>
      </div>
      <div className="slider">
        <div className="ticks">
          <svg>
            {cutoffs.map((_, i) => {
              const px = `${((i / (n - 1)) * 100).toFixed(3)}%`;
              const isYear = yearStarts.some((c) => c.i === i);
              return (
                <line
                  key={i}
                  x1={px}
                  x2={px}
                  y1={isYear ? 12 : 17}
                  y2={isYear ? 32 : 27}
                  stroke={isYear ? '#898781' : '#4a4a48'}
                  strokeWidth={1}
                />
              );
            })}
          </svg>
        </div>
        <input
          type="range"
          min={0}
          max={n - 1}
          value={index}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="backtest cutoff"
        />
      </div>
      <div className="sliderLabels">
        <span>{fmtDate(parseLocal(cutoffs[0].cutoff))}</span>
        {yearStarts.slice(1).map((c) => (
          <span key={c.i}>{c.y}</span>
        ))}
        <span>{fmtDate(parseLocal(cutoffs[n - 1].cutoff))}</span>
      </div>
    </div>
  );
}
