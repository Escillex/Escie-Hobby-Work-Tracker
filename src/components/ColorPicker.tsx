import type { RosePineColor } from "../lib/types";
import { ROSE_PINE_COLORS } from "../lib/types";
import "./shared.css";

interface Props {
  value: RosePineColor;
  onChange: (c: RosePineColor) => void;
}

export function ColorPicker({ value, onChange }: Props) {
  return (
    <div className="color-picker" role="radiogroup" aria-label="Accent color">
      {ROSE_PINE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          title={c}
          className={`color-swatch ${c === value ? "selected" : ""}`}
          style={{ background: `var(--rp-${c})` }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}
