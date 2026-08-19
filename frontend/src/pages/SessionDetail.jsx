import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Calendar, Clock, MapPin, MonitorSmartphone, Users, ArrowLeft, GraduationCap, Flag,
} from 'lucide-react';
import { getSession } from '../api/sessions';
import SessionChatPanel from '../components/SessionChatPanel';
import AttendancePanel from '../components/AttendancePanel';
import ReviewForm from '../components/ReviewForm';
import LearningSummaryCard from '../components/LearningSummaryCard';
import ReportModal from '../components/ReportModal';
import StatusChip from '../components/StatusChip';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext.jsx';

export default function SessionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Who this user is currently filing a report against, if any.
  const [reportTarget, setReportTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSession(await getSession(id));
    } catch (err) {
      setError(err.response?.status === 403
        ? 'You do not have access to this session.'
        : 'Could not load this session.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-slate-400">Loading session…</p>;
  if (error || !session) return <ErrorState message={error} onRetry={load} />;

  const backLink = user?.role === 'Tutor' ? '/tutor/sessions' : '/bookings';
  const chatClosed = session.status === 'Cancelled';

  // A tutee can report the tutor; a tutor can report any participant. Nobody
  // sees a button to report themselves.
  const reportTargets =
    user?.role === 'Tutor'
      ? (session.participants || [])
          .map((p) => p.user)
          .filter((u) => u && u.id !== user.id)
      : session.tutor?.user && session.tutor.user.id !== user?.id
        ? [session.tutor.user]
        : [];

  return (
    <div className="max-w-4xl space-y-5">
      <Link to={backLink} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> Back
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-brand-600">{session.module?.module_code}</p>
            <h1 className="text-lg font-bold text-slate-800">{session.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Calendar size={13} /> {session.date}</span>
              <span className="flex items-center gap-1"><Clock size={13} /> {session.start_time}–{session.end_time}</span>
              <span className="flex items-center gap-1">
                {session.session_mode === 'Online' ? <MonitorSmartphone size={13} /> : <MapPin size={13} />} {session.location}
              </span>
              <span className="flex items-center gap-1">
                <Users size={13} /> {session.participant_count}
                {session.maximum_students > 1 ? ` / ${session.maximum_students}` : ''}
              </span>
            </div>
          </div>
          <StatusChip status={session.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="space-y-5">
          <SessionChatPanel
            sessionId={session.id}
            disabled={chatClosed}
            disabledReason="This session was cancelled, so its chat is closed."
          />

          {/* Reviews are only relevant to students, and only after completion. */}
          {user?.role === 'Tutee' && session.status === 'Completed' && (
            <ReviewForm sessionId={session.id} onSubmitted={load} />
          )}

          {/* Tutors see each participant's learning summary only if shared. */}
          {user?.role === 'Tutor' && session.participants.map((p) => (
            <LearningSummaryCard
              key={p.id}
              studentId={p.student_id}
              studentName={p.user?.full_name}
            />
          ))}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Tutor</h2>
            {session.tutor ? (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 font-semibold">
                  {session.tutor.user?.full_name?.[0] || 'T'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{session.tutor.user?.full_name}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <GraduationCap size={12} /> {session.tutor.user?.course}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Tutor details unavailable.</p>
            )}
          </div>

          {/* Attendance owns the participant roster, so it isn't duplicated above. */}
          <AttendancePanel sessionId={session.id} onSessionChange={load} />

          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-xs text-slate-500">
            <p className="font-semibold text-slate-600 mb-1">Academic Integrity</p>
            Tutors explain concepts and guide you. They must not complete graded work or provide
            answers to active assessments.
            <Link to="/academic-integrity" className="mt-1.5 block font-medium text-brand-700 hover:underline">
              Read the full notice
            </Link>
          </div>

          {/* Either party in a session can report the other (spec section 25). */}
          {reportTargets.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-slate-700">Report a concern</h2>
              <p className="mt-1 text-xs text-slate-500">
                Conduct or academic integrity issues go to a PeerLink administrator for review.
              </p>
              <div className="mt-3 space-y-2">
                {reportTargets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setReportTarget(t)}
                    className="btn-secondary w-full !justify-start text-red-700 hover:bg-red-50"
                  >
                    <Flag size={14} /> Report {t.full_name}
                  </button>
                ))}
              </div>
              <Link to="/reports" className="mt-3 inline-block text-xs text-brand-700 hover:underline">
                View reports I&apos;ve filed
              </Link>
            </div>
          )}
        </div>
      </div>

      <ReportModal
        open={!!reportTarget}
        reportedUser={reportTarget}
        sessionId={session.id}
        onClose={() => setReportTarget(null)}
        onSubmitted={() => {}}
      />
    </div>
  );
}
