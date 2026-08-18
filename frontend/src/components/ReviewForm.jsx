import { useEffect, useState, useCallback } from 'react';
import { Star, Send, CheckCircle2, Lock, Loader2 } from 'lucide-react';
import { getReviewEligibility, submitReview, RATING_DIMENSIONS } from '../api/reviews';

/**
 * Review submission (spec section 23).
 *
 * The form is only offered when the backend reports the student is eligible —
 * completed session, was a participant, verified attendance, and no existing
 * review. When not eligible, the backend's own reason is shown rather than a
 * generic message, so the student knows what to do next.
 */
export default function ReviewForm({ sessionId, onSubmitted }) {
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEligibility(await getReviewEligibility(sessionId));
    } catch (err) {
      setEligibility({ eligible: false, reason: err.response?.data?.message || 'Reviews are not available for this session.' });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const allRated = RATING_DIMENSIONS.every((d) => ratings[d.key] >= 1);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!allRated) {
      setError('Please rate every category.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitReview(sessionId, { ...ratings, comment });
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit your review.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <p className="text-sm text-slate-400 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Checking review eligibility…
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card border-emerald-200 bg-emerald-50/40">
        <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 size={16} /> Thanks for your review
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Your feedback has been recorded and the tutor&apos;s rating has been updated.
        </p>
      </div>
    );
  }

  if (!eligibility?.eligible) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
          <Star size={16} /> Review this session
        </h2>
        <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <Lock size={13} className="shrink-0 mt-0.5" />
          {eligibility?.reason || 'You cannot review this session.'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Star size={16} /> Review this session
        </h2>
        <p className="mt-0.5 text-xs text-slate-400">
          Your review will be published with a <strong>Verified Session</strong> label.
        </p>
      </div>

      <div className="space-y-2.5">
        {RATING_DIMENSIONS.map((d) => (
          <div key={d.key} className={d.key === 'overall_rating' ? 'pt-2.5 border-t border-slate-100' : ''}>
            <RatingRow
              label={d.label}
              value={ratings[d.key]}
              onChange={(n) => { setRatings((r) => ({ ...r, [d.key]: n })); setError(''); }}
              emphasise={d.key === 'overall_rating'}
            />
          </div>
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Comment (optional)</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="What worked well? What could be better?"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
        />
        <p className="mt-1 text-[11px] text-slate-400">{comment.length}/1000</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={submitting || !allRated} className="btn-primary w-full">
        {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        {submitting ? 'Submitting…' : 'Submit Review'}
      </button>
      <p className="text-[11px] text-slate-400">
        Reviews cannot be edited once submitted, and tutors cannot change them.
      </p>
    </form>
  );
}

function RatingRow({ label, value, onChange, emphasise }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className={`text-sm ${emphasise ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>{label}</span>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n}
            aria-label={`${label}: ${n} star${n === 1 ? '' : 's'}`}
            onClick={() => onChange(n)}
            className="p-0.5 rounded hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-brand-500">
            <Star size={emphasise ? 22 : 19}
              className={n <= (value || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />
          </button>
        ))}
      </div>
    </div>
  );
}
