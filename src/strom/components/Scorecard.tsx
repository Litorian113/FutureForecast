import { useState } from 'react';
import type { Backtest } from '../types';
import { styleOf } from '../lib/models';
import { fmtMW, fmtPct, fmtSigned } from '../lib/format';
import Modal, { ExpandButton } from './Modal';

interface Props {
  data: Backtest;
  models: string[];
  visible: string[];
  onToggle: (m: string) => void;
}

type Col = {
  key: string;
  title: string;
  value: (m: string) => number | null;
  fmt: (v: number) => string;
  /** lower is better unless a target is given (distance to the target is minimised) */
  target?: number;
};

function columns(data: Backtest, full: boolean): Col[] {
  const s = data.summary;
  const cols: Col[] = [
    { key: 'mae', title: 'MAE', value: (m) => s[m].mae, fmt: fmtMW },
    { key: 'rmse', title: 'RMSE', value: (m) => s[m].rmse, fmt: fmtMW },
    { key: 'mape', title: 'MAPE', value: (m) => s[m].mape, fmt: (v) => `${v.toFixed(full ? 2 : 1)}%` },
    { key: 'bias', title: 'Bias', value: (m) => s[m].bias, fmt: fmtSigned, target: 0 },
    { key: 'cov', title: full ? 'Coverage 10–90' : 'Cov80', value: (m) => s[m].coverage80, fmt: (v) => fmtPct(v, full ? 1 : 0), target: 0.8 },
    { key: 'pin', title: 'Pinball', value: (m) => s[m].pinball, fmt: fmtMW },
    { key: 'band', title: 'Band width', value: (m) => s[m].bandWidth, fmt: fmtMW, target: NaN },
    { key: 'wins', title: full ? 'Best weeks' : 'Wins', value: (m) => s[m].wins, fmt: (v) => (full ? `${v} / ${data.meta.cutoffs}` : String(v)), target: Infinity },
    { key: 'sec', title: full ? 'CPU time' : 'Time', value: (m) => data.meta.runtimeSec[m], fmt: (v) => (v < 1 ? '<1 s' : `${Math.round(v)} s`) },
  ];
  return full ? cols : cols.filter((c) => !['rmse', 'pin', 'band'].includes(c.key));
}

function ScoreTable({ data, models, visible, onToggle, full }: Props & { full: boolean }) {
  const cols = columns(data, full);

  const bestOf = (c: Col): string | null => {
    let best: string | null = null;
    let bestScore = Infinity;
    for (const m of models) {
      const v = c.value(m);
      if (v == null) continue;
      if (c.target != null && Number.isNaN(c.target)) return null; // no "best" for this column
      const score = c.target === Infinity ? -v : c.target != null ? Math.abs(v - c.target) : v;
      if (score < bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  };
  const best = Object.fromEntries(cols.map((c) => [c.key, bestOf(c)]));

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className={`score${full ? ' full' : ''}`}>
        <thead>
          <tr>
            <th>Model</th>
            {cols.map((c) => (
              <th key={c.key}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const st = styleOf(m);
            const on = visible.includes(m);
            return (
              <tr key={m} className={on ? '' : 'hidden'} onClick={() => onToggle(m)} title={st.description}>
                <td>
                  <i className={`swatch${st.dash ? ' dashed' : ''}${on ? '' : ' off'}`} style={{ color: st.color }} />
                  {full ? st.label : st.short}
                  {full && <div className="desc">{st.description}</div>}
                </td>
                {cols.map((c) => {
                  const v = c.value(m);
                  return (
                    <td key={c.key} className={best[c.key] === m ? 'best' : ''}>
                      {v == null ? '–' : c.fmt(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Scorecard(props: Props) {
  const [open, setOpen] = useState(false);
  const { data } = props;
  return (
    <div className="panel">
      <div className="panelTitle clickable" onClick={() => setOpen(true)}>
        <span>Scorecard · all {data.meta.cutoffs} weeks</span>
        <span>
          MW · click a row to toggle
          <ExpandButton onClick={() => setOpen(true)} label="enlarge scorecard" />
        </span>
      </div>
      <ScoreTable {...props} full={false} />
      {open && (
        <Modal
          title={`Scorecard · ${data.meta.region} · ${data.meta.cutoffs} weekly cutoffs · ${data.meta.horizon} h ahead`}
          subtitle="All metrics over every cutoff, in MW unless stated. Best value per column is marked; bias closest to zero and coverage closest to 80 % count as best. Click a row to show or hide the model in the chart."
          onClose={() => setOpen(false)}
          wide
        >
          <ScoreTable {...props} full />
        </Modal>
      )}
    </div>
  );
}
