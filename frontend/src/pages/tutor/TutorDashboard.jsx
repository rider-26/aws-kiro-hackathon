import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Inbox, CalendarClock, Users, Star, Clock, Calendar, MapPin, MonitorSmartphone,
  ArrowRight, ShieldCheck, AlertCircle,
} from 'lucide-react';
import { getDashboard } from '../../api/dashboard';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusChip from '../../components/StatusChip';
import StarRating from '../../components/StarRating';
import ErrorState from '../../components/ErrorState';

/** Tutor dashboard (spec section 19). */
export default function TutorDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      setData(await getDashboard());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <p className="text-sm text-slate-400">Loading your dashboard…</p>;
  if (error || !data) return <ErrorState onRetry={load} />;

  const { profile, pending_requests, upcoming_sessions, stats } = data;
  const firstName = (user?.full_name || '').split(' ')[0] || 'there';

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Welcome back, {firstName}</h1>
        <p className="text-sm text-slate-500">
          {stats.pending_request_count > 0
            ? `${stats.pending_request_count} request${stats.pending_request_count === 1 ? '' : 's'} waiting for your response.`
            : 'No requests waiting. Your schedule is up to date.'}
        </p>
      </div>

      {!profile && (
        <div className="card border-amber-200 bg-amber-50/50">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
            <AlertCircle size={16} /> Finish setting up your tutor profile
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Add your bio, topics and availability so students can find and book you.
          </p>
          <Link to="/tutor/profile" className="btn-primary mt-3">Set up profile</Link>
        </div>
      )}

      {/* Stat cards (spec section 19) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Inbox} label="Pending Requests" value={stats.pending_request_count}
          tone={stats.pending_request_count > 0 ? 'amber' : 'slate'} />
        <StatCard icon={CalendarClock} label="Upcoming Sessions" value={stats.upcoming_session_count} tone="brand" />
        <StatCard icon={Users} label="Students Helped" value={stats.students_helped} tone="brand" />
        <StatCard icon={Star} label="Rating"
          value={stats.average_rating ? stats.average_rating.toFixed(1) : 'New'} tone="amber" />
        <StatCard icon={Clock} label="Tutoring Hours" value={stats.tutoring_hours} tone="brand" />
      </div>

      {/* Booking requests */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Inbox size={15} /> Booking Requests
          </h2>
          <Link to="/tutor/requests" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {pending_requests.length === 0 ? (
          <p className="text-sm text-slate-400">No pending requests right now.</p>
        ) : (
          <div className="space-y-2">
            {pending_requests.slice(0, 4).map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">
                    {b.student?.full_name}
                    <span className="ml-2 text-xs text-brand-600">{b.module_id ? '' : ''}</span>
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Calendar size={11} /> {b.date}</span>
                    <span className="flex items-center gap-1"><Clock size={11} /> {b.start_time}–{b.end_time}</span>
                    <span>{b.session_type}</span>
                  </div>
                  {b.topics?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {b.topics.map((t) => (
                        <span key={t} className="chip bg-brand-50 text-brand-700 text-[10px]">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <Link to="/tutor/requests" className="btn-primary !py-1.5 !px-3 text-xs shrink-0">Respond</Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming schedule */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <CalendarClock size={15} /> Upcoming Schedule
          </h2>
          <Link to="/tutor/sessions" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {upcoming_sessions.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing scheduled yet.</p>
        ) : (
          <div className="space-y-2">
            {upcoming_sessions.map((s) => (
              <Link key={s.id} to={`/sessions/${s.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5 hover:bg-slate-100 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">
                    {s.module?.module_code} — {s.participants.map((p) => p.user?.full_name).filter(Boolean).join(', ') || 'No participants'}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Calendar size={11} /> {s.date}</span>
                    <span className="flex items-center gap-1"><Clock size={11} /> {s.start_time}–{s.end_time}</span>
                    <span className="flex items-center gap-1">
                      {s.session_mode === 'Online' ? <MonitorSmartphone size={11} /> : <MapPin size={11} />} {s.session_mode}
                    </span>
                  </div>
                </div>
                <StatusChip status={s.status} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Rating summary */}
      {stats.review_count > 0 && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <ShieldCheck size={15} className="text-emerald-600" /> Your Rating
              </h2>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-2xl font-bold text-slate-800 leading-none">
                  {stats.average_rating.toFixed(1)}
                </span>
                <StarRating value={stats.average_rating} showValue={false} size={16} />
              </div>
              <p className="mt-1 text-xs text-slate-400">
                From {stats.review_count} verified session review{stats.review_count === 1 ? '' : 's'}
              </p>
            </div>
            <Link to="/tutor/reviews" className="btn-secondary">View Reviews</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-400',
  };

  return (
    <div className="card py-4">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon size={16} />
      </span>
      <p className="mt-2 text-lg font-bold text-slate-800 leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{label}</p>
    </div>
  );
}
