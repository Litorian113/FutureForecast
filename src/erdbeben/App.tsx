import { Suspense, lazy } from 'react';
import { Loader } from './components/Loader';

// Inside the FutureForecast hub only the globe is shown; the other pages of the original project
// (Overview, Time Beam, Comparison, Depth) stay in src/erdbeben/pages but are not routed.
// three.js is only needed here, so the globe is split into its own chunk.
const Globe = lazy(() => import('./pages/Globe'));

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <a href="./" className="back">
            ← Scenarios
          </a>
          <span className="name">FutureQuake</span>
        </div>
      </header>
      <Suspense fallback={<Loader />}>
        <Globe />
      </Suspense>
    </div>
  );
}
