import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  GraduationCap, Clock, Users, Award, Link as LinkIcon, Linkedin,
  MonitorSmartphone, MapPin, BookOpen, Bookmark, BookmarkCheck, Flag,
} from 'lucide-react';
import { getTutor } from '../api/tutors';
import { listSavedTutorIds, saveTutor, unsaveTutor } from '../api/users';
import StarRating from '../components/StarRating';
import VerifiedBadge from '../components/VerifiedBadge';
import ErrorState from '../components/ErrorState';
import BookingForm from '../components/BookingForm';
import ReviewsList from '../components/ReviewsList';
import ReportModal from '../components/ReportModal';

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function sortAvailability(slots) {
  return [...slots].sort((a, b) => DAY_ORDER.indexOf(a.day_or_date) - DAY_ORDER.indexOf(b.day_or_date));
}

export default function TutorProfile() {
  const { id } = useParams();
  const [tutor, setTutor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [booking, setBooking] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [savingTutor, setSavingTutor] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const data = await getTutor(id);
      setTutor(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Saved state is tracked separately so a failure here never blocks the profile.
    listSavedTutorIds()
      .then((ids) => setIsSaved(ids.includes(id)))
      .catch(() => setIsSaved(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleToggleSave() {
    setSavingTutor(true);
    const next = !isSaved;
    setIsSaved(next); // optimistic
    try {
      if (next) await saveTutor(id);
      else await unsaveTutor(id);
    } catch {
      setIsSaved(!next); // roll back
    } finally {
      setSavingTutor(false);
    }
  }

  if (loading) return <div className="text-slate-400 text-sm">Loading tutor profile…</div>;
  if (error || !tutor) return <ErrorState message="Could not load this tutor's profile." onRetry={load} />;

  const { user, profile, verified_modules, topics, availability } = tutor;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 text-2xl font-bold">
            {user?.full_name?.[0] || 'T'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800">{user?.full_name}</h1>
            </div>
            <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
              <GraduationCap size={15} /> {user?.course} · Year {user?.year_of_study}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {verified_modules.length === 0 && (
                <span className="chip bg-slate-100 text-slate-500">No verified modules yet</span>
              )}
              {verified_modules.map((m) => (
                <VerifiedBadge key={m.id} moduleCode={m.module_code} />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4">
              <StarRating value={profile.average_rating} />
              <span className="text-sm text-slate-400">·</span>
              <span className="text-sm text-slate-500">{profile.completed_sessions} sessions completed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Award} label="Rating" value={profile.average_rating ? profile.average_rating.toFixed(1) : 'New'} />
        <StatCard icon={BookOpen} label="Sessions" value={profile.completed_sessions} />
        <StatCard icon={Users} label="Students Helped" value={profile.students_helped} />
        <StatCard icon={Clock} label="Tutoring Hours" value={Math.round(profile.total_tutoring_minutes / 60)} />
      </div>

      {/* Bio & teaching style */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-1">About</h2>
          <p className="text-sm text-slate-600">{profile.bio || 'This tutor has not added a bio yet.'}</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Teaching Style</h2>
          <p className="text-sm text-slate-600">{profile.teaching_style || 'Not specified.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {profile.physical_enabled && (
            <span className="chip bg-slate-100 text-slate-600"><MapPin size={12} /> Physical sessions</span>
          )}
          {profile.online_enabled && (
            <span className="chip bg-slate-100 text-slate-600"><MonitorSmartphone size={12} /> Online sessions</span>
          )}
          <span className="chip bg-slate-100 text-slate-600"><Users size={12} /> Max group size {profile.maximum_group_size}</span>
        </div>
      </div>

      {/* Specialisations */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Specialisations</h2>
        {topics.length === 0 ? (
          <p className="text-sm text-slate-400">No topics listed yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <span key={t.id} className="chip bg-brand-50 text-brand-700">{t.topic_name}</span>
            ))}
          </div>
        )}
      </div>

      {/* Availability */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Availability</h2>
        {availability.length === 0 ? (
          <p className="text-sm text-slate-400">No availability set yet.</p>
        ) : (
          <div className="space-y-2">
            {sortAvailability(availability).map((slot) => (
              <div key={slot.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-700">{slot.day_or_date}</span>
                <span className="text-slate-500">{slot.start_time} – {slot.end_time}</span>
                <span className="chip bg-white border border-slate-200 text-slate-500">{slot.session_mode}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reviews */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Reviews {tutor.reviews?.length > 0 && <span className="text-slate-400">({tutor.reviews.length})</span>}
        </h2>
        <ReviewsList reviews={tutor.reviews} />
      </div>

      {/* Links + actions */}
      <div className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex gap-4 text-sm">
          {profile.portfolio_url && (
            <a href={profile.portfolio_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-brand-600 hover:underline">
              <LinkIcon size={14} /> Portfolio
            </a>
          )}
          {profile.linkedin_url && (
            <a href={profile.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-brand-600 hover:underline">
              <Linkedin size={14} /> LinkedIn
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={handleToggleSave} disabled={savingTutor}
            className={isSaved ? 'btn-primary' : 'btn-secondary'}>
            {isSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
            {isSaved ? 'Saved' : 'Save'}
          </button>
          <button className="btn-primary" onClick={() => setBooking(true)}>Book Session</button>
          <button
            onClick={() => setReporting(true)}
            className="btn-secondary text-red-700 hover:bg-red-50"
            title="Report this tutor to an administrator"
          >
            <Flag size={15} /> Report
          </button>
        </div>
      </div>

      {booking && <BookingForm tutor={tutor} onCancel={() => setBooking(false)} />}

      <ReportModal
        open={reporting}
        reportedUser={tutor.user}
        onClose={() => setReporting(false)}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="card flex items-center gap-3 py-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-sm font-bold text-slate-800 leading-tight">{value}</p>
        <p className="text-[11px] text-slate-400 leading-tight">{label}</p>
      </div>
    </div>
  );
}
