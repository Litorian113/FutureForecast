interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

export function ToggleSwitch({ checked, onChange, label }: Props) {
  return (
    <div className="row">
      <span>{label}</span>
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
        <span className="knob" />
      </label>
    </div>
  );
}
