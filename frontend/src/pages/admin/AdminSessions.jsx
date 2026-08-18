import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock, Loader2, Users, Clock, MapPin, MonitorSmartphone, CheckCircle2,
  XCircle, Award, Info, MessageSquareOff,
} from 'lucide-react';
import { listAdminSessions } from '../../api/admin';
import { listModules } from '../../api/modules';
import StatusChip from '../../components/StatusChip.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorState from '../../components/ErrorState.jsx';

const FIELD =
  'rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none';

const SESSION_STATUSES = ['Upcoming', 'In Progress', 'Completed', 'Cancelled'];

/**
 * Session records for oversight (spec section 24).
 *
 * Shows attendance, duration and recognition eligibility. Deliberately shows NO
 * chat content — private session conversations stay scoped to their members,
 * and the notice at the bottom makes that boundary visible rather than just
 * silently enforced.
 */
export default function AdminSessions() {
  const [sessions, setSessions] = useState([]);
  const [modules, setModules] = useState([]);
  const [status, setStatus] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSessions(await listAdminSessions({ status: status || undefined, moduleId: moduleId || undefined }));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load session records.');
    } finally {
      setLoading(false);
    }
  }, [status, moduleId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Module list only powers the filter, so a failure here shouldn't block the page.
    listModules({ all: true }).then(setModules).catch(() => setModules([]));
  }, []);

  const completed = sessions.filter((s) => s.status === 'Completed');
  const eligible = sessions.filter((s) => s.recognition_status === 'Pending Lecturer Approval').length;
  const totalMinutes = completed.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Sessions</h1>
        <p className="text-sm text-slate-500">
          Attendance and recognition records across all tutoring sessions.
        </p>
      </div>

      {!loading && !error && sessions.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card py-4">
            <p className="text-2xl font-bold text-slate-800">{sessions.length}</p>
            <p className="text-xs text-slate-500">Sessions shown</p>
          </div>
          <div className="card py-4">
            <p className="text-2xl font-bold text-emerald-600">{completed.length}</p>
            <p className="text-xs text-slate-500">Completed</p>
          </div>
          <div className="card py-4">
            <p className="text-2xl font-bold text-brand-600">{Math.round((totalMinutes / 60) * 10) / 10}</p>
            <p className="text-xs text-slate-500">Tutoring hours</p>
          </div>
          <div className="card py-4">
            <p className="text-2xl font-bold text-amber-600">{eligible}</p>
            <p className="text-xs text-slate-500">Pending lecturer approval</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={FIELD} aria-label="Filter by status">
          <option value="">All statuses</option>
          {SESSION_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className={FIELD} aria-label="Filter by module">
          <option value="">All modules</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>{m.module_code} — {m.module_name}</option>
          ))}
        </select>
        {(status || moduleId) && (
          <button onClick={() => { setStatus(''); setModuleId(''); }} className="btn-secondary">
            Clear filters
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-white py-12 text-sm text-slate-400">
          <Loader2 size={16} className="mr-2 animate-spin" /> Loading sessions…
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && sessions.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title={status || moduleId ? 'No sessions match these filters' : 'No sessions yet'}
          description={
            status || moduleId
              ? 'Try clearing the filters to see all session records.'
              : 'Sessions appear here once tutors accept bookings or create group sessions.'
          }
        />
      )}

      {!loading &&
        !error &&
        sessions.map((s) => (
          <div key={s.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-brand-700">{s.module?.module_code || '—'}</span>
                  {s.is_group_session && <span className="chip bg-brand-50 text-brand-700">Group</span>}
                  <StatusChip status={s.status} />
                  {s.attendance_verified && (
                    <span className="chip bg-emerald-50 text-emerald-700">
                      <CheckCircle2 size={11} /> Attendance verified
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-800">{s.title || 'Tutoring session'}</p>
                <p className="text-xs text-slate-500">
                  Tutor: {s.tutor?.full_name || 'Unknown'}
                </p>
              </div>

              <div className="text-right text-xs text-slate-500">
                <p className="font-medium text-slate-700">{s.date}</p>
                <p>{s.start_time}–{s.end_time}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                {s.session_mode === 'Online' ? <MonitorSmartphone size={12} /> : <MapPin size={12} />}
                {s.location || s.session_mode}
              </span>
              <span className="flex items-center gap-1">
                <Users size={12} /> {s.checked_in_count} / {s.participant_count} checked in
                {s.is_group_session ? ` (cap ${s.maximum_students})` : ''}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} /> {s.duration_minutes ? `${s.duration_minutes} min` : 'Not measured'}
              </span>
            </div>

            <div
              className={`mt-3 rounded-lg border p-3 ${
                s.recognition_status === 'Pending Lecturer Approval'
                  ? 'border-amber-100 bg-amber-50'
                  : 'border-slate-100 bg-slate-50'
              }`}
            >
              <p
                className={`flex items-center gap-1.5 text-xs font-semibold ${
                  s.recognition_status === 'Pending Lecturer Approval' ? 'text-amber-800' : 'text-slate-600'
                }`}
              >
                <Award size={13} /> Recognition: {s.recognition_status}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {(s.recognition_criteria || []).map((c) => (
                  <span
                    key={c.label}
                    className={`flex items-center gap-1 text-[11px] ${c.met ? 'text-emerald-700' : 'text-slate-500'}`}
                  >
                    {c.met ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                    {c.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}

      {!loading && !error && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
          <MessageSquareOff size={14} className="mt-0.5 shrink-0 text-slate-400" />
          <p>
            Session records show attendance and recognition only. The contents of private session chats are not
            accessible to administrators — if conduct in a chat needs review, it has to come through a report
            filed by one of the participants.
          </p>
        </div>
      )}

      {!loading && !error && sessions.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs text-amber-800">
          <Info size={14} className="mt-0.5 shrink-0" />
          <p>
            &quot;Pending Lecturer Approval&quot; means the session met the configured criteria. PeerLink does not
            award CCA points or recognition itself — a lecturer makes that decision outside the platform.
          </p>
        </div>
      )}
    </div>
  );
}
