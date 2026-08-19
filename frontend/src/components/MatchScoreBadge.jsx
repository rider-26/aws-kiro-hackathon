import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Displays the rule-based match score (spec section 10) with an expandable
 * "Why" breakdown. Deliberately labelled to avoid implying machine learning
 * — this is a transparent weighted comparison, and the reasons array is
 * generated server-side from the exact criteria that matched.
 */
export default function MatchScoreBadge({ score, reasons = [] }) {
  const [open, setOpen] = useState(false);

  const colorClass =
    score >= 80 ? 'bg-emerald-100 text-emerald-800'
    : score >= 50 ? 'bg-amber-100 text-amber-800'
    : 'bg-slate-100 text-slate-600';

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`chip ${colorClass} cursor-pointer`}
      >
        <Sparkles size={12} />
        {score}% Match
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-700 mb-1">Why this match?</p>
          {reasons.length === 0 ? (
            <p className="text-slate-400">Rule-based score with limited matching criteria supplied.</p>
          ) : (
            <ul className="space-y-1 list-disc list-inside">
              {reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
