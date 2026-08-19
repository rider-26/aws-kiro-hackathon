import { useEffect, useState } from 'react';
import { Star, Lock } from 'lucide-react';
import { getOwnReviews, RATING_DIMENSIONS } from '../../api/reviews';
import ReviewsList from '../../components/ReviewsList';
import StarRating from '../../components/StarRating';
import ErrorState from '../../components/ErrorState';

export default function TutorReviews() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      setData(await getOwnReviews());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <p className="text-sm text-slate-400">Loading reviews…</p>;
  if (error || !data) return <ErrorState onRetry={load} />;

  const { reviews, averages, count } = data;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Reviews</h1>
        <p className="text-sm text-slate-500">
          Feedback from students who completed a verified session with you.
        </p>
      </div>

      {count === 0 ? (
        <ReviewsList reviews={[]} />
      ) : (
        <>
          {/* Overall + per-dimension averages */}
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400">Overall rating</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-3xl font-bold text-slate-800 leading-none">
                    {averages.overall_rating.toFixed(1)}
                  </span>
                  <StarRating value={averages.overall_rating} showValue={false} size={18} />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  From {count} review{count === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2 pt-4 border-t border-slate-100">
              {RATING_DIMENSIONS.filter((d) => d.key !== 'overall_rating').map((d) => (
                <div key={d.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-600">{d.label}</span>
                    <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
                      {averages[d.key].toFixed(1)}
                      <Star size={12} className="text-amber-400 fill-amber-400" />
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-amber-400"
                      style={{ width: `${(averages[d.key] / 5) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 flex gap-2">
            <Lock size={14} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-500">
              Reviews are written by students and cannot be edited or removed by tutors.
              If a review breaches the code of conduct, report it and an admin will review it.
            </p>
          </div>

          <div className="card">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">All reviews</h2>
            <ReviewsList reviews={reviews} showBreakdown />
          </div>
        </>
      )}
    </div>
  );
}
