import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Loader } from '../components/Loader';
import { Tooltip } from '../components/Tooltip';
import { useAppData } from '../hooks/useAppData';
import { EQUIRECT_MAP_URL, loadSvgImage } from '../lib/mapImage';
import { haversineKm, nearestPlace } from '../lib/places';
import { COLORS, forecastColor, formatIsoDate, magnitudeLevel } from '../lib/scales';
import type { ActualData, Earthquake, ForecastData, ForecastEvent, Level, Tsunami } from '../types';

// Same camera, globe and dot parameters as the original planetview.html.
const RADIUS = 8;
const CAMERA_Z = 12;
const CAMERA_FOV = 75;
const GLOBE_POINT_SIZE = 0.015;
const GLOBE_COLOR = 0x6e6d95;
// Continent overlay: the equirectangular map baked into a texture on a sphere just below the
// point cloud, tinted in the globe colour, front side only.
const CONTINENT_OPACITY = 0.75;
const CONTINENT_TEXTURE_WIDTH = 2880;
/** predicted dots: size by magnitude class, colour by magnitude (dark → light green) */
const FORECAST_SIZE: Record<Level, number> = { low: 0.02, medium: 0.03, high: 0.045 };

type GlobeClass = 'yellow' | 'orange' | 'red';
const CLASS_STYLE: Record<GlobeClass, { color: string; size: number }> = {
  yellow: { color: '#ffc100', size: 0.01 },
  orange: { color: '#ff7400', size: 0.018 },
  red: { color: '#ff0000', size: 0.02 },
};

/** Original globe thresholds (the legacy code left 6.3–6.5 undefined; it falls into red here). */
function globeClass(mag: number): GlobeClass {
  if (mag < 5.7) return 'yellow';
  if (mag < 6.3) return 'orange';
  return 'red';
}

type HoverItem = { kind: 'eq'; item: Earthquake } | { kind: 'fc'; item: ForecastEvent };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m: number, y: number) => `${MONTHS[m - 1]} ${y}`;

interface GeoPoint {
  lat: number;
  lon: number;
}

interface Insight {
  key: string;
  lat: number;
  lon: number;
  /** badge text, e.g. "M7.9" or "×2.4" */
  badge: string;
  badgeColor: string;
  place: string;
  detail: string;
  when: string;
  /** rows shown when the entry is expanded */
  facts: { label: string; value: string }[];
  /** for real-vs-predicted pairs: both dots get highlighted and connected */
  pair?: PairInfo;
}

interface PairInfo {
  real: GeoPoint;
  pred: GeoPoint;
  realMag: number;
  realTime: string;
  realPlace: string;
  predMag: number;
  predMonth: number;
  predYear: number;
  km: number;
  /** real date minus middle of the predicted month, in days */
  daysApart: number;
  sameMonth: boolean;
}

interface Section {
  key: string;
  title: string;
  hint: string;
  items: Insight[];
}

function latLonToVector3(lat: number, lon: number, depth: number | null): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  // deeper quakes sink slightly below the surface
  const r = RADIUS - ((depth ?? 0) / 1000) * RADIUS * 0.2;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/** One THREE.Points per class instead of one object per earthquake (legacy: 23k draw calls). */
