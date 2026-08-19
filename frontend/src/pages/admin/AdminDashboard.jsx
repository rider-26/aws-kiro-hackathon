import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, GraduationCap, ShieldCheck, ShieldAlert, FileWarning, CalendarClock,
  CalendarCheck, Clock, Star, Ban, Loader2, ArrowRight, BarChart3,
} from 'lucide-react';
import { getAdminDashboard } from '../../api/admin';
import { useAuth } from '../../context/AuthContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorState from '../../components/ErrorState.jsx';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getAdminDashboard());
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-white py-16 text-sm text-slate-400">
        <Loader2 size={16} className="mr-2 animate-spin" /> Loading dashboard…
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  const s = data.stats;
  const pendingVerifications = data.action_required.verifications;
  const pendingReports = data.action_required.reports;
  const nothingToAction = pendingVerifications.length === 0 && pendingReports.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">
          {user?.full_name ? `Welcome, ${user.full_name}` : 'Admin Dashboard'}
        </h1>
        <p className="text-sm text-slate-500">Platform overview and the queues waiting on a decision.</p>
      </div>

      {/* Anything needing a human decision goes first — the rest is reference. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={ShieldAlert}
          tone={s.pending_verifications > 0 ? 'amber' : 'emerald'}
          label="Verifications pending"
          value={s.pending_verifications}
          hint={s.pending_verifications > 0 ? 'Awaiting your review' : 'Queue clear'}
          to="/admin/tutors"
        />
        <StatCard
          icon={FileWarning}
          tone={s.pending_reports > 0 ? 'red' : 'emerald'}
          label="Reports pending"
          value={s.pending_reports}
          hint={s.pending_reports > 0 ? 'Awaiting your review' : 'Queue clear'}
          to="/admin/reports"
        />
        <StatCard
          icon={Ban}
          tone={s.suspended_accounts > 0 ? 'red' : 'slate'}
          label="Suspended accounts"
          value={s.suspended_accounts}
          hint="Blocked from signing in"
        />
        <StatCard
          icon={CalendarClock}
          tone="brand"
          label="Upcoming sessions"
          value={s.upcoming_sessions}
          to="/admin/sessions"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} tone="brand" label="Students" value={s.total_students} to="/admin/students" />
        <StatCard icon={GraduationCap} tone="brand" label="Tutors" value={s.total_tutors} to="/admin/tutors" />
        <StatCard
          icon={ShieldCheck}
          tone="emerald"
          label="Verified tutor-modules"
          value={s.verified_tutor_modules}
          hint="Bookable module coverage"
        />
        <StatCard icon={CalendarCheck} tone="brand" label="Completed sessions" value={s.completed_sessions} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Clock} tone="brand" label="Tutoring hours" value={s.tutoring_hours} hint="From measured session durations" />
        <StatCard
          icon={Star}
          tone="amber"
          label="Average tutor rating"
          value={s.platform_average_rating || '—'}
          hint="Across rated tutors only"
        />
        <StatCard icon={CalendarCheck} tone="slate" label="Total bookings" value={s.total_bookings} />
        <StatCard
          icon={Clock}
          tone={s.pending_bookings > 0 ? 'amber' : 'slate'}
          label="Bookings awaiting a tutor"
          value={s.pending_bookings}
        />
      </div>

      {nothingToAction && (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing is waiting on you"
          description="Both the verification and moderation queues are clear. New requests will appear here."
          action={
            <Link to="/admin/analytics" className="btn-secondary">
              <BarChart3 size={14} /> View analytics
            </Link>
          }
        />
      )}

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        {pendingVerifications.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Verification requests</h2>
              <Link to="/admin/tutors" className="text-xs font-medium text-brand-700 hover:underline">
                Review all
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {pendingVerifications.map((v) => (
                <div key={v.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{v.tutor?.user?.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {v.module?.module_code} — {v.module?.module_name}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">Requested {formatDate(v.created_date)}</p>
                    </div>
                    <StatusChip status={v.status} />
                  </div>
                </div>
              ))}
            </div>
            <Link to="/admin/tutors" className="btn-secondary mt-3 w-full">
              Approve or reject <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {pendingReports.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Conduct reports</h2>
              <Link to="/admin/reports" className="text-xs font-medium text-brand-700 hover:underline">
                Review all
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {pendingReports.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{r.category}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {r.reporter?.full_name} reported {r.reported_user?.full_name}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">Filed {formatDate(r.created_date)}</p>
                    </div>
                    <StatusChip status={r.status} />
                  </div>
                </div>
              ))}
            </div>
            <Link to="/admin/reports" className="btn-secondary mt-3 w-full">
              Open moderation queue <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <p className="font-semibold text-slate-600 mb-1">Scope of admin access</p>
        Admins see session records — attendance, duration and recognition eligibility — but not the contents of
        private session chats, and not individual students&apos; quiz answers. Recognition is only ever proposed
        for lecturer approval; PeerLink does not award CCA points.
      </div>
    </div>
  );
}
