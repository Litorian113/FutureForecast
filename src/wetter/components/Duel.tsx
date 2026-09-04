import type { ExpectedError, Hindcast, Source } from '../types';

interface Props {
  err: ExpectedError | null;
  hind: Hindcast | null;
  days: number;
  onOpen: () => void;
  source: Source;
}

/** TimesFM as shown on the page is the 6-variate variant; fall back to the temperature-only one. */
export const TF_MODEL = (err: ExpectedError): string => (err.byLead.timesfm_multi ? 'timesfm_multi' : 'timesfm');

/** Ratio of the two mean absolute errors per lead day: > 1 means the weather model is that much
 * more accurate, < 1 means TimesFM is. Null where one of the two was not measured. */
export function ratios(err: ExpectedError, days: number): (number | null)[] {
  const tf = err.byLead[TF_MODEL(err)];
  const nwp = err.byLead.nwp;
  if (!tf || !nwp) return Array(days).fill(null);
  return Array.from({ length: days }, (_, i) => {
    const a = tf[i];
    const b = nwp[i];
    return a == null || b == null || b === 0 ? null : a / b;
  });
}

const MAX = 3; // a factor of 3 fills the track completely

/** "Who wins?" - the measured duel between TimesFM and the weather model, per lead day.
 * A marker left of the centre means TimesFM is ahead, right means the weather model is. */
export default function Duel({ err, hind, days, onOpen }: Props) {
  if (!err || !err.byLead.nwp) {
    return (
      <section className="raised duel" aria-label="Model comparison">
        <span className="label">TimesFM vs. weather model</span>
        <p className="duelNote">
          No backtest for this place yet. Run <code>weather/backtest.py</code>.
        </p>
        <LastRuns hind={hind} days={days} />
      </section>
    );
  }
  const tfKey = TF_MODEL(err);
  const tf = err.byLead[tfKey];
  const nwp = err.byLead.nwp;
  const measured = !!tf;
  const rs = ratios(err, days);
  const known = rs.filter((r): r is number => r != null);
  const mean = known.length ? known.reduce((a, b) => a * b, 1) ** (1 / known.length) : null; // geometric mean
  const nwpWins = mean != null && mean > 1;

  return (
    <section className="raised duel" aria-label="Model comparison">
      <div className="duelHead">
        <span className="label">TimesFM vs. weather model</span>
        <span className="duelSub">
          Backtest {err.city} {err.year} · {err.cutoffs} cutoffs
        </span>
      </div>

      {measured && mean != null ? (
        <>
          <div className="verdict">
            <span className="who" style={{ color: nwpWins ? 'var(--c-nwp)' : 'var(--c-timesfm)' }}>
              {nwpWins ? 'Weather model' : 'TimesFM'}
            </span>
            <span className="factor num">{(nwpWins ? mean : 1 / mean).toFixed(1)}× more accurate</span>
            <span className="over">averaged over {days} days</span>
          </div>

          <ul className="duelRows">
            {rs.map((r, i) => {
              const t = r == null ? 0 : Math.max(-1, Math.min(1, Math.log(r) / Math.log(MAX)));
              const win = r != null && r > 1;
              return (
                <li key={i}>
                  <span className="d">Day {i + 1}</span>
                  <span className="track" aria-hidden="true">
                    <i className="mid" />
                    <i
                      className="bar"
                      style={{
                        left: t >= 0 ? '50%' : `${50 + t * 50}%`,
                        width: `${Math.abs(t) * 50}%`,
                        background: win ? 'var(--c-nwp)' : 'var(--c-timesfm)',
                      }}
                    />
                  </span>
                  <span className="f num" style={{ color: win ? 'var(--c-nwp)' : 'var(--c-timesfm)' }}>
                    {r == null ? '–' : `${(win ? r : 1 / r).toFixed(1)}×`}
                  </span>
                </li>
              );
            })}
          </ul>

          <LastRuns hind={hind} days={days} />
          <div className="duelFoot">
            <span className="dfHead">Backtest mean day 1 → day {days}</span>
            <span>
              <i className="swatch" style={{ color: 'var(--c-timesfm)' }} /> TimesFM {tf![0]?.toFixed(1)} →{' '}
              {tf![days - 1]?.toFixed(1)} °C
            </span>
            <span>
              <i className="swatch" style={{ color: 'var(--c-nwp)' }} /> Model {nwp[0]?.toFixed(1)} →{' '}
              {nwp[days - 1]?.toFixed(1)} °C
            </span>
          </div>
          <button className="duelMore" onClick={onOpen}>
            Show all models
          </button>
        </>
      ) : (
        <>
          <p className="duelNote">
            TimesFM has not been backtested for {err.city} yet. The weather model scores{' '}
            <b className="num">{nwp[0]?.toFixed(1)} °C</b> at day 1 and{' '}
            <b className="num">{nwp[days - 1]?.toFixed(1)} °C</b> at day {days} there. Measured right here, however:
          </p>
          <LastRuns hind={hind} days={days} />
          <button className="duelMore" onClick={onOpen}>
            Show all models
          </button>
        </>
      )}
    </section>
  );
}

/** The live evidence for this very location: what the past runs actually achieved. Unlike the
 * backtest above it exists for every place, because the page recomputes it on the fly. */
function LastRuns({ hind, days }: { hind: Hindcast | null; days: number }) {
  if (!hind || (hind.mae.timesfm == null && hind.mae.nwp == null)) return null;
  const better =
    hind.mae.timesfm != null && hind.mae.nwp != null ? (hind.mae.nwp < hind.mae.timesfm ? 'nwp' : 'timesfm') : null;
  return (
    <div className="lastRun">
      <span className="lrHead">
        Measured here · {hind.runs} runs of {days} days
      </span>
      <span className={`lrRow${better === 'timesfm' ? ' win' : ''}`}>
        <i className="swatch dashed" style={{ color: 'var(--c-timesfm)' }} /> TimesFM
        <b className="num">{hind.mae.timesfm == null ? '–' : `${hind.mae.timesfm.toFixed(2)} °C`}</b>
      </span>
      <span className={`lrRow${better === 'nwp' ? ' win' : ''}`}>
        <i className="swatch dashed" style={{ color: 'var(--c-nwp)' }} /> Weather model
        <b className="num">{hind.mae.nwp == null ? '–' : `${hind.mae.nwp.toFixed(2)} °C`}</b>
      </span>
    </div>
  );
}
