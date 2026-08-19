import { Award, CheckCircle2, XCircle, Info } from 'lucide-react';

/**
 * Recognition eligibility display (spec section 22).
 *
 * Deliberately framed as a proposal: it reports whether configured thresholds
 * were met and ends at "Pending Lecturer Approval". It never states that any
 * points or credit have been granted, and the approval note from the backend is
 * always shown alongside (business rule 14).
 */
export default function RecognitionEligibilityCard({ recognition }) {
  if (!recognition) return null;

  const { criteria, status, all_criteria_met, approval_note, rules_applied } = recognition;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Award size={16} className="text-brand-600" /> Recognition Eligibility
        </h2>
        <span className={`chip text-[10px] ${
          all_criteria_met ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
        }`}>
          {status}
        </span>
      </div>

      <div className="space-y-2">
        {criteria.map((c) => (
          <div key={c.key} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700">{c.label}</p>
              <p className="text-[11px] text-slate-400">{c.requirement}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-500">{c.value}</span>
              {c.met ? (
                <span className="chip bg-emerald-100 text-emerald-800 text-[10px]">
                  <CheckCircle2 size={11} /> Met
                </span>
              ) : (
                <span className="chip bg-slate-200 text-slate-600 text-[10px]">
                  <XCircle size={11} /> Not Met
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
        <Info size={13} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-800">{approval_note}</p>
      </div>

      {rules_applied && (
        <p className="mt-2 text-[10px] text-slate-400">
          Thresholds in effect: {rules_applied.min_participants} participant(s),
          {' '}{rules_applied.min_duration_minutes} min
          {rules_applied.require_verified_attendance ? ', verified attendance required' : ''}.
          Configurable by a lecturer.
        </p>
      )}
    </div>
  );
}
