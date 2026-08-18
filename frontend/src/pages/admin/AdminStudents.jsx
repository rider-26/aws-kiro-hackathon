import { useCallback, useEffect, useState } from 'react';
import {
  Users, Search, Loader2, Ban, RotateCcw, GraduationCap, ShieldOff, Share2, Info,
} from 'lucide-react';
import { listStudents, reinstateUser } from '../../api/admin';
import StatusChip from '../../components/StatusChip.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorState from '../../components/ErrorState.jsx';

const FIELD =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none';

function scoreTone(pct) {
  if (pct === null || pct === undefined) return 'text-slate-400';
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Student roster for admin oversight.
 *
 * Deliberately shows engagement (attempt counts, latest score, sessions
 * attended) and NOT the contents of anyone's quiz answers or uploaded
 * material — that's private learning data. The notice at the bottom of the
 * page states this so the boundary is visible to the person using it, not just
 * enforced in the API.
 */
export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async (term) => {
    setLoading(true);
    setError('');
    try {
      setStudents(await listStudents({ search: term || undefined }));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the student roster.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReinstate(student) {
    setBusyId(student.id);
    try {
      await reinstateUser(student.id);
      await load(search);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reinstate that account.');
    } finally {
      setBusyId('');
    }
  }

  const withAttempts = students.filter((s) => s.quiz_attempt_count > 0).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Students</h1>
        <p className="text-sm text-slate-500">Engagement overview for tutee accounts.</p>
      </div>

      {!loading && !error && students.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="card py-4">
            <p className="text-2xl font-bold text-slate-800">{students.length}</p>
            <p className="text-xs text-slate-500">Student accounts</p>
          </div>
          <div className="card py-4">
            <p className="text-2xl font-bold text-brand-600">{withAttempts}</p>
            <p className="text-xs text-slate-500">Have taken a quiz</p>
          </div>
          <div className="card py-4">
            <p className="text-2xl font-bold text-emerald-600">
              {students.filter((s) => s.sessions_attended > 0).length}
            </p>
            <p className="text-xs text-slate-500">Have attended a session</p>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(search);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or course"
            className={`${FIELD} pl-9`}
            aria-label="Search students"
          />
        </div>
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {loading && (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-white py-12 text-sm text-slate-400">
          <Loader2 size={16} className="mr-2 animate-spin" /> Loading students…
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={() => load(search)} />}

      {!loading && !error && students.length === 0 && (
        <EmptyState
          icon={Users}
          title={search ? 'No students match that search' : 'No student accounts yet'}
          description={search ? 'Try a different name, email or course.' : 'Registered students will appear here.'}
        />
      )}

      {!loading &&
        !error &&
        students.map((s) => (
          <div key={s.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-slate-800">{s.full_name}</p>
                  {s.account_status === 'Suspended' && <StatusChip status="Suspended" />}
                  {s.shares_learning_summary && (
                    <span className="chip bg-brand-50 text-brand-700" title="This student shares their learning summary with tutors they book">
                      <Share2 size={11} /> Sharing on
                    </span>
                  )}
                </div>
                <p className="break-all text-xs text-slate-500">{s.email}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                  <GraduationCap size={12} /> {s.course || 'Course not set'}
                  {s.year_of_study ? ` · Year ${s.year_of_study}` : ''}
                </p>
              </div>

              <div className="text-right">
                <p className={`text-xl font-bold ${scoreTone(s.latest_quiz_percentage)}`}>
                  {s.latest_quiz_percentage === null ? '—' : `${s.latest_quiz_percentage}%`}
                </p>
                <p className="text-[11px] text-slate-400">
                  {s.latest_quiz_date ? `Latest quiz ${formatDate(s.latest_quiz_date)}` : 'No quiz taken'}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-4">
              <div>
                <p className="text-slate-400">Quiz attempts</p>
                <p className="mt-0.5 font-semibold text-slate-700">{s.quiz_attempt_count}</p>
              </div>
              <div>
                <p className="text-slate-400">Bookings made</p>
                <p className="mt-0.5 font-semibold text-slate-700">{s.booking_count}</p>
              </div>
              <div>
                <p className="text-slate-400">Sessions joined</p>
                <p className="mt-0.5 font-semibold text-slate-700">{s.session_count}</p>
              </div>
              <div>
                <p className="text-slate-400">Sessions attended</p>
                <p className="mt-0.5 font-semibold text-slate-700">{s.sessions_attended}</p>
              </div>
            </div>

            {s.quiz_attempt_count === 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                <ShieldOff size={11} /> Has not used the AI study assistant yet.
              </p>
            )}

            {s.account_status === 'Suspended' && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="flex items-center gap-1.5 text-xs text-red-700">
                  <Ban size={13} /> Suspended — blocked from signing in.
                </p>
                <button
                  onClick={() => handleReinstate(s)}
                  disabled={busyId === s.id}
                  className="btn-secondary !py-1.5 !px-3 text-xs"
                >
                  {busyId === s.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                  Reinstate
                </button>
              </div>
            )}
          </div>
        ))}

      {!loading && !error && (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
          <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
          <p>
            This view shows engagement counts and the most recent quiz score only. Individual quiz answers,
            uploaded study material and private session chats are not accessible to administrators.
          </p>
        </div>
      )}
    </div>
  );
}
