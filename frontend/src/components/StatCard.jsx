import { Link } from 'react-router-dom';

/**
 * Single metric tile used across the admin dashboard and analytics pages.
 * Optionally links somewhere — a count of things needing a decision should be
 * clickable through to the queue that resolves them.
 */
const TONES = {
  brand: 'bg-brand-50 text-brand-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-500',
};

export default function StatCard({ icon: Icon, label, value, hint, tone = 'brand', to }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
        {Icon && (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONES[tone] || TONES.brand}`}>
            <Icon size={17} />
          </div>
        )}
      </div>
      <p className="mt-1 text-xs font-medium text-slate-600">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="card py-4 transition-colors hover:border-brand-200">
        {body}
      </Link>
    );
  }

  return <div className="card py-4">{body}</div>;
}
