import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Flag, ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';
import { listReportCategories, submitReport, REPORT_CATEGORIES } from '../api/reports';

const MAX_DESCRIPTION = 2000;

const FIELD =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none';

/**
 * Report a user. Used by both roles — a tutee reporting a tutor and a tutor
 * reporting a tutee open the same form (spec section 25).
 *
 * The category list is fetched from the backend so the nine options can never
 * drift out of sync with what the server accepts; the exported constant is a
 * fallback if that request fails.
 */
export default function ReportModal({ open, onClose, reportedUser, sessionId, onSubmitted }) {
  const [categories, setCategories] = useState(REPORT_CATEGORIES);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Reset every time the modal opens so a previous submission isn't shown.
    setCategory('');
    setDescription('');
    setError('');
    setDone(false);
    listReportCategories()
      .then(setCategories)
      .catch(() => setCategories(REPORT_CATEGORIES));
  }, [open]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && open) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const report = await submitReport({
        reported_user_id: reportedUser?.id,
        session_id: sessionId || undefined,
        category,
        description,
      });
      setDone(true);
      onSubmitted?.(report);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit the report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = category && description.trim().length > 0 && !submitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="w-full sm:max-w-lg max-h-full overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <Flag size={18} />
            </div>
            <div>
              <h2 id="report-modal-title" className="text-sm font-bold text-slate-800">
                Report {reportedUser?.full_name || 'user'}
              </h2>
              <p className="text-xs text-slate-400">Reviewed by a PeerLink administrator</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close report form"
          >
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-sm font-semibold text-slate-800">Report submitted</p>
            <p className="mt-1 text-sm text-slate-500">
              An administrator will review it. You can follow its status under My Reports.
            </p>
            <button onClick={onClose} className="btn-primary mt-5">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-800">
              <ShieldAlert size={15} className="mt-0.5 shrink-0" />
              <p>
                Reports go to an administrator with your name attached. Only report genuine breaches of
                conduct or academic integrity. False reports are themselves a breach.{' '}
                <Link to="/academic-integrity" className="font-semibold underline" onClick={onClose}>
                  What counts as a breach?
                </Link>
              </p>
            </div>

            <div>
              <label htmlFor="report-category" className="block text-sm font-medium text-slate-700 mb-1">
                What happened?
              </label>
              <select
                id="report-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={FIELD}
                required
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="report-description" className="block text-sm font-medium text-slate-700 mb-1">
                Describe what happened
              </label>
              <textarea
                id="report-description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
                rows={5}
                className={FIELD}
                placeholder="Include dates, times and what was said or done. Specific detail helps an administrator act."
                required
              />
              <p className="mt-1 text-right text-[11px] text-slate-400">
                {description.length} / {MAX_DESCRIPTION}
              </p>
            </div>

            {sessionId && (
              <p className="text-xs text-slate-400">
                This report will be linked to the current session so the administrator has the context.
              </p>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={!canSubmit} className="btn-danger">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />}
                Submit report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
