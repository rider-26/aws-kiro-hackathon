import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileWarning, Calendar, Loader2, ShieldAlert } from 'lucide-react';
import { listOwnReports } from '../api/reports';
import { useAuth } from '../context/AuthContext.jsx';
import StatusChip from '../components/StatusChip.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';

/**
 * The reports the signed-in user has filed. Shared by both roles.
 *
 * Deliberately read-only: a filed report cannot be edited or withdrawn here,
 * and the admin's internal notes are never returned by the API for this view.
 */
const STATUS_EXPLANATION = {
  Pending: 'Waiting for an administrator to review.',
  'Under Review': 'An administrator is looking into this and may ask you for more detail.',
  Resolved: 'An administrator has reviewed this and taken action.',
  Dismissed: 'An administrator reviewed this and found no breach.',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function MyReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setReports(await listOwnReports());
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sessionsLink = user?.role === 'Tutor' ? '/tutor/sessions' : '/bookings';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">My Reports</h1>
        <p className="text-sm text-slate-500">Reports you have filed and where each one stands.</p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
        <ShieldAlert size={15} className="mt-0.5 shrink-0 text-slate-400" />
        <p>
          To file a report, open the session or profile of the person involved and use the Report option.
          Once filed, a report cannot be edited or withdrawn — an administrator owns the outcome from that
          point. Administrator notes are kept internal.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-white py-12 text-sm text-slate-400">
          <Loader2 size={16} className="mr-2 animate-spin" /> Loading your reports…
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && reports.length === 0 && (
        <EmptyState
          icon={FileWarning}
          title="You haven't filed any reports"
          description="If something goes wrong in a session, you can report it from the session page. Reports go to a PeerLink administrator."
          action={
            <Link to={sessionsLink} className="btn-secondary">
              Go to my sessions
            </Link>
          }
        />
      )}

      {!loading &&
        !error &&
        reports.map((r) => (
          <div key={r.id} className="card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{r.category}</span>
                  <StatusChip status={r.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  About <span className="font-medium text-slate-700">{r.reported_user?.full_name || 'a user'}</span>
                </p>
              </div>
              <p className="flex items-center gap-1 text-[11px] text-slate-400">
                <Calendar size={11} /> {formatDate(r.created_date)}
              </p>
            </div>

            <p className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
              {r.description}
            </p>

            {r.session && (
              <p className="text-xs text-slate-500">
                Linked session:{' '}
                <Link to={`/sessions/${r.session.id}`} className="font-medium text-brand-700 hover:underline">
                  {r.session.module?.module_code || 'Session'} · {r.session.session_date}
                </Link>
              </p>
            )}

            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-600">{STATUS_EXPLANATION[r.status] || 'Status unavailable.'}</p>
              {r.action_taken && (
                <p className="mt-1 text-xs font-semibold text-slate-800">Outcome: {r.action_taken}</p>
              )}
              {r.reviewed_date && (
                <p className="mt-1 text-[11px] text-slate-400">Reviewed {formatDate(r.reviewed_date)}</p>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}
