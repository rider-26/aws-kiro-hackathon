import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Calendar, Clock, Users, ChevronRight } from 'lucide-react';
import { listSessions } from '../api/sessions';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Session-scoped message list. There are no standalone DM threads in
 * PeerLink — every conversation belongs to a session, which is what makes
 * the membership rule enforceable (spec section 14, business rule 6).
 */
export default function Messages() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      setSessions(await listSessions());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const active = sessions.filter((s) => s.status !== 'Cancelled');

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Messages</h1>
        <p className="text-sm text-slate-500">
          Each conversation belongs to a confirmed session. Only its tutor and participants can read it.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading conversations…</p>
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : active.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description={user?.role === 'Tutor'
            ? 'Accept a booking request to open a session chat with a student.'
            : 'Once a tutor accepts your booking, your session chat opens here.'}
          action={user?.role === 'Tutor'
            ? <Link to="/tutor/requests" className="btn-primary">View Requests</Link>
            : <Link to="/find-tutors" className="btn-primary">Find Tutors</Link>}
        />
      ) : (
        <div className="card divide-y divide-slate-100 p-0">
          {active.map((s) => {
            const counterpart = user?.role === 'Tutor'
              ? s.participants.map((p) => p.user?.full_name).filter(Boolean).join(', ') || 'Student'
              : s.tutor?.user?.full_name || 'Tutor';

            return (
              <Link key={s.id} to={`/sessions/${s.id}`}
                className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 font-semibold">
                  {counterpart[0] || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800 truncate">{counterpart}</p>
                    <span className="text-[11px] font-medium text-brand-600">{s.module?.module_code}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Calendar size={11} /> {s.date}</span>
                    <span className="flex items-center gap-1"><Clock size={11} /> {s.start_time}</span>
                    {s.maximum_students > 1 && (
                      <span className="flex items-center gap-1">
                        <Users size={11} /> {s.participant_count}/{s.maximum_students}
                      </span>
                    )}
                  </div>
                </div>
                <StatusChip status={s.status} />
                <ChevronRight size={16} className="text-slate-300 shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
