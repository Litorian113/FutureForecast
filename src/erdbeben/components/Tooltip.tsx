import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  x: number;
  y: number;
  children: ReactNode;
  variant?: 'default' | 'forecast';
}

/** Fixed-position tooltip that stays inside the viewport. */
export function Tooltip({ x, y, children, variant = 'default' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x + 16, top: y + 16 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    let left = x + 16;
    let top = y + 16;
    if (left + w > window.innerWidth - 8) left = Math.max(8, x - w - 12);
    if (top + h > window.innerHeight - 8) top = Math.max(8, y - h - 12);
    setPos({ left, top });
  }, [x, y, children]);
  return (
    <div ref={ref} className={`tooltip${variant === 'forecast' ? ' forecast' : ''}`} style={pos}>
      {children}
    </div>
  );
}
