import { Star } from 'lucide-react';

export default function StarRating({ value = 0, showValue = true, size = 16 }) {
  const rounded = Math.round(value * 2) / 2; // nearest half-star for visual purposes
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={size}
            className={i <= rounded ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'}
          />
        ))}
      </span>
      {showValue && <span className="text-sm font-medium text-slate-600">{value ? value.toFixed(1) : 'New'}</span>}
    </span>
  );
}
