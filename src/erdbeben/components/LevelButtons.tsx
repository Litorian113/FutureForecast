import type { Level, LevelFlags } from '../types';

interface Props {
  flags: LevelFlags;
  onChange: (flags: LevelFlags) => void;
  colors: Record<Level, string>;
  labels: Record<Level, string>;
}

const order: Level[] = ['low', 'medium', 'high'];

export function LevelButtons({ flags, onChange, colors, labels }: Props) {
  return (
    <div className="levelButtons">
      {order.map((lvl) => (
        <button
          key={lvl}
          type="button"
          className={`levelBtn${flags[lvl] ? '' : ' off'}`}
          aria-pressed={flags[lvl]}
          onClick={() => onChange({ ...flags, [lvl]: !flags[lvl] })}
        >
          <span className="swatch" style={{ background: colors[lvl] }} />
          {labels[lvl]}
        </button>
      ))}
    </div>
  );
}
