import { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  BarChart3, Loader2, TrendingUp, Users, CalendarCheck, Star, FileWarning,
  ShieldAlert, Info, Repeat,
} from 'lucide-react';
import { getAnalytics } from '../../api/admin';
import StatCard from '../../components/StatCard.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorState from '../../components/ErrorState.jsx';

function gapColour(pct) {
  if (pct >= 80) return '#10b981';
  if (pct >= 60) return '#f59e0b';
  return '#ef4444';
}

/**
 * Aggregate platform analytics (spec section 27).
 *
 * The headline question this page answers is "which modules need more verified
 * tutors" — so cohort topic gaps are shown next to the verified tutor supply for
 * that module, since a weak topic with no verified tutor is the actionable case.
 */
export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getAnalytics());
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load analytics.');
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
        <Loader2 size={16} className="mr-2 animate-spin" /> Loading analytics…
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  const { module_demand, booking_funnel, sessions, learning, quality, notice } = data;
  const demandData = module_demand.filter((m) => m.booking_count > 0 || m.session_count > 0);
  const gaps = learning.topic_gaps;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Analytics</h1>
        <p className="text-sm text-slate-500">Aggregate platform activity and where tutoring supply is short.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          tone="brand"
          label="Average quiz score"
          value={`${learning.average_score_percentage}%`}
          hint={`Across ${learning.total_attempts} completed attempt${learning.total_attempts === 1 ? '' : 's'}`}
        />
        <StatCard
          icon={Repeat}
          tone="emerald"
          label="Retake rate"
          value={`${learning.retake_rate}%`}
          hint={`${learning.students_with_retake} of ${learning.students_with_attempts} students retested`}
        />
        <StatCard
          icon={Users}
          tone="brand"
          label="Quiz participation"
          value={`${learning.quiz_participation_rate}%`}
          hint="Of all student accounts"
        />
        <StatCard
          icon={CalendarCheck}
          tone="emerald"
          label="Session completion"
          value={`${sessions.completion_rate}%`}
          hint={`${sessions.completed} of ${sessions.total} sessions`}
        />
      </div>

      {/* The core supply-vs-demand question: weak topics with thin tutor cover. */}
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Cohort topic gaps</h2>
            <p className="text-xs text-slate-400">
              Average score per topic across all students who attempted it, weakest first.
            </p>
          </div>
          <ShieldAlert size={16} className="shrink-0 text-slate-300" />
        </div>

        {gaps.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={BarChart3}
              title="No topic data yet"
              description="Once students complete quizzes, per-topic averages appear here."
            />
          </div>
        ) : (
          <>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gaps} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="topic" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-15} textAnchor="end" height={60} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    formatter={(value, _name, entry) => [
                      `${value}% across ${entry.payload.student_count} student${entry.payload.student_count === 1 ? '' : 's'}`,
                      entry.payload.module_code,
                    ]}
                  />
                  <Bar dataKey="average_percentage" radius={[4, 4, 0, 0]}>
                    {gaps.map((g) => (
                      <Cell key={`${g.module_id}-${g.topic}`} fill={gapColour(g.average_percentage)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 divide-y divide-slate-100">
              {gaps.map((g) => (
                <div key={`${g.module_id}-${g.topic}`} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{g.topic}</p>
                    <p className="text-xs text-slate-400">
                      {g.module_code} · {g.student_count} student{g.student_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-sm font-bold" style={{ color: gapColour(g.average_percentage) }}>
                        {g.average_percentage}%
                      </p>
                      <p className="text-[11px] text-slate-400">cohort average</p>
                    </div>
                    <div className="w-24">
                      <p
                        className={`text-sm font-bold ${
                          g.verified_tutor_count === 0 ? 'text-red-600' : 'text-slate-700'
                        }`}
                      >
                        {g.verified_tutor_count}
                      </p>
                      <p className="text-[11px] text-slate-400">verified tutors</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {gaps.some((g) => g.average_percentage < 60 && g.verified_tutor_count === 0) && (
              <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                Some weak topics have no verified tutor for their module. Students diagnosed with those gaps
                cannot be matched to anyone.
              </p>
            )}
          </>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700">Module demand</h2>
          <p className="text-xs text-slate-400">Bookings and sessions against verified tutor supply.</p>

          {demandData.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">No bookings or sessions recorded yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {demandData.map((m) => (
                <div key={m.module_id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{m.module_code}</p>
                    <p className="truncate text-xs text-slate-400">{m.module_name}</p>
                  </div>
                  <div className="flex shrink-0 gap-4 text-right text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{m.booking_count}</p>
                      <p className="text-slate-400">bookings</p>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">{m.session_count}</p>
                      <p className="text-slate-400">sessions</p>
                    </div>
                    <div>
                      <p className={`font-bold ${m.verified_tutor_count === 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {m.verified_tutor_count}
                      </p>
                      <p className="text-slate-400">tutors</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700">Booking funnel</h2>
          <p className="text-xs text-slate-400">
            {booking_funnel.acceptance_rate}% of requests were accepted or completed.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            {[
              { label: 'Pending', value: booking_funnel.pending, tone: 'text-amber-600' },
              { label: 'Accepted', value: booking_funnel.accepted, tone: 'text-emerald-600' },
              { label: 'Completed', value: booking_funnel.completed, tone: 'text-brand-600' },
              { label: 'Declined', value: booking_funnel.declined, tone: 'text-red-600' },
              { label: 'Cancelled', value: booking_funnel.cancelled, tone: 'text-slate-500' },
              { label: 'Total', value: booking_funnel.total, tone: 'text-slate-800' },
            ].map((b) => (
              <div key={b.label} className="rounded-lg bg-slate-50 p-3">
                <p className={`text-lg font-bold ${b.tone}`}>{b.value}</p>
                <p className="text-slate-400">{b.label}</p>
              </div>
            ))}
          </div>

          {booking_funnel.decline_reasons.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-500">Why tutors declined</p>
              <div className="mt-2 space-y-1">
                {booking_funnel.decline_reasons.map((r) => (
                  <div key={r.reason} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{r.reason}</span>
                    <span className="font-semibold text-slate-800">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700">Sessions</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            {[
              { label: 'Total', value: sessions.total },
              { label: 'Completed', value: sessions.completed },
              { label: 'Cancelled', value: sessions.cancelled },
              { label: 'Group sessions', value: sessions.group_sessions },
              { label: 'Tutoring hours', value: sessions.total_hours },
              { label: 'Avg duration', value: `${sessions.average_duration_minutes} min` },
              { label: 'Attendance verified', value: sessions.attendance_verified },
              { label: 'Pending lecturer approval', value: sessions.recognition_eligible },
            ].map((s) => (
              <div key={s.label} className="rounded-lg bg-slate-50 p-3">
                <p className="text-lg font-bold text-slate-800">{s.value}</p>
                <p className="text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700">Quality & conduct</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="flex items-center gap-1 text-lg font-bold text-amber-600">
                <Star size={15} className="fill-amber-400 text-amber-400" />
                {quality.average_rating || '—'}
              </p>
              <p className="text-slate-400">Average review rating</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-lg font-bold text-slate-800">{quality.review_count}</p>
              <p className="text-slate-400">Reviews submitted</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-lg font-bold text-slate-800">{quality.report_count}</p>
              <p className="text-slate-400">Reports filed</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className={`text-lg font-bold ${quality.open_reports > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {quality.open_reports}
              </p>
              <p className="text-slate-400">Reports still open</p>
            </div>
          </div>

          {quality.reports_by_category.length > 0 && (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <FileWarning size={12} /> Reports by category
              </p>
              <div className="mt-2 space-y-1">
                {quality.reports_by_category.map((c) => (
                  <div key={c.category} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{c.category}</span>
                    <span className="font-semibold text-slate-800">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
        <p>{notice}</p>
      </div>
    </div>
  );
}
