import type { Backtest, CutoffRecord } from '../types';
import { styleOf } from '../lib/models';
import { addHours, fmtDate, fmtMW, parseLocal } from '../lib/format';
import { holidaysInWindow } from '../lib/calendar';

interface Props {
  data: Backtest;
  record: CutoffRecord;
  models: string[];
  visible: string[];
  onToggle: (m: string) => void;
  /** the verdict sentence of the headline, shown at the top of the column */
  intro?: React.ReactNode;
}

/** Right column: verdict, the week's context flags, and the legend with per-week MAE (click to toggle). */
export default function WeekPanel({ data, record, models, visible, onToggle, intro }: Props) {
  const cutoff = parseLocal(record.cutoff);
  const end = addHours(cutoff, data.meta.horizon - 1);
  const holidays = holidaysInWindow(cutoff, data.meta.horizon);
  const peak = Math.max(...record.actual);
  const heat = peak > data.meta.truthP95;
  const ranked = [...models].sort((a, b) => record.mae[a] - record.mae[b]);
  const winner = ranked[0];
  const runnerUp = ranked[1];

  return (
    <div className="stack sideCol">
      {intro && <p className="verdict">{intro}</p>}
      <div className="week">
        <div className="panelTitle" style={{ marginBottom: 8 }}>
          <span>This week</span>
        </div>
        <div className="big">
          {fmtDate(cutoff)} – {fmtDate(end)}
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="row">
            <span>Best model</span>
            <span style={{ color: styleOf(winner).color }}>{styleOf(winner).short}</span>
          </div>
          <div className="row">
            <span>Margin to 2nd</span>
            <span>{runnerUp ? `${fmtMW(record.mae[runnerUp] - record.mae[winner])} MW` : '–'}</span>
          </div>
          <div className="row">
            <span>Peak load</span>
            <span>{fmtMW(peak)} MW</span>
          </div>
          <div className="row">
            <span>Mean load</span>
            <span>{fmtMW(record.actual.reduce((a, b) => a + b, 0) / record.actual.length)} MW</span>
          </div>
        </div>
        <div className="tags">
          {heat && <span className="tag warm">Heat week · &gt; p95</span>}
          {holidays.map((h) => (
            <span className="tag holiday" key={h}>
              {h}
            </span>
          ))}
          {!heat && holidays.length === 0 && <span className="tag">Ordinary week</span>}
        </div>
      </div>

      <div>
        <div className="panelTitle" style={{ marginBottom: 2 }}>
          <span>Models · MAE this week</span>
        </div>
        <div className="legendHint">Click a model to show or hide it in the chart and the scorecard.</div>
        <div className="legend">
          {models.map((m) => {
            const st = styleOf(m);
            const on = visible.includes(m);
            return (
              <button key={m} className={`legendItem${on ? '' : ' off'}`} onClick={() => onToggle(m)} title={st.description}>
                <i className="dot" style={{ background: st.color, borderColor: st.color, borderStyle: st.dash ? 'dashed' : 'solid' }} />
                <span>
                  <div className="name">{st.label}</div>
                </span>
                <span className="mae">{fmtMW(record.mae[m])}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
