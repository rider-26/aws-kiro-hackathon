import { TrendingUp, TrendingDown, Minus, PartyPopper } from 'lucide-react';

/**
 * Improvement banner (spec section 32). Reports the change in percentage points
 * between the two most recent completed attempts, and celebrates a real gain.
 */
export default function ImprovementBanner({ latest, previous, delta }) {
  if (!latest) return null;

  // Only one attempt so far — there is nothing to compare against yet.
  if (!previous || delta === null || delta === undefined) {
    return (
      <div className="card">
        <p className="text-sm font-semibold text-slate-800">First attempt recorded</p>
        <p className="mt-1 text-sm text-slate-600">
          You scored {latest.score}/{latest.total_questions} ({latest.percentage}%).
          Take the quiz again after a tutoring session to measure your improvement.
        </p>
      </div>
    );
  }

  const improved = delta > 0;
  const unchanged = delta === 0;

  const tone = improved
    ? { card: 'border-emerald-200 bg-emerald-50/50', text: 'text-emerald-800', icon: PartyPopper, badge: 'bg-emerald-600' }
    : unchanged
      ? { card: 'border-slate-200 bg-slate-50', text: 'text-slate-700', icon: Minus, badge: 'bg-slate-500' }
      : { card: 'border-amber-200 bg-amber-50/50', text: 'text-amber-800', icon: TrendingDown, badge: 'bg-amber-600' };

  const Icon = tone.icon;

  return (
    <div className={`card ${tone.card}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.badge} text-white`}>
            <Icon size={19} />
          </div>
          <div>
            <p className={`text-sm font-bold ${tone.text}`}>
              {improved ? 'Great improvement!' : unchanged ? 'Score held steady' : 'Score dipped this time'}
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              Latest {latest.score}/{latest.total_questions} ({latest.percentage}%)
              {' · '}Previous {previous.score}/{previous.total_questions} ({previous.percentage}%)
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className={`flex items-center justify-end gap-1 text-2xl font-bold ${tone.text}`}>
            {improved && <TrendingUp size={20} />}
            {improved ? '+' : ''}{delta}
          </p>
          <p className="text-[11px] text-slate-400">percentage points</p>
        </div>
      </div>
    </div>
  );
}
