import { useEffect, useRef, useState } from 'react';
import { geocode } from '../lib/api';
import type { GeoHit } from '../types';
import { SearchGlyph } from './Icons';

interface Props {
  onPick: (hit: GeoHit) => void;
}

/** Sunken search pill with a debounced (250 ms) geocoder suggestion list; arrow keys + Enter. */
export default function Search({ onPick }: Props) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<GeoHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
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
  }, [q]);

  const pick = (h: GeoHit) => {
    onPick(h);
    setQ('');
    setHits([]);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || hits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(hits[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="search" role="combobox" aria-expanded={open && hits.length > 0} aria-haspopup="listbox" aria-owns="citylist">
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
          onFocus={() => hits.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
        />
      </div>
      {open && hits.length > 0 && (
        <ul className="suggest" id="citylist" role="listbox">
          {hits.map((h, i) => (
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
