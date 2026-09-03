import { Suspense, lazy } from 'react';
import { Loader } from './components/Loader';

// Inside the Future Lab hub only the globe is shown; the other pages of the original project
// (Overview, Time Beam, Comparison, Depth) stay in src/erdbeben/pages but are not routed.
// three.js is only needed here, so the globe is split into its own chunk.
const Globe = lazy(() => import('./pages/Globe'));

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <a href="./" className="back">
          ← Scenarios
        </a>
        <span className="title">Earthquakes &amp; Tsunamis · 3D model · TimesFM 3.0 forecast 2017–2026</span>
      </header>
      <Suspense fallback={<Loader />}>
        <Globe />
      </Suspense>
    </div>
  );
}
