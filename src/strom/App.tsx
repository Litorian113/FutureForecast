import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Backtest } from './types';
import { loadBacktest } from './data/loadData';
import { orderModels, styleOf } from './lib/models';
import { fmtGW, parseLocal, weekdayName } from './lib/format';
import Chart from './components/Chart';
import Scorecard from './components/Scorecard';
import MiniBars from './components/MiniBars';
import BacktestSlider from './components/BacktestSlider';
import WeekPanel from './components/WeekPanel';

export default function App() {
  const [data, setData] = useState<Backtest | null | undefined>(undefined);
  useEffect(() => {
    loadBacktest().then(setData);
  }, []);

  if (data === undefined) return <Frame region="…" range="…"><div className="center">Loading backtest…</div></Frame>;
  if (data === null) return <Frame region="–" range="–"><Missing /></Frame>;
  return <Benchmark data={data} />;
}

function Frame({ region, range, children }: { region: string; range: string; children: React.ReactNode }) {
  return (
    <div className="frame">
      <div className="corner">
        <div className="brand">
          <a className="back" href="./">← Scenarios</a>
          <div className="name">FutureGrid</div>
        </div>
        <div className="right">
          <div className="l1">
            <span className="arrow">→</span>
            {region}
          </div>
          <div className="l2">{range}</div>
        </div>
      </div>
      {children}
      <div className="footer">
        <span>PJM Interconnection hourly load (Kaggle · robikscube) · TimesFM 3.0 weights are non-commercial</span>
        <span>rolling-origin backtest · every model sees only data before the cutoff</span>
      </div>
    </div>
  );
}

function Missing() {
  return (
    <div className="center">
      <div>
        <div style={{ fontSize: 20, fontWeight: 300 }}>No backtest data yet.</div>
        <pre>{`cd forecast
uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python prepare_energy.py
.venv/bin/python backtest.py --models naive_week naive_week_avg4 holt_winters stl_ets timesfm`}</pre>
      </div>
    </div>
  );
}

function Benchmark({ data }: { data: Backtest }) {
  const models = useMemo(() => orderModels(data.meta.models), [data]);
  const [visible, setVisible] = useState<string[]>(() => models.filter((m) => styleOf(m).defaultVisible));
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const toggle = useCallback((m: string) => {
    setVisible((v) => (v.includes(m) ? v.filter((x) => x !== m) : [...v, m]));
  }, []);
  const onChange = useCallback((i: number) => setIndex(i), []);
  const onPlay = useCallback((p: boolean) => setPlaying(p), []);

  const record = data.cutoffs[index];
  const winner = models.reduce((best, m) => (record.mae[m] < record.mae[best] ? m : best), models[0]);

  // headline: best TimesFM variant vs the best classical model over all weeks (by MAE), and vs the seasonal naive
  const head = useMemo(() => headline(data, models), [data, models]);
  const years = `${data.cutoffs[0].cutoff.slice(0, 4)} – ${data.cutoffs[data.cutoffs.length - 1].cutoff.slice(0, 4)}`;

  return (
    <Frame region={`${data.meta.region} · hourly load`} range={years}>
      <div className="main">
        <div className="stack">
          <p className="lead">{head.lead}</p>
          <Scorecard data={data} models={models} visible={visible} onToggle={toggle} />
          <div className="panel">
            <MiniBars data={data} visible={visible} />
          </div>
        </div>
        <div className="centerCol">
          <Chart record={record} visible={visible} />
          <BacktestSlider cutoffs={data.cutoffs} index={index} playing={playing} winner={winner} onChange={onChange} onPlay={onPlay} />
        </div>
        <WeekPanel data={data} record={record} models={models} visible={visible} onToggle={toggle} intro={head.verdict} />
      </div>
    </Frame>
  );
}

function headline(
  data: Backtest,
  models: string[],
): { title: string; lead: React.ReactNode; verdict: React.ReactNode } {
  const meta = data.meta;
  const n = data.cutoffs.length;
  const first = parseLocal(data.cutoffs[0].cutoff);
  const last = parseLocal(data.cutoffs[n - 1].cutoff);
  const tfms = models.filter((m) => styleOf(m).family === 'timesfm');
  const classics = models.filter((m) => styleOf(m).family !== 'timesfm');
  // real span: first cutoff to the end of the last forecast window, not the difference of the year numbers
  const spanDays = (last.getTime() + meta.horizon * 3600_000 - first.getTime()) / 86_400_000;
  const years = Math.max(1, Math.round(spanDays / 365.25));

  const lead = (
    <>
      <span className="leadKicker">The setup</span>
      <span className="leadFirst">
        <b>{meta.region}</b> is a zone of the PJM grid in the eastern United States: <b>{fmtGW(meta.truthMean)}</b> of
        average demand, metered every hour.
      </span>
      <span className="leadRest">
        Every {weekdayName(first)} of a {years}-year test period the history is cut and <b>{models.length} forecasters</b>{' '}
        predict the next <b>{meta.horizon} hours</b>: {classics.length} classical methods and {tfms.length} variants of
        TimesFM 3.0, a time-series foundation model that has never seen this grid. Each one sees only what happened
        before the cut.
      </span>
    </>
  );

  if (tfms.length === 0 || classics.length === 0) {
    return {
      title: 'What will the grid draw next week?',
      lead,
      verdict: <>Classical baselines only. Run the TimesFM models to get the comparison.</>,
    };
  }

  const byMae = (b: string, m: string) => (data.summary[m].mae < data.summary[b].mae ? m : b);
  const tfm = tfms.reduce(byMae, tfms[0]);
  const bestClassic = classics.reduce(byMae, classics[0]);
  const winsVsBest = data.cutoffs.filter((c) => c.mae[tfm] < c.mae[bestClassic]).length;
  const naive = models.includes('naive_week') ? 'naive_week' : null;
  const winsVsNaive = naive ? data.cutoffs.filter((c) => c.mae[tfm] < c.mae[naive]).length : null;
  const maeGain = 1 - data.summary[tfm].mae / data.summary[bestClassic].mae;
  const pct = `${Math.abs(maeGain * 100).toFixed(0)}\u00A0%`;

  return {
    title: 'What will the grid draw next week?',
    lead,
    verdict: (
      <>
        TimesFM had the lower error in{' '}
        <b>
          {winsVsBest} of {n} weeks
        </b>{' '}
        compared with the best classical method, <b>{pct}</b> {maeGain > 0 ? 'lower' : 'higher'} over the whole period.
        {winsVsNaive != null && (
          <>
            {' '}
            Against “same hour last week” it was ahead in {winsVsNaive} of {n}. No training, no tuning, no weather
            data, only the load history.
          </>
        )}
      </>
    ),
  };
}
