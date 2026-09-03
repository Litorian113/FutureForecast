/** Start page: one tile per scenario, each drawn in the design language of the page it opens.
 * The three scenarios ask the same question of the same model - TimesFM 3.0, zero-shot, from the
 * history alone - and get three different answers. */
export default function Hub() {
  return (
    <main className="hub">
      <header className="hubHead">
        <h1>Can a foundation model forecast from the history alone?</h1>
        <p>
          Google <b>TimesFM 3.0</b>, zero-shot, no training — applied to three subjects and measured against the methods
          that are standard there. The answers differ. Pick a scenario:
        </p>
      </header>

      <nav className="tiles" aria-label="Scenarios">
        <a className="tile quake" href="./erdbeben.html">
          <span className="no">01 · Earthquakes</span>
          <h2>Where does it shake next?</h2>
          <p className="q">23,000 quakes of M 5.5+ since 1965 and the tsunamis they triggered. TimesFM forecasts the rate per 5° cell ten years ahead.</p>
          <QuakeArt />
          <p className="verdict">
            <b>A draw.</b> 49 of 50 real quakes fell into a forecast cell — but the cell's own climatology hits just as well. The model adds level and trend, not new places.
          </p>
          <span className="open">Open the 3D globe <i>→</i><small>USGS · NOAA · 1965–2016 · forecast 2017–2026</small></span>
        </a>

        <a className="tile grid" href="./strom.html">
          <span className="no">02 · Electricity</span>
          <h2>How much load tomorrow at 6 pm?</h2>
          <p className="q">Hourly grid load of the PJM region, a 104-week backtest, one week ahead, against seasonal naive, Holt-Winters and STL + ETS.</p>
          <GridArt />
          <p className="verdict">
            <b>TimesFM wins.</b> 54 % lower error than the best classical model, ahead of the seasonal naive in 100 of 104 weeks. A year of context has seen last summer's heat wave.
          </p>
          <span className="open">Open the benchmark <i>→</i><small>PJM Interconnection · Kaggle · 2016–2018</small></span>
        </a>

        <a className="tile weather" href="./wetter.html">
          <span className="no">03 · Weather</span>
          <h2>How warm in five days?</h2>
          <p className="q">Hourly temperature for any city in the world, computed live, against persistence, climatology and a real weather model.</p>
          <WeatherArt />
          <p className="verdict">
            <b>The weather model wins.</b> On day 1 TimesFM beats every trivial method; from day 3 it is down at climatology. The weather model is 2–3× more accurate — it sees the front, the time series does not.
          </p>
          <span className="open">Open the forecast <i>→</i><small>Open-Meteo · ERA5 · 7 cities · 1,281 cutoffs</small></span>
        </a>
      </nav>

      <footer className="hubFoot">
        <span>Rolling-origin backtests · every model sees only data before the cutoff · TimesFM 3.0 weights are non-commercial</span>
        <span>Franz Anhäupl · HfG Schwäbisch Gmünd</span>
      </footer>
    </main>
  );
}

/* ---- tile artwork: cheap deterministic SVGs, no data loading on the start page ---- */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Seismic belts of the Pacific as lat/lon waypoints (Japan–Kamchatka, Aleutians–Americas, Andes,
 * Tonga–Kermadec, Sunda arc, Alpide belt). Epicentres are scattered along them. */
const BELTS: [number, number][][] = [
  [[60, 160], [52, 158], [44, 146], [36, 141], [28, 130], [22, 121], [12, 124], [2, 126]],
  [[52, 178], [54, -165], [58, -152], [55, -135], [48, -126], [38, -122], [30, -115], [19, -104]],
  [[16, -98], [10, -86], [2, -80], [-8, -77], [-18, -71], [-28, -71], [-38, -73], [-46, -75]],
  [[-12, -173], [-20, -175], [-30, -178], [-38, 178], [-44, 170]],
  [[-8, 106], [-9, 116], [-8, 124], [-4, 130], [-6, 146], [-10, 160], [-16, 168]],
  [[38, 22], [37, 36], [34, 48], [30, 58], [36, 70], [30, 84], [26, 96]],
];

/** The point-cloud globe of the earthquake page, cropped and zoomed: a dotted sphere with the
 * quakes along the belts, a few green forecast dots, Pacific facing the viewer. */