function makePointCloud<T>(items: T[], pos: (t: T) => THREE.Vector3, size: number, color: string | ((t: T) => string)): THREE.Points {
  const arr = new Float32Array(items.length * 3);
  const colors = typeof color === 'function' ? new Float32Array(items.length * 3) : null;
  const tmp = new THREE.Color();
  items.forEach((it, i) => {
    const v = pos(it);
    arr[i * 3] = v.x;
    arr[i * 3 + 1] = v.y;
    arr[i * 3 + 2] = v.z;
    if (colors && typeof color === 'function') {
      tmp.set(color(it));
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  if (colors) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size, sizeAttenuation: true, transparent: true, opacity: 1 });
  if (colors) mat.vertexColors = true;
  else mat.color.set(color as string);
  return new THREE.Points(geo, mat);
}

/** Renders the world map SVG (land only, transparent ocean) into a canvas texture. */
async function makeContinentTexture(): Promise<THREE.CanvasTexture> {
  const img = await loadSvgImage(EQUIRECT_MAP_URL, { fill: '#ffffff' });
  const canvas = document.createElement('canvas');
  canvas.width = CONTINENT_TEXTURE_WIDTH;
  canvas.height = CONTINENT_TEXTURE_WIDTH / 2;
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The three lists shown in the prediction panel. */
function eventInsight(e: ForecastEvent, key: string, tsunamis: Tsunami[], cells: Map<string, { hist: number }>): Insight {
  const hist = cells.get(e.cell)?.hist ?? 0;
  return {
    key,
    lat: e.lat,
    lon: e.lon,
    badge: `M${e.mag.toFixed(1)}`,
    badgeColor: forecastColor(e.mag),
    place: nearestPlace(e.lat, e.lon, tsunamis),
    detail: `${e.rate.toFixed(1)} quakes/yr here · ${Math.round(e.depth)} km deep`,
    when: monthLabel(e.month, e.year),
    facts: [
      { label: 'Sampled magnitude', value: `M ${e.mag.toFixed(1)} (drawn from this region's history)` },
      { label: 'Expected in', value: monthLabel(e.month, e.year) },
      { label: 'Depth', value: `${Math.round(e.depth)} km` },
      { label: 'Region rate (forecast)', value: `${e.rate.toFixed(2)} M5.5+ quakes / year` },
      { label: 'Region rate (1965–2016)', value: `${hist.toFixed(2)} / year` },
    ],
  };
}

function computeInsights(fc: ForecastData, tsunamis: Tsunami[], actual: ActualData | null) {
  const lastIdx = fc.meta.years.length - 1;
  const lastYear = fc.meta.years[lastIdx];
  const grid = fc.meta.gridDeg;
  const cellMap = new Map(fc.cells.map((c) => [c.id, c]));
  const strongest: Insight[] = [...fc.events]
    .sort((a, b) => b.mag - a.mag)
    .slice(0, 10)
    .map((e, i) => eventInsight(e, `s${i}`, tsunamis, cellMap));
  const cellCenter = (c: { lat0: number; lon0: number }) => ({ lat: c.lat0 - grid / 2, lon: c.lon0 + grid / 2 });
  const mostActive: Insight[] = [...fc.cells]
    .sort((a, b) => b.yearly[lastIdx] - a.yearly[lastIdx])
    .slice(0, 6)
    .map((c, i) => {
      const { lat, lon } = cellCenter(c);
      return {
        key: `a${i}`,
        lat,
        lon,
        badge: `${c.yearly[lastIdx].toFixed(0)}/yr`,
        badgeColor: '#9ad',
        place: nearestPlace(lat, lon, tsunamis),
        detail: `expected M5.5+ per year in ${lastYear} · was ${c.hist.toFixed(1)}/yr in 1965–2016`,
        when: `${lastYear}`,
        facts: [
          { label: `Expected in ${lastYear}`, value: `${c.yearly[lastIdx].toFixed(1)} M5.5+ quakes (10–90 %: ${c.q10[lastIdx].toFixed(1)} – ${c.q90[lastIdx].toFixed(1)})` },
          { label: 'Average 1965–2016', value: `${c.hist.toFixed(1)} / year` },
          { label: 'Trend over the horizon', value: fc.meta.years.map((y, k) => `${y}: ${c.yearly[k].toFixed(0)}`).join(' · ') },
          { label: 'Grid cell', value: `${grid}° × ${grid}° cell ${c.id}` },
        ],
      };
    });
  const rising: Insight[] = fc.cells
    .filter((c) => c.hist >= 1)
    .map((c) => ({ c, ratio: c.yearly[lastIdx] / c.hist }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 6)
    .map(({ c, ratio }, i) => {
      const { lat, lon } = cellCenter(c);
      return {
        key: `r${i}`,
        lat,
        lon,
        badge: `×${ratio.toFixed(1)}`,
        badgeColor: '#fc9',
        place: nearestPlace(lat, lon, tsunamis),
        detail: `${c.hist.toFixed(1)}/yr historically → ${c.yearly[lastIdx].toFixed(1)}/yr expected in ${lastYear}`,
        when: `${lastYear}`,
        facts: [
          { label: 'Average 1965–2016', value: `${c.hist.toFixed(2)} / year` },
          { label: `Expected in ${lastYear}`, value: `${c.yearly[lastIdx].toFixed(2)} / year (×${ratio.toFixed(1)})` },
          { label: 'Trend over the horizon', value: fc.meta.years.map((y, k) => `${y}: ${c.yearly[k].toFixed(0)}`).join(' · ') },
          { label: 'Grid cell', value: `${grid}° × ${grid}° cell ${c.id}` },
        ],
      };
    });
  // Sampled events still ahead of today's date within the forecast horizon.
  const today = new Date();
  let fromMonth = 1;
  if (today.getFullYear() === lastYear) fromMonth = today.getMonth() + 1;
  else if (today.getFullYear() > lastYear) fromMonth = 10; // forecast is over: show its last quarter
  const upcomingAll = fc.events.filter((e) => e.year === lastYear && e.month >= fromMonth);
  const upcoming: Insight[] = [...upcomingAll]
    .sort((a, b) => b.mag - a.mag)
    .slice(0, 10)
    .map((e, i) => eventInsight(e, `u${i}`, tsunamis, cellMap));
  const byMonth: Record<number, number> = {};
  for (const e of upcomingAll) byMonth[e.month] = (byMonth[e.month] ?? 0) + 1;

  // Real USGS events paired with their nearest predicted dot of the same year.
  const pairs: Insight[] = [];
  if (actual) {
    const preds = fc.events.filter((f) => f.year === actual.meta.year);
    const scored = actual.events.map((a) => {
      let best: ForecastEvent | null = null;
      let bestKm = Infinity;
      for (const f of preds) {
        const d = haversineKm(a.lat, a.lon, f.lat, f.lon);
        if (d < bestKm) {
          bestKm = d;
          best = f;
        }
      }
      return { a, best: best!, km: bestKm };
    });
    scored.sort((x, y) => x.km - y.km);
    scored.slice(0, 15).forEach(({ a, best, km }, i) => {
      const realDate = new Date(a.time);
      // the forecast is monthly, so compare with the middle of the predicted month
      const predMid = new Date(Date.UTC(best.year, best.month - 1, 15));
      const daysApart = Math.round((realDate.getTime() - predMid.getTime()) / 86400000);
      const sameMonth = realDate.getUTCFullYear() === best.year && realDate.getUTCMonth() + 1 === best.month;
      const dMag = a.mag - best.mag;
      pairs.push({
        key: `p${i}`,
        lat: (a.lat + best.lat) / 2,
        lon: (a.lon + best.lon) / 2,
        badge: `${Math.round(km)} km`,
        badgeColor: km <= 50 ? '#c8ffdc' : km <= 150 ? '#3ddc84' : '#0d5c33',
        place: `M${a.mag.toFixed(1)} ${a.place}`,
        detail: `↔ predicted M${best.mag.toFixed(1)} · ${monthLabel(best.month, best.year)}${sameMonth ? ' · same month' : ''}`,
        when: `${realDate.getUTCDate()} ${MONTHS[realDate.getUTCMonth()]}`,
        pair: {
          real: { lat: a.lat, lon: a.lon },
          pred: { lat: best.lat, lon: best.lon },
          realMag: a.mag,
          realTime: a.time,
          realPlace: a.place,
          predMag: best.mag,
          predMonth: best.month,
          predYear: best.year,
          km,
          daysApart,
          sameMonth,
        },
        facts: [
          { label: 'Real quake (USGS)', value: `M ${a.mag.toFixed(1)} · ${a.time.slice(0, 10)} ${a.time.slice(11, 16)} UTC · ${a.depth ?? '–'} km deep` },
          { label: 'Predicted dot', value: `M ${best.mag.toFixed(1)} · ${monthLabel(best.month, best.year)} · ${Math.round(best.depth)} km deep` },
          { label: 'Distance', value: `${km.toFixed(0)} km between the two epicentres` },
          {
            label: 'Timing',
            value: sameMonth
              ? 'same month as predicted'
              : `${Math.abs(daysApart)} days ${daysApart < 0 ? 'before' : 'after'} the middle of the predicted month (${Math.abs(Math.round(daysApart / 30))} months ${daysApart < 0 ? 'early' : 'late'})`,
          },
          { label: 'Magnitude difference', value: `${dMag >= 0 ? '+' : ''}${dMag.toFixed(1)} (real minus predicted)` },
          { label: 'Region rate', value: `${a.cellRate.toFixed(2)} / yr forecast · ${a.cellHist.toFixed(2)} / yr historically · rank ${a.cellRank ?? '–'} of ${fc.cells.length}` },
        ],
      });
    });
  }

  const sections: Section[] = [
    { key: 'pairs', title: 'Real vs. predicted', hint: actual ? `${actual.meta.count} real M5.5+ quakes ${actual.meta.from} – ${actual.meta.to}, each with its nearest predicted dot` : 'run forecast/evaluate_actual.py', items: pairs },
    { key: 'upcoming', title: `Coming up · ${MONTHS[fromMonth - 1]} – Dec ${lastYear}`, hint: `${upcomingAll.length} sampled M5.5+ events left in the horizon: ${Object.entries(byMonth).map(([m, n]) => `${n} in ${MONTHS[Number(m) - 1]}`).join(', ')}`, items: upcoming },
    { key: 'strongest', title: 'Strongest predicted quakes', hint: 'largest sampled magnitudes across 2017–2026', items: strongest },
    { key: 'active', title: `Most active regions ${lastYear}`, hint: 'highest expected number of M5.5+ quakes', items: mostActive },
    { key: 'rising', title: 'Biggest rise vs. 1965–2016', hint: 'regions where the forecast rate grew most against their history', items: rising },
  ].filter((sec) => sec.items.length > 0);
  return { sections, lastYear };
}

export default function Globe() {
  const { data, error } = useAppData();
  const mountRef = useRef<HTMLDivElement>(null);
  const forecastGroupRef = useRef<THREE.Group | null>(null);
  const histMaterialsRef = useRef<THREE.PointsMaterial[]>([]);
  const markersRef = useRef<{ real: THREE.Mesh; pred: THREE.Mesh; arc: THREE.Line } | null>(null);
  const focusTargetRef = useRef<THREE.Vector3 | null>(null);
  const [showForecast, setShowForecast] = useState(true);
  const [histOpacity, setHistOpacity] = useState(1);
  const [panelOpen, setPanelOpen] = useState(true);
  const [openSection, setOpenSection] = useState<string>('pairs');
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<{ item: HoverItem; x: number; y: number } | null>(null);
  const [callout, setCallout] = useState<PairInfo | null>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const calloutAnchorRef = useRef<THREE.Vector3 | null>(null);

  const insights = useMemo(() => (data?.forecast ? computeInsights(data.forecast, data.tsunamis, data.actual) : null), [data]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !data) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, mount.clientWidth / mount.clientHeight, 0.05, 1000);
    camera.position.z = CAMERA_Z;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(new THREE.Color(COLORS.bg));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.enableZoom = true;
    controls.minDistance = RADIUS + 0.5;
    controls.maxDistance = 40;

    const globe = new THREE.Group();
    const sphere = new THREE.Points(new THREE.SphereGeometry(RADIUS, 64, 64), new THREE.PointsMaterial({ color: GLOBE_COLOR, size: GLOBE_POINT_SIZE }));
    globe.add(sphere);

    // Continent overlay (added once the SVG has been rasterised). SphereGeometry's UVs run
    // from lon -180 at u=0 eastwards and north at v=1, matching an equirectangular image and
    // the latLonToVector3 convention above.
    let disposed = false;
    const continentMaterial = new THREE.MeshBasicMaterial({
      color: GLOBE_COLOR,
      transparent: true,
      opacity: CONTINENT_OPACITY,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const continents = new THREE.Mesh(new THREE.SphereGeometry(RADIUS - 0.02, 96, 96), continentMaterial);
    continents.renderOrder = -1;
    continents.visible = false;
    globe.add(continents);
    makeContinentTexture()
      .then((tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        continentMaterial.map = tex;
        continentMaterial.needsUpdate = true;
        continents.visible = true;
      })
      .catch((e) => console.error(e));

    const byClass: Record<GlobeClass, Earthquake[]> = { yellow: [], orange: [], red: [] };
    for (const e of data.earthquakes) byClass[globeClass(e.mag)].push(e);
    const pickable: { points: THREE.Points; items: HoverItem[] }[] = [];
    histMaterialsRef.current = [];
    (Object.keys(CLASS_STYLE) as GlobeClass[]).forEach((cls) => {
      const cloud = makePointCloud(byClass[cls], (e) => latLonToVector3(e.lat, e.lon, e.depth), CLASS_STYLE[cls].size, CLASS_STYLE[cls].color);
      (cloud.material as THREE.PointsMaterial).opacity = histOpacity;
      histMaterialsRef.current.push(cloud.material as THREE.PointsMaterial);
      globe.add(cloud);
      pickable.push({ points: cloud, items: byClass[cls].map((item) => ({ kind: 'eq', item })) });
    });

    const forecastGroup = new THREE.Group();
    if (data.forecast) {
      const byLevel: Record<Level, ForecastEvent[]> = { low: [], medium: [], high: [] };
      for (const f of data.forecast.events) byLevel[magnitudeLevel(f.mag)].push(f);
      (Object.keys(byLevel) as Level[]).forEach((lvl) => {
        const cloud = makePointCloud(byLevel[lvl], (f) => latLonToVector3(f.lat, f.lon, f.depth), FORECAST_SIZE[lvl], (f) => forecastColor(f.mag));
        forecastGroup.add(cloud);
        pickable.push({ points: cloud, items: byLevel[lvl].map((item) => ({ kind: 'fc', item })) });
      });
    }
    forecastGroup.visible = showForecast;
    forecastGroupRef.current = forecastGroup;
    globe.add(forecastGroup);

    // Ring markers for the panel selection: white = real quake / single location, green = predicted dot,
    // plus an arc connecting a matched pair.
    const makeRing = (color: string) =>
      new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 40), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }));
    const markerReal = makeRing('#ffffff');
    const markerPred = makeRing(COLORS.forecast);
    const arc = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }));
    markerReal.visible = markerPred.visible = arc.visible = false;
    markersRef.current = { real: markerReal, pred: markerPred, arc };
    globe.add(markerReal, markerPred, arc);
    scene.add(globe);

    // Hover picking via raycasting against the point clouds.
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.05 };
    const mouse = new THREE.Vector2();
    let pendingPick: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      pendingPick = { x: e.clientX, y: e.clientY };
    };
    const onLeave = () => {
      pendingPick = null;
      setHover(null);
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    const pick = () => {
      if (!pendingPick) return;
      const { x, y } = pendingPick;
      pendingPick = null;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(mouse, camera);
      let best: { dist: number; item: HoverItem } | null = null;
      for (const { points, items } of pickable) {
        if (!points.visible || !points.parent?.visible) continue;
        if ((points.material as THREE.PointsMaterial).opacity < 0.05) continue;
        for (const hit of raycaster.intersectObject(points, false)) {
          // ignore points on the far side of the globe
          if (hit.point.distanceTo(camera.position) > camera.position.length()) continue;
          if (hit.index !== undefined && (!best || hit.distance < best.dist)) best = { dist: hit.distance, item: items[hit.index] };
        }
      }
      setHover(best ? { item: best.item, x, y } : null);
    };

    // Smoothly turn the camera towards a focused location (panel clicks).
    const dir = new THREE.Vector3();
    const flyTowardsFocus = () => {
      const target = focusTargetRef.current;
      if (!target) return;
      const dist = camera.position.length();
      dir.copy(camera.position).normalize();
      if (dir.angleTo(target) < 0.004) {
        focusTargetRef.current = null;
        return;
      }
      dir.lerp(target, 0.12).normalize();
      camera.position.copy(dir.multiplyScalar(dist));
      camera.lookAt(0, 0, 0);
    };

    // Keep the pair callout pinned next to its rings; hide it on the far side of the globe.
    const projected = new THREE.Vector3();
    const placeCallout = () => {
      const el = calloutRef.current;
      const anchor = calloutAnchorRef.current;
      if (!el) return;
      if (!anchor) {
        el.style.opacity = '0';
        return;
      }
      const facing = anchor.dot(camera.position) > anchor.lengthSq() * 0.15; // roughly: on the near hemisphere
      projected.copy(anchor).project(camera);
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      const x = (projected.x + 1) / 2 * w;
      const y = (1 - projected.y) / 2 * h;
      const flip = x > w - 300;
      el.style.opacity = facing && projected.z < 1 ? '1' : '0';
      el.classList.toggle('flip', flip);
      el.style.transform = `translate(${flip ? x - 26 : x + 26}px, ${y}px) translate(${flip ? '-100%' : '0'}, -50%)`;
    };

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      flyTowardsFocus();
      controls.update();
      pick();
      placeCallout();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      continentMaterial.map?.dispose();
      continents.geometry.dispose();
      continentMaterial.dispose();
      for (const m of [markerReal, markerPred]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      arc.geometry.dispose();
      (arc.material as THREE.Material).dispose();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Points) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      histMaterialsRef.current = [];
      markersRef.current = null;
      forecastGroupRef.current = null;
    };
    // showForecast / histOpacity are applied through refs below, so they must not rebuild the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (forecastGroupRef.current) forecastGroupRef.current.visible = showForecast;
  }, [showForecast]);

  useEffect(() => {
    for (const m of histMaterialsRef.current) m.opacity = histOpacity;
  }, [histOpacity]);

  const placeRing = (ring: THREE.Mesh, p: GeoPoint) => {
    const v = latLonToVector3(p.lat, p.lon, 0);
    ring.position.copy(v.clone().multiplyScalar(1.004));
    ring.lookAt(v.clone().multiplyScalar(2));
    ring.visible = true;
  };

  const clearSelection = () => {
    setSelected(null);
    setCallout(null);
    calloutAnchorRef.current = null;
    const m = markersRef.current;
    if (m) m.real.visible = m.pred.visible = m.arc.visible = false;
  };

  const focusOn = (it: Insight) => {
    setSelected(it.key);
    focusTargetRef.current = latLonToVector3(it.lat, it.lon, 0).normalize();
    setCallout(it.pair ?? null);
    calloutAnchorRef.current = it.pair ? latLonToVector3(it.pair.real.lat, it.pair.real.lon, 0).multiplyScalar(1.01) : null;
    const m = markersRef.current;
    if (!m) return;
    if (it.pair) {
      placeRing(m.real, it.pair.real);
      placeRing(m.pred, it.pair.pred);
      // great-circle arc slightly above the surface
      const a = latLonToVector3(it.pair.real.lat, it.pair.real.lon, 0).normalize();
      const b = latLonToVector3(it.pair.pred.lat, it.pair.pred.lon, 0).normalize();
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 32; i++) {
        const t = i / 32;
        const lift = RADIUS * (1.01 + 0.02 * Math.sin(Math.PI * t));
        pts.push(a.clone().lerp(b, t).normalize().multiplyScalar(lift));
      }
      m.arc.geometry.dispose();
      m.arc.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      m.arc.visible = true;
    } else {
      placeRing(m.real, it);
      m.pred.visible = false;
      m.arc.visible = false;
    }
  };

  // Step through the open list with the arrow keys.
  const currentSection = insights?.sections.find((sec) => sec.key === openSection) ?? null;
  const step = (delta: number) => {
    if (!currentSection || currentSection.items.length === 0) return;
    const idx = currentSection.items.findIndex((it) => it.key === selected);
    const next = idx < 0 ? (delta > 0 ? 0 : currentSection.items.length - 1) : (idx + delta + currentSection.items.length) % currentSection.items.length;
    focusOn(currentSection.items[next]);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!panelOpen || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen, currentSection, selected]);

  if (error) return <div className="errorBox">{error}</div>;

  const renderSection = (sec: Section) => {
    const open = openSection === sec.key;
    const idx = sec.items.findIndex((it) => it.key === selected);
    return (
      <section key={sec.key} className={`accordion${open ? ' open' : ''}`}>
        <button type="button" className="accordionHeader" onClick={() => setOpenSection(open ? '' : sec.key)} aria-expanded={open}>
          <span className="chevron">{open ? '▾' : '▸'}</span>
          <span className="accordionTitle">{sec.title}</span>
          <span className="count">{sec.items.length}</span>
        </button>
        {open && (
          <>
            <div className="accordionHint">
              <span className="muted">{sec.hint}</span>
              <span className="stepper">
                <button type="button" className="ghostBtn" onClick={() => step(-1)} aria-label="Previous">
                  ‹
                </button>
                <span className="muted">{idx >= 0 ? `${idx + 1} / ${sec.items.length}` : `${sec.items.length}`}</span>
                <button type="button" className="ghostBtn" onClick={() => step(1)} aria-label="Next">
                  ›
                </button>
              </span>
            </div>
            <div className="list">
              {sec.items.map((it) => {
                const isSel = selected === it.key;
                return (
                  <div key={it.key} className={`entry${isSel ? ' selected' : ''}`}>
                    <button type="button" className={`item${isSel ? ' selected' : ''}`} onClick={() => (isSel ? clearSelection() : focusOn(it))}>
                      <span className="mag" style={{ background: it.badgeColor }}>
                        {it.badge}
                      </span>
                      <span className="place">
                        <span className="placeName">{it.place}</span>
                        <span className="muted">{it.detail}</span>
                      </span>
                      <span className="when">{it.when}</span>
                    </button>
                    {isSel && (
                      <dl className="facts">
                        {it.pair && (
                          <div className="pairLegend">
                            <span><span className="ring white" /> real quake</span>
                            <span><span className="ring green" /> predicted dot</span>
                          </div>
                        )}
                        {it.facts.map((f) => (
                          <div key={f.label}>
                            <dt>{f.label}</dt>
                            <dd>{f.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    );
  };

  return (
    <div className="page">
      {!data && <Loader />}
      <div ref={mountRef} className="stage" />

      {data?.forecast && insights && (panelOpen ? (
        <aside className="globePanel">
          <div className="control panelHeader">
            <span>
              <b>Predictions</b>
              <span className="muted"> · TimesFM 3.0</span>
            </span>
            <button type="button" className="ghostBtn" onClick={() => setPanelOpen(false)} aria-label="Hide panel">
              hide ›
            </button>
          </div>
          <div className="control">
            <span>Show predicted {data.forecast.meta.years[0]}–{insights.lastYear}</span>
            <label className="switch small">
              <input type="checkbox" checked={showForecast} onChange={(e) => setShowForecast(e.target.checked)} aria-label="Show predictions" />
              <span className="knob" />
            </label>
          </div>
          <label className="control">
            <span>
              Historical quakes
              <span className="muted"> · {Math.round(histOpacity * 100)}%</span>
            </span>
            <input type="range" min={0} max={100} value={Math.round(histOpacity * 100)} onChange={(e) => setHistOpacity(Number(e.target.value) / 100)} aria-label="Historical quakes opacity" />
          </label>
          <div>
            <div className="gradientBar" />
            <div className="gradientLabels">
              <span>M 5.5 predicted</span>
              <span>M 8+</span>
            </div>
          </div>
          <div className="muted">
            Green dots are sampled from the forecast rates. TimesFM predicts <i>how many</i> quakes a region gets; each dot's magnitude is drawn from that
            region's own history. "Strongest" therefore means where the biggest quakes are expected to recur, not a specific event.
          </div>
          <div className="accordions">{insights.sections.map(renderSection)}</div>
          <div className="muted">Click an entry for details and to turn the globe there · ↑ ↓ step through the open list.</div>
        </aside>
      ) : (
        <button type="button" className="globePanelToggle ghostBtn" onClick={() => setPanelOpen(true)}>
          ‹ Predictions
        </button>
      ))}

      <div ref={calloutRef} className="pairCallout" style={{ opacity: 0 }} aria-hidden={!callout}>
        {callout && (
          <>
            <div className="row real">
              <span className="ring white" />
              <b>M{callout.realMag.toFixed(1)}</b>
              <span>{callout.realTime.slice(0, 10)} · {callout.realTime.slice(11, 16)} UTC</span>
            </div>
            <div className="row pred">
              <span className="ring green" />
              <b>M{callout.predMag.toFixed(1)}</b>
              <span>predicted for {monthLabel(callout.predMonth, callout.predYear)}</span>
            </div>
            <div className="stats">
              <span>
                <b>{Math.round(callout.km)} km</b> apart
              </span>
              <span>
                <b>{callout.sameMonth ? 'same month' : `${Math.abs(callout.daysApart)} d ${callout.daysApart < 0 ? 'early' : 'late'}`}</b>
              </span>
              <span>
                <b>
                  {callout.realMag - callout.predMag >= 0 ? '+' : ''}
                  {(callout.realMag - callout.predMag).toFixed(1)}
                </b>{' '}
                mag
              </span>
            </div>
            <div className="place">{callout.realPlace}</div>
          </>
        )}
      </div>

      {hover && (
        <Tooltip x={hover.x} y={hover.y} variant={hover.item.kind === 'fc' ? 'forecast' : 'default'}>
          {hover.item.kind === 'eq' ? (
            <>
              <b>{formatIsoDate(hover.item.item.date)}</b> {hover.item.item.time}
              <br />
              M {hover.item.item.mag.toFixed(1)} · depth {hover.item.item.depth ?? '–'} km
            </>
          ) : (
            <>
              <b>Predicted · {String(hover.item.item.month).padStart(2, '0')}/{hover.item.item.year}</b>
              <br />
              M {hover.item.item.mag.toFixed(1)} · rate {hover.item.item.rate.toFixed(2)} / yr
            </>
          )}
        </Tooltip>
      )}
    </div>
  );
}
