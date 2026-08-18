import { ShieldCheck, Star, MessageSquareQuote } from 'lucide-react';
import StarRating from './StarRating';
import EmptyState from './EmptyState';
import { RATING_DIMENSIONS } from '../api/reviews';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Public review list. Every review shown here was created through the gated
 * review path, so each carries the "Verified Session" label (spec section 23).
 */
export default function ReviewsList({ reviews, showBreakdown = false }) {
  if (!reviews || reviews.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareQuote}
        title="No reviews yet"
        description="Reviews appear here once students complete a verified session."
      />
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <div key={r.id} className="rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  {r.student?.full_name || 'Student'}
                </p>
                {r.verified_session && (
                  <span className="chip bg-emerald-100 text-emerald-800 text-[10px]">
                    <ShieldCheck size={11} /> Verified Session
                  </span>
                )}
                {r.module && (
                  <span className="chip bg-slate-100 text-slate-500 text-[10px]">{r.module.module_code}</span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-slate-400">{formatDate(r.created_date)}</p>
            </div>
            <StarRating value={r.overall_rating} size={14} />
          </div>

          {r.comment && (
            <p className="mt-2 text-sm text-slate-600">{r.comment}</p>
          )}

          {showBreakdown && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 pt-3 border-t border-slate-100">
              {RATING_DIMENSIONS.filter((d) => d.key !== 'overall_rating').map((d) => (
                <div key={d.key} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 truncate">{d.label}</span>
                  <span className="flex items-center gap-0.5 text-[11px] font-medium text-slate-600 shrink-0">
                    {r[d.key]} <Star size={10} className="text-amber-400 fill-amber-400" />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
