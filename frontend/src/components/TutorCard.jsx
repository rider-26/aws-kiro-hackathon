import { Link } from 'react-router-dom';
import { GraduationCap, MapPin, MonitorSmartphone, Users } from 'lucide-react';
import StarRating from './StarRating';
import VerifiedBadge from './VerifiedBadge';
import MatchScoreBadge from './MatchScoreBadge';

export default function TutorCard({ tutor }) {
  const { user, profile, verified_modules, topics, match } = tutor;

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 font-bold">
          {user?.full_name?.[0] || 'T'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800 truncate">{user?.full_name}</p>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <GraduationCap size={13} /> {user?.course} · Year {user?.year_of_study}
          </p>
          <div className="mt-1">
            <StarRating value={profile.average_rating} size={13} />
          </div>
        </div>
        {match && <MatchScoreBadge score={match.score} reasons={match.reasons} />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {verified_modules.slice(0, 2).map((m) => (
          <VerifiedBadge key={m.id} moduleCode={m.module_code} size="sm" />
        ))}
        {verified_modules.length === 0 && (
          <span className="chip bg-slate-100 text-slate-500 text-[11px]">Not yet verified</span>
        )}
      </div>

      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topics.slice(0, 4).map((t) => (
            <span key={t.id} className="chip bg-brand-50 text-brand-700 text-[11px]">{t.topic_name}</span>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500 line-clamp-2">{profile.bio || 'No bio yet.'}</p>

      <div className="flex items-center gap-3 text-[11px] text-slate-400">
        {profile.physical_enabled && <span className="flex items-center gap-1"><MapPin size={12} /> Physical</span>}
        {profile.online_enabled && <span className="flex items-center gap-1"><MonitorSmartphone size={12} /> Online</span>}
        <span className="flex items-center gap-1"><Users size={12} /> Max {profile.maximum_group_size}</span>
      </div>

      <div className="flex gap-2 pt-1">
        <Link to={`/tutors/${tutor.tutor_profile_id}`} className="btn-secondary flex-1 !py-2 text-sm">View Profile</Link>
        <Link to={`/tutors/${tutor.tutor_profile_id}`} className="btn-primary flex-1 !py-2 text-sm">Book</Link>
      </div>
    </div>
  );
}
