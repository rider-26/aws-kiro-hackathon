import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock, Calendar, Clock, MapPin, MonitorSmartphone, Users, ChevronRight, ShieldCheck,
  Plus, X,
} from 'lucide-react';
import { listSessions } from '../../api/sessions';
import StatusChip from '../../components/StatusChip';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import GroupSessionForm from '../../components/GroupSessionForm';

export default function TutorSessions() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);

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

  const active = sessions.filter((s) => ['Upcoming', 'In Progress'].includes(s.status));
  const past = sessions.filter((s) => ['Completed', 'Cancelled'].includes(s.status));

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Sessions</h1>
          <p className="text-sm text-slate-500">Start sessions, record attendance and review past sessions.</p>
        </div>
        <button onClick={() => setCreating((c) => !c)} className="btn-primary">
          {creating ? <X size={16} /> : <Plus size={16} />}
          {creating ? 'Cancel' : 'New Group Session'}
        </button>
      </div>

      {creating && (
        <GroupSessionForm
          onCancel={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading sessions…</p>
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No sessions yet"
          description="Accept a booking request and a session will be created here."
          action={<Link to="/tutor/requests" className="btn-primary">View Requests</Link>}
        />
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-600">Upcoming & in progress ({active.length})</h2>
            {active.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing scheduled right now.</p>
            ) : (
              <div className="space-y-2">
                {active.map((s) => <SessionRow key={s.id} session={s} />)}
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-600">Past sessions</h2>
              <div className="space-y-2">
                {past.map((s) => <SessionRow key={s.id} session={s} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SessionRow({ session }) {
  const students = session.participants.map((p) => p.user?.full_name).filter(Boolean).join(', ');
  // Group sessions have no originating booking, so the title carries the label.
  const isGroup = !session.booking_id && (session.maximum_students || 0) > 1;

  return (
    <Link to={`/sessions/${session.id}`}
      className="card flex items-center gap-3 hover:border-brand-300 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-800">{session.module?.module_code}</p>
          <span className="text-sm text-slate-600 truncate">
            {isGroup ? session.title : (students || 'No participants')}
          </span>
          {isGroup && (
            <span className="chip bg-brand-100 text-brand-700 text-[10px]">
              <Users size={10} /> Group
            </span>
          )}
          {session.attendance_verified && (
            <span className="chip bg-emerald-100 text-emerald-800 text-[10px]">
              <ShieldCheck size={10} /> Verified
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
          <span className="flex items-center gap-1"><Calendar size={11} /> {session.date}</span>
          <span className="flex items-center gap-1"><Clock size={11} /> {session.start_time}–{session.end_time}</span>
          <span className="flex items-center gap-1">
            {session.session_mode === 'Online' ? <MonitorSmartphone size={11} /> : <MapPin size={11} />} {session.session_mode}
          </span>
          <span className="flex items-center gap-1">
            <Users size={11} /> {session.participant_count}
            {session.maximum_students > 1 ? `/${session.maximum_students}` : ''}
          </span>
          {session.duration_minutes > 0 && (
            <span className="flex items-center gap-1">{session.duration_minutes} min</span>
          )}
        </div>
      </div>
      <StatusChip status={session.status} />
      <ChevronRight size={16} className="text-slate-300 shrink-0" />
    </Link>
  );
}
