import { useEffect, useState } from 'react';
import { Award, Save, Info, Loader2 } from 'lucide-react';
import { getRecognitionRules, updateRecognitionRules } from '../../api/admin';
import ErrorState from '../../components/ErrorState';

/**
 * Admin configuration for recognition eligibility thresholds (spec section 22).
 * Changing these only changes what the platform *proposes* for lecturer
 * approval — it never awards anything, and the page says so.
 */
export default function AdminRecognitionRules() {
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    setError(false);
    try {
      setRules(await getRecognitionRules());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function update(field, value) {
    setRules((r) => ({ ...r, [field]: value }));
    setSaved(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const updated = await updateRecognitionRules({
        min_participants: Number(rules.min_participants),
        min_duration_minutes: Number(rules.min_duration_minutes),
        require_verified_attendance: !!rules.require_verified_attendance,
      });
      setRules(updated);
      setSaved(true);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Could not save these thresholds.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading thresholds…</p>;
  if (error || !rules) return <ErrorState onRetry={load} />;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Award size={20} className="text-brand-600" /> Recognition Eligibility Rules
        </h1>
        <p className="text-sm text-slate-500">
          Thresholds a tutoring session must meet before PeerLink proposes it for recognition.
        </p>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 flex gap-2">
        <Info size={15} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          PeerLink does not award CCA points. Sessions that meet these thresholds are marked
          <strong> Pending Lecturer Approval</strong> for a lecturer to review and decide.
        </p>
      </div>

      <form onSubmit={handleSave} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Minimum participants</label>
          <input type="number" min={0} value={rules.min_participants}
            onChange={(e) => update('min_participants', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          <p className="mt-1 text-xs text-slate-400">Counted from students who actually checked in.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Minimum duration (minutes)</label>
          <input type="number" min={0} value={rules.min_duration_minutes}
            onChange={(e) => update('min_duration_minutes', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          <p className="mt-1 text-xs text-slate-400">Measured between the tutor starting and ending the session.</p>
        </div>

        <label className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-3 cursor-pointer">
          <input type="checkbox" checked={!!rules.require_verified_attendance}
            onChange={(e) => update('require_verified_attendance', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          <span>
            <span className="block text-sm font-medium text-slate-700">Require verified attendance</span>
            <span className="block text-xs text-slate-400">
              Verified means a student both checked in and confirmed the session took place.
            </span>
          </span>
        </label>

        {formError && <p className="text-sm text-red-600">{formError}</p>}
        {saved && <p className="text-sm text-emerald-700">Thresholds saved.</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Saving…' : 'Save Thresholds'}
          </button>
          {rules.is_default && (
            <span className="text-xs text-slate-400">Currently using built-in defaults.</span>
          )}
        </div>
      </form>
    </div>
  );
}
