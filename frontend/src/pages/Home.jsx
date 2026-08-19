import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Calendar, Clock, MapPin, MonitorSmartphone, AlertTriangle,
  Search, ArrowRight, TrendingUp, GraduationCap, Users, BookOpen,
} from 'lucide-react';
import { getDashboard } from '../api/dashboard';
import { useAuth } from '../context/AuthContext.jsx';
import ImprovementBanner from '../components/ImprovementBanner';
import MatchScoreBadge from '../components/MatchScoreBadge';
import StarRating from '../components/StarRating';
import VerifiedBadge from '../components/VerifiedBadge';
import StatusChip from '../components/StatusChip';
import ErrorState from '../components/ErrorState';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Tutee home dashboard (spec section 8): greeting, upcoming session, latest and
 * previous quiz with the improvement delta, weak topics, and a recommended
 * tutor with a match score.
 */
export default function Home() {
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

  const {
    next_session, latest_attempt, previous_attempt, improvement_delta,
    weak_topics, recommended_tutor, attempt_count, pending_booking_count,
  } = data;

  const firstName = (user?.full_name || '').split(' ')[0] || 'there';
  const weakModuleId = weak_topics[0]?.module_id;

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{greeting()}, {firstName}</h1>
        <p className="text-sm text-slate-500">
          {weak_topics.length > 0
            ? `You have ${weak_topics.length} topic${weak_topics.length === 1 ? '' : 's'} to work on.`
            : attempt_count > 0
              ? 'No weak topics right now. Nice work.'
              : 'Take your first AI quiz to find out what to focus on.'}
        </p>
      </div>

      {/* Upcoming session */}
      {next_session ? (
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-brand-600">Next session</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">
                {next_session.module?.module_code} — {next_session.tutor?.user?.full_name}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Calendar size={12} /> {next_session.date}</span>
                <span className="flex items-center gap-1"><Clock size={12} /> {next_session.start_time}–{next_session.end_time}</span>
                <span className="flex items-center gap-1">
                  {next_session.session_mode === 'Online' ? <MonitorSmartphone size={12} /> : <MapPin size={12} />}
                  {next_session.location}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusChip status={next_session.status} />
              <Link to={`/sessions/${next_session.id}`} className="btn-primary !py-1.5 !px-3 text-xs">
                Open Session
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="text-sm font-semibold text-slate-800">No upcoming sessions</p>
          <p className="mt-1 text-sm text-slate-600">
            {pending_booking_count > 0
              ? `You have ${pending_booking_count} booking request awaiting a tutor's response.`
              : 'Book a verified tutor to get help with your weak topics.'}
          </p>
          <Link to="/find-tutors" className="btn-secondary mt-3">
            <Search size={15} /> Find Tutors
          </Link>
        </div>
      )}

      {/* Learning improvement */}
      {latest_attempt ? (
        <ImprovementBanner
          latest={latest_attempt}
          previous={previous_attempt}
          delta={improvement_delta}
        />
      ) : (
        <div className="card border-brand-200 bg-brand-50/40">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Sparkles size={16} className="text-brand-600" /> Start with an AI quiz
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Upload study material or use the sample Topic 05 PDF, then take a quiz to find your weak topics.
          </p>
          <Link to="/ai-study" className="btn-primary mt-3">
            <Sparkles size={15} /> Open AI Study
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Weak topics */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-500" /> Weak Topics
          </h2>
          {weak_topics.length === 0 ? (
            <p className="text-sm text-slate-400">
              {attempt_count > 0 ? 'Nothing below 60% right now.' : 'Take a quiz to identify weak topics.'}
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {weak_topics.map((t) => (
                  <div key={t.id || t.topic} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-700 truncate">{t.topic}</span>
                    <span className="chip bg-red-100 text-red-700 text-[10px] shrink-0">
                      {t.score_percentage}%
                    </span>
                  </div>
                ))}
              </div>
              <Link
                to={`/find-tutors?${new URLSearchParams({
                  ...(weakModuleId ? { moduleId: weakModuleId } : {}),
                  weakTopics: weak_topics.map((t) => t.topic).join(','),
                }).toString()}`}
                className="btn-primary w-full mt-4 !py-2 text-sm"
              >
                <Search size={14} /> Find a Tutor <ArrowRight size={14} />
              </Link>
            </>
          )}
        </div>

        {/* Recommended tutor */}
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <TrendingUp size={15} className="text-brand-600" /> Recommended Tutor
          </h2>
          {!recommended_tutor ? (
            <p className="text-sm text-slate-400">
              Take a quiz first — recommendations are matched to your weak topics.
            </p>
          ) : (
            <div>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 font-bold">
                  {recommended_tutor.user?.full_name?.[0] || 'T'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {recommended_tutor.user?.full_name}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <GraduationCap size={12} /> {recommended_tutor.user?.course}
                  </p>
                  <div className="mt-1">
                    <StarRating value={recommended_tutor.profile?.average_rating} size={13} />
                  </div>
                </div>
                <MatchScoreBadge score={recommended_tutor.match.score} reasons={recommended_tutor.match.reasons} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {recommended_tutor.verified_modules.slice(0, 2).map((m) => (
                  <VerifiedBadge key={m.id} moduleCode={m.module_code} size="sm" />
                ))}
              </div>

              {recommended_tutor.match.reasons.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {recommended_tutor.match.reasons.slice(0, 3).map((reason, i) => (
                    <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5">
                      <span className="mt-1 h-1 w-1 rounded-full bg-brand-400 shrink-0" />
                      {reason}
                    </li>
                  ))}
                </ul>
              )}

              <Link to={`/tutors/${recommended_tutor.tutor_profile_id}`}
                className="btn-secondary w-full mt-4 !py-2 text-sm">
                View Profile
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickLink to="/ai-study" icon={Sparkles} label="AI Study" />
        <QuickLink to="/find-tutors" icon={Search} label="Find Tutors" />
        <QuickLink to="/group-sessions" icon={Users} label="Group Sessions" />
        <QuickLink to="/progress" icon={BookOpen} label="Progress" />
      </div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label }) {
  return (
    <Link to={to} className="card flex flex-col items-center gap-2 py-4 hover:border-brand-300 transition-colors">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon size={17} />
      </span>
      <span className="text-xs font-medium text-slate-700">{label}</span>
    </Link>
  );
}
