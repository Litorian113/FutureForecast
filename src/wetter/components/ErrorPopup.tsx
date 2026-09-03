import type { ExpectedError, Source } from '../types';
import { LABELS, STYLE } from '../lib/models';
import Modal from './Modal';

interface Props {
  err: ExpectedError | null;
  source: Source;
  onClose: () => void;
}

const SHOW = ['persistence', 'blend', 'climatology', 'timesfm', 'timesfm_multi', 'timesfm_long', 'nwp', 'nwp_ecmwf'];
const W = 780;
const H = 300;
const PAD = { top: 18, right: 20, bottom: 34, left: 48 };

/** MAE per lead day (1..7) of the baselines, TimesFM and the weather model: the honest part. */
export default function ErrorPopup({ err, onClose }: Props) {
  if (!err) {
    return (
      <Modal title="Expected error" subtitle="No backtest found" onClose={onClose}>
        <p className="note">
          The server did not find public/data/backtest.json. Run <code>.venv/bin/python weather/backtest.py</code>
        </p>
      </Modal>
    );
  }
  const models = SHOW.filter((m) => err.byLead[m]);
  const vals = models.flatMap((m) => err.byLead[m].filter((v): v is number => v != null));
  const yMax = Math.ceil(Math.max(...vals, 1) * 1.1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (lead: number) => PAD.left + ((lead - 1) / 6) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
  const ticks = Array.from({ length: Math.min(6, yMax) + 1 }, (_, i) => (i * yMax) / Math.min(6, yMax));

  return (
    <Modal
      title="Expected temperature error by lead day"
      subtitle={`Backtest ${err.city} ${err.year}, ${err.cutoffs} cutoffs every 2 days, mean absolute error (MAE) of the hourly 2 m temperature against ERA5`}
      onClose={onClose}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="MAE by lead day">
        <g className="axis">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end">
                {t.toFixed(1)}
              </text>
            </g>
          ))}
          {[1, 2, 3, 4, 5, 6, 7].map((l) => (
            <text key={l} x={x(l)} y={H - 12} textAnchor="middle">
              Day {l}
            </text>
          ))}
          <text x={PAD.left - 8} y={PAD.top - 6} textAnchor="end" style={{ fontSize: 10 }}>
            °C
          </text>
        </g>
        {models.map((m) => {
          const st = STYLE[m] ?? { color: 'var(--c-base)' };
          const pts = err.byLead[m].map((v, i) => (v == null ? null : `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
          return (
            <g key={m}>
              <path d={`M${pts.join('L')}`} fill="none" stroke={st.color} strokeWidth={m.startsWith('timesfm') || m === 'nwp' ? 2.4 : 1.6} strokeDasharray={st.dash} />
              {err.byLead[m].map((v, i) => v != null && <circle key={i} cx={x(i + 1)} cy={y(v)} r={3} fill={st.color} />)}
            </g>
          );
        })}
      </svg>
      <table className="errTable">
        <thead>
          <tr>
            <th>Model</th>
            {[1, 2, 3, 4, 5, 6, 7].map((l) => (
              <th key={l}>Day {l}</th>
            ))}
            <th>Skill</th>
            <th>Symbol</th>
            <th>Band 80 %</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const st = STYLE[m] ?? { color: 'var(--c-base)' };
            return (
              <tr key={m}>
                <td>
                  <span className="nm" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <i className={`swatch${st.dash ? ' dashed' : ''}`} style={{ color: st.color }} />
                    {LABELS[m] ?? m}
                  </span>
                </td>
                {err.byLead[m].map((v, i) => (
                  <td key={i} className="num">
                    {v == null ? '–' : v.toFixed(2)}
                  </td>
                ))}
                <td className="num">{fmt(err.skill[m], 2)}</td>
                <td className="num">{err.symbolHit[m] == null ? '–' : `${Math.round(err.symbolHit[m]! * 100)} %`}</td>
                <td className="num">{err.coverage80[m] == null ? '–' : `${Math.round(err.coverage80[m]! * 100)} %`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note">
        Skill = 1 − MAE/MAE<sub>climatology</sub> (0 = as good as the long-term mean, 1 = perfect). Symbol = hit rate of the
        five weather classes per day. Band = share of hours in which the truth lies inside the 10–90 % band (target 80 %).
        The numbers come from the backtest of the climatically closest test city, not from the place you searched.
      </p>
    </Modal>
  );
}

const fmt = (v: number | null | undefined, d: number) => (v == null ? '–' : v.toFixed(d));