function QuakeArt() {
  const R = 230;
  const CX = 175;
  const CY = 235;
  const LON0 = -165; // longitude in the centre of view
  const TILT = 18; // degrees of northward tilt
  const rad = Math.PI / 180;
  const project = (lat: number, lon: number) => {
    const la = lat * rad;
    const lo = (lon - LON0) * rad;
    let x = Math.cos(la) * Math.sin(lo);
    let y = Math.sin(la);
    let z = Math.cos(la) * Math.cos(lo);
    const t = TILT * rad; // tilt about the x axis
    const y2 = y * Math.cos(t) - z * Math.sin(t);
    const z2 = y * Math.sin(t) + z * Math.cos(t);
    y = y2;
    z = z2;
    return { x: CX + R * x, y: CY - R * y, z };
  };
  const r = rng(11);
  const dots: { x: number; y: number; z: number }[] = [];
  for (let lat = -85; lat <= 85; lat += 5) {
    const step = 5 / Math.max(0.25, Math.cos(lat * rad));
    for (let lon = -180; lon < 180; lon += step) {
      const p = project(lat, lon);
      if (p.z > 0.05) dots.push(p);
    }
  }
  const quakes: { x: number; y: number; z: number; m: number; fc: boolean }[] = [];
  for (const belt of BELTS) {
    for (let i = 0; i < belt.length - 1; i++) {
      const [a, b] = [belt[i], belt[i + 1]];
      for (let k = 0; k < 26; k++) {
        const t = r();
        const lat = a[0] + (b[0] - a[0]) * t + (r() - 0.5) * 4;
        const lon = a[1] + (b[1] - a[1]) * t + (r() - 0.5) * 4;
        const p = project(lat, lon);
        if (p.z > 0.05) quakes.push({ ...p, m: r(), fc: r() < 0.08 });
      }
    }
  }
  return (
    <svg className="art globe" viewBox="0 0 360 190" aria-hidden="true">
      <defs>
        <clipPath id="globeClip">
          <rect x="0" y="0" width="360" height="190" />
        </clipPath>
      </defs>
      <g clipPath="url(#globeClip)">
        <circle cx={CX} cy={CY} r={R} fill="rgb(24, 24, 36)" />
        {dots.map((p, i) => (
          <circle key={`d${i}`} cx={p.x} cy={p.y} r={1} fill="#6e6d95" opacity={0.35 + p.z * 0.55} />
        ))}
        {quakes.map((p, i) =>
          p.fc ? (
            <rect key={`q${i}`} x={p.x - 1.4} y={p.y - 1.4} width={2.8} height={2.8} fill="#3ddc84" opacity={0.5 + p.z * 0.5} />
          ) : (
            <circle
              key={`q${i}`}
              cx={p.x}
              cy={p.y}
              r={0.7 + p.m * p.m * 2.2}
              fill={p.m > 0.9 ? '#ff0000' : p.m > 0.68 ? '#ff7400' : '#ffc100'}
              opacity={(0.45 + p.m * 0.5) * (0.5 + p.z * 0.5)}
            />
          ),
        )}
      </g>
    </svg>
  );
}

/** A week of load: truth in white, the model's band in blue. */
function GridArt() {
  const load = (h: number) => 60 + 22 * Math.sin(((h % 24) - 8) / 24 * Math.PI * 2) * (h % 168 > 120 ? 0.7 : 1) + 6 * Math.sin(h / 40);
  const pts = Array.from({ length: 168 }, (_, h) => [h * (360 / 167), 170 - load(h) * 1.5] as const);
  const cut = 96;
  const band = [
    ...pts.slice(cut).map(([x, y], i) => `${x.toFixed(1)},${(y - 4 - i * 0.25).toFixed(1)}`),
    ...pts.slice(cut).reverse().map(([x, y], i) => `${x.toFixed(1)},${(y + 4 + (72 - i) * 0.25).toFixed(1)}`),
  ].join(' ');
  const d = (arr: readonly (readonly [number, number])[]) => arr.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  return (
    <svg className="art" viewBox="0 0 360 190" aria-hidden="true">
      <polygon points={band} fill="#b9cfe0" opacity={0.18} />
      <path d={d(pts.slice(0, cut + 1))} fill="none" stroke="#ffffff" strokeWidth={1.6} />
      <path d={d(pts.slice(cut))} fill="none" stroke="#b9cfe0" strokeWidth={1.8} />
      <line x1={pts[cut][0]} x2={pts[cut][0]} y1={20} y2={175} stroke="#4a4a48" strokeDasharray="3 4" />
    </svg>
  );
}

/** A raised neumorphic card with the thin big number of the weather page. */
function WeatherArt() {
  return (
    <div className="art wcard" aria-hidden="true">
      <span className="wtemp">23°</span>
      <svg viewBox="0 0 64 64" className="wsun">
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="32" cy="32" r="11" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line
              key={a}
              x1={32 + 17 * Math.cos((a * Math.PI) / 180)}
              y1={32 + 17 * Math.sin((a * Math.PI) / 180)}
              x2={32 + 23 * Math.cos((a * Math.PI) / 180)}
              y2={32 + 23 * Math.sin((a * Math.PI) / 180)}
            />
          ))}
        </g>
      </svg>
      <span className="wband" />
    </div>
  );
}
