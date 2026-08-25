import React, { useMemo } from 'react';

interface RatingButtonsProps {
  value?: number | null;
  onChange: (n: number) => void;
  label?: string;
  min?: number;
  max?: number;
}

export default function RatingButtons({
  value,
  onChange,
  label,
  min = 1,
  max = 10,
}: RatingButtonsProps) {
  const minVal = Number.isFinite(min) ? min : 1;
  const maxVal = Number.isFinite(max) ? max : 10;
  const numbers = useMemo(() => {
    const arr: number[] = [];
    for (let i = minVal; i <= maxVal; i++) arr.push(i);
    return arr;
  }, [minVal, maxVal]);

  const span = Math.max(1, maxVal - minVal);
  function tierOf(n: number): 'low' | 'mid' | 'high' {
    const pct = (n - minVal) / span;
    if (pct < 0.333) return 'low';
    if (pct < 0.666) return 'mid';
    return 'high';
  }
  function tierLabel(n: number): string {
    const t = tierOf(n);
    return t === 'low' ? '⬤ Niedrig' : t === 'mid' ? '⬤ Mittel' : '⬤ Hoch';
  }

  return (
    <div>
      {label && <div className="label">{label}</div>}
      <div className="rating-group flex flex-wrap gap-2">
        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`rating-btn ${value === n ? 'selected' : ''} ${tierOf(n)}`}
          >
            {n}
          </button>
        ))}
      </div>
      {value != null && (
        <div className="mt-2 text-sm text-gray-600">
          {tierLabel(value)} <span className="text-gray-400 ml-2">(Skala {minVal} – {maxVal})</span>
        </div>
      )}
    </div>
  );
}
