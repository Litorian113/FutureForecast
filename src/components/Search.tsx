import { useEffect, useRef, useState } from 'react';
import { geocode } from '../lib/api';
import type { GeoHit } from '../types';
import { SearchGlyph } from './Icons';

interface Props {
  onPick: (hit: GeoHit) => void;
}

/** The seven backtest cities: shown as a quick pick when the field is focused but still empty,
 * because for these the honesty chip has measured numbers of their own. */
const QUICK: GeoHit[] = [
  { name: 'Berlin', country: 'Deutschland', admin1: 'Land Berlin', lat: 52.52437, lon: 13.41053, tz: 'Europe/Berlin' },
  { name: 'Reykjavík', country: 'Island', admin1: null, lat: 64.1355, lon: -21.8954, tz: 'Atlantic/Reykjavik' },
  { name: 'Phoenix', country: 'Vereinigte Staaten', admin1: 'Arizona', lat: 33.4484, lon: -112.074, tz: 'America/Phoenix' },
  { name: 'Singapur', country: 'Singapur', admin1: null, lat: 1.2897, lon: 103.8501, tz: 'Asia/Singapore' },
  { name: 'Kapstadt', country: 'Südafrika', admin1: 'Westkap', lat: -33.9258, lon: 18.4232, tz: 'Africa/Johannesburg' },
  { name: 'Denver', country: 'Vereinigte Staaten', admin1: 'Colorado', lat: 39.7392, lon: -104.9847, tz: 'America/Denver' },
  { name: 'Tokio', country: 'Japan', admin1: null, lat: 35.6895, lon: 139.6917, tz: 'Asia/Tokyo' },
];

/** Sunken search pill with a debounced (250 ms) geocoder list; arrow keys + Enter.
 * Empty and focused it offers the backtest cities, so a click always shows something. */
export default function Search({ onPick }: Props) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const term = q.trim();
  const list = term.length < 2 ? QUICK : hits;

  useEffect(() => {
    if (term.length < 2) {
      setHits([]);
      setActive(0);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(() => {
      geocode(term)
        .then((h) => {
          if (id !== seq.current) return;
          setHits(h);
          setActive(0);
          setOpen(true);
        })
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  const pick = (h: GeoHit) => {
    onPick(h);
    setQ('');
    setHits([]);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || list.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % list.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + list.length) % list.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(list[active]);
    }
  };

  return (
    <div className="search" role="combobox" aria-expanded={open && list.length > 0} aria-haspopup="listbox" aria-owns="citylist">
      <div className="searchPill">
        <SearchGlyph />
        <input
          ref={inputRef}
          value={q}
          placeholder="Stadt suchen …"
          aria-label="Stadt suchen"
          aria-autocomplete="list"
          aria-controls="citylist"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
        />
      </div>
      {open && list.length > 0 && (
        <ul className="suggest" id="citylist" role="listbox">
          {term.length < 2 && <li className="suggestHead">Städte mit eigenem Backtest</li>}
          {list.map((h, i) => (
            <li
              key={`${h.lat},${h.lon}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={() => pick(h)}
              onMouseEnter={() => setActive(i)}
            >
              <span>{h.name}</span>
              <span className="sub">{[h.admin1, h.country].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
