import { useCallback, useEffect, useState } from 'react';
import {
  FileWarning, ShieldAlert, Ban, MessageSquareWarning, XCircle, ShieldCheck,
  Loader2, ChevronRight, History, RotateCcw, Calendar,
} from 'lucide-react';
import { listReports, getReport, actionReport, reinstateUser } from '../../api/admin';
import { REPORT_STATUSES } from '../../api/reports';
import StatusChip from '../../components/StatusChip.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const FIELD =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none';

/**
 * The five moderation actions (spec section 26). `confirm` marks the ones that
 * need an explicit second step — only suspension, since it locks the account
 * out of login until an admin reinstates it.
 */
const ACTIONS = [
  { key: 'warn', label: 'Issue Warning', icon: ShieldAlert, style: 'btn-secondary' },
  { key: 'suspend', label: 'Suspend Account', icon: Ban, style: 'btn-danger', confirm: true },
  { key: 'request_info', label: 'Request More Info', icon: MessageSquareWarning, style: 'btn-secondary' },
  { key: 'dismiss', label: 'Dismiss', icon: XCircle, style: 'btn-secondary' },
  { key: 'resolve', label: 'Mark Resolved', icon: ShieldCheck, style: 'btn-primary' },
];

const CLOSED = ['Resolved', 'Dismissed'];

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminReports() {
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState(null);
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [actioning, setActioning] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listReports({ status: statusFilter || undefined });
      setData(res.reports);
      setCounts(res.counts);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the moderation queue.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function openReport(id) {
    setDetailLoading(true);
    setActionError('');
    setNotes('');
    try {
      const report = await getReport(id);
      setSelected(report);
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not load that report.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function runAction(action) {
    setActioning(action);
    setActionError('');
    try {
      const result = await actionReport(selected.id, { action, admin_notes: notes });
      setSelected(result.report);
      setNotes('');
      await load();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not apply that action.');
    } finally {
      setActioning('');
      setConfirmAction(null);
    }
  }

  async function handleReinstate() {
    setActioning('reinstate');
    setActionError('');
    try {
      await reinstateUser(selected.reported_user.id);
      await openReport(selected.id);
      await load();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not reinstate that account.');
    } finally {
      setActioning('');
    }
  }

  const isClosed = selected && CLOSED.includes(selected.status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Reports & Moderation</h1>
        <p className="text-sm text-slate-500">
          Review conduct and academic integrity reports filed by students and tutors.
        </p>
      </div>

      {counts && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Pending', value: counts.pending, tone: 'text-amber-600' },
            { label: 'Under Review', value: counts.under_review, tone: 'text-blue-600' },
            { label: 'Resolved', value: counts.resolved, tone: 'text-emerald-600' },
            { label: 'Dismissed', value: counts.dismissed, tone: 'text-slate-500' },
          ].map((s) => (
            <div key={s.label} className="card py-4">
              <p className={`text-2xl font-bold ${s.tone}`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter('')}
          className={`chip ${statusFilter === '' ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
        >
          All
        </button>
        {REPORT_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`chip ${statusFilter === s ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] items-start">
        <div className="space-y-3">
          {loading && (
            <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-white py-12 text-sm text-slate-400">
              <Loader2 size={16} className="mr-2 animate-spin" /> Loading reports…
            </div>
          )}

          {!loading && error && <ErrorState message={error} onRetry={load} />}

          {!loading && !error && data?.length === 0 && (
            <EmptyState
              icon={FileWarning}
              title={statusFilter ? `No ${statusFilter.toLowerCase()} reports` : 'No reports filed'}
              description={
                statusFilter
                  ? 'Try a different status filter to see other reports.'
                  : 'Reports filed by students and tutors will appear here for review.'
              }
            />
          )}

          {!loading &&
            !error &&
            data?.map((r) => (
              <button
                key={r.id}
                onClick={() => openReport(r.id)}
                className={`w-full text-left card transition-colors hover:border-brand-200 ${
                  selected?.id === r.id ? 'border-brand-300 ring-1 ring-brand-200' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{r.category}</span>
                      <StatusChip status={r.status} />
                      {r.reported_user_status === 'Suspended' && <StatusChip status="Suspended" />}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{r.reporter?.full_name || 'Unknown'}</span>{' '}
                      <span className="text-slate-400">({r.reporter_role})</span> reported{' '}
                      <span className="font-medium text-slate-700">{r.reported_user?.full_name || 'Unknown'}</span>
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{r.description}</p>
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
                      <Calendar size={11} /> {formatDate(r.created_date)}
                      {r.session?.module && <> · {r.session.module.module_code}</>}
                    </p>
                  </div>
                  <ChevronRight size={16} className="mt-1 shrink-0 text-slate-300" />
                </div>
              </button>
            ))}
        </div>

        <div className="lg:sticky lg:top-4">
          {!selected && !detailLoading && (
            <div className="card text-center py-10">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <FileWarning size={20} />
              </div>
              <p className="text-sm font-semibold text-slate-700">Select a report</p>
              <p className="mt-1 text-sm text-slate-400">
                Open a report to see its full detail, the reported user&apos;s history, and the actions available.
              </p>
            </div>
          )}

          {detailLoading && (
            <div className="card flex items-center justify-center py-10 text-sm text-slate-400">
              <Loader2 size={16} className="mr-2 animate-spin" /> Loading…
            </div>
          )}

          {selected && !detailLoading && (
            <div className="card space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">{selected.category}</h2>
                  <StatusChip status={selected.status} />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Filed {formatDate(selected.created_date)}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-slate-400">Reported by</p>
                  <p className="mt-0.5 font-semibold text-slate-700">{selected.reporter?.full_name}</p>
                  <p className="text-slate-400">{selected.reporter_role}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-slate-400">Reported user</p>
                  <p className="mt-0.5 font-semibold text-slate-700">{selected.reported_user?.full_name}</p>
                  <p className="mt-1">
                    <StatusChip status={selected.reported_user_status || 'Active'} />
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Description</p>
                <p className="whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                  {selected.description}
                </p>
              </div>

              {selected.session && (
                <div className="rounded-lg border border-slate-100 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">Linked session</p>
                  <p className="mt-0.5">
                    {selected.session.module?.module_code} · {selected.session.session_date} ·{' '}
                    {selected.session.start_time}–{selected.session.end_time} · {selected.session.status}
                  </p>
                </div>
              )}

              {selected.prior_report_count > 0 && (
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                    <History size={13} />
                    {selected.prior_report_count} previous report
                    {selected.prior_report_count === 1 ? '' : 's'} against this user
                  </p>
                  <ul className="mt-2 space-y-1">
                    {selected.prior_reports.slice(0, 5).map((p) => (
                      <li key={p.id} className="text-[11px] text-amber-800">
                        {p.category} · {p.status}
                        {p.action_taken ? ` · ${p.action_taken}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selected.prior_report_count === 0 && (
                <p className="text-[11px] text-slate-400">No previous reports against this user.</p>
              )}

              {isClosed ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">Outcome</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-800">{selected.action_taken}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Reviewed {formatDate(selected.reviewed_date)}
                    </p>
                    {selected.admin_notes && (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">{selected.admin_notes}</p>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Closed reports keep a permanent record of the decision and cannot be actioned again.
                  </p>
                  {selected.reported_user_status === 'Suspended' && (
                    <button onClick={handleReinstate} disabled={actioning === 'reinstate'} className="btn-secondary w-full">
                      {actioning === 'reinstate' ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RotateCcw size={14} />
                      )}
                      Reinstate account
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div>
                    <label htmlFor="admin-notes" className="block text-xs font-semibold text-slate-500 mb-1">
                      Admin notes (internal, not shown to the reporter)
                    </label>
                    <textarea
                      id="admin-notes"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
                      className={FIELD}
                      placeholder="What did you check, and why did you choose this outcome?"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {ACTIONS.map(({ key, label, icon: Icon, style, confirm }) => (
                      <button
                        key={key}
                        onClick={() => (confirm ? setConfirmAction(key) : runAction(key))}
                        disabled={!!actioning}
                        className={`${style} w-full`}
                      >
                        {actioning === key ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                        {label}
                      </button>
                    ))}
                  </div>

                  <p className="text-[11px] text-slate-400">
                    Suspending an account immediately blocks the user from signing in until an administrator
                    reinstates it.
                  </p>
                </div>
              )}

              {actionError && (
                <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {actionError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        danger
        busy={!!actioning}
        title={`Suspend ${selected?.reported_user?.full_name || 'this account'}?`}
        message="They will be signed out of PeerLink and blocked from logging back in until an administrator reinstates the account. Existing bookings and sessions are not cancelled automatically."
        confirmLabel="Suspend account"
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => runAction(confirmAction)}
      />
    </div>
  );
}
