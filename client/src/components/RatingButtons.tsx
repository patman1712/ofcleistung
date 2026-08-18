import React from 'react';

interface RatingButtonsProps {
  value?: number | null;
  onChange: (n: number) => void;
  label?: string;
}

export default function RatingButtons({ value, onChange, label }: RatingButtonsProps) {
  return (
    <div>
      {label && <div className="label">{label}</div>}
      <div className="rating-group">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`rating-btn ${value === n ? 'selected' : ''} ${n <= 3 ? 'low' : n >= 8 ? 'high' : ''}`}
          >
            {n}
          </button>
        ))}
      </div>
      {value != null && (
        <div className="mt-2 text-sm text-gray-600">
          {value <= 3 ? '⬤ Niedrig' : value <= 6 ? '⬤ Mittel' : '⬤ Hoch'}
        </div>
      )}
    </div>
  );
}
