import { Link } from 'react-router-dom';
import {
  Calendar, Clock, MapPin, MonitorSmartphone, Users, GraduationCap, CheckCircle2, Loader2,
} from 'lucide-react';
import StarRating from './StarRating';
import StatusChip from './StatusChip';

/**
 * A browsable group session. Shows "N / M" occupancy exactly as the spec asks,
 * and the join control reflects the three server-side conditions: already
 * joined, full, or joinable.
 */
export default function GroupSessionCard({ session, onJoin, onLeave, busy, viewerRole }) {
  const {
    id, title, module: moduleRecord, topics, date, start_time, end_time,
    session_mode, location, tutor, participant_count, capacity, spots_left,
    is_full, has_joined, status,
  } = session;

  const isTutorView = viewerRole === 'Tutor';
  const occupancyTone = is_full
    ? 'bg-red-100 text-red-700'
    : spots_left <= 1
      ? 'bg-amber-100 text-amber-800'
      : 'bg-emerald-100 text-emerald-800';

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-brand-600">{moduleRecord?.module_code}</span>
            {status !== 'Upcoming' && <StatusChip status={status} />}
          </div>
          <p className="mt-0.5 font-semibold text-slate-800">{title}</p>
        </div>
        <span className={`chip shrink-0 text-[11px] ${occupancyTone}`}>
          <Users size={12} /> {participant_count} / {capacity}
        </span>
      </div>

      {topics?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {topics.map((t) => (
            <span key={t} className="chip bg-brand-50 text-brand-700 text-[11px]">{t}</span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1"><Calendar size={12} /> {date}</span>
        <span className="flex items-center gap-1"><Clock size={12} /> {start_time}–{end_time}</span>
        <span className="flex items-center gap-1">
          {session_mode === 'Online' ? <MonitorSmartphone size={12} /> : <MapPin size={12} />} {location}
        </span>
      </div>

      {tutor && !isTutorView && (
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
            {tutor.full_name?.[0] || 'T'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-700 truncate">{tutor.full_name}</p>
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <GraduationCap size={11} /> {tutor.course}
            </p>
          </div>
          <StarRating value={tutor.average_rating} size={12} />
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {isTutorView ? (
          <Link to={`/sessions/${id}`} className="btn-secondary flex-1 !py-2 text-sm">
            Manage Session
          </Link>
        ) : has_joined ? (
          <>
            <Link to={`/sessions/${id}`} className="btn-primary flex-1 !py-2 text-sm">
              <CheckCircle2 size={14} /> Open Session
            </Link>
            {status === 'Upcoming' && (
              <button onClick={() => onLeave?.(id)} disabled={busy === id}
                className="btn-secondary !py-2 text-sm">
                {busy === id ? <Loader2 size={14} className="animate-spin" /> : 'Leave'}
              </button>
            )}
          </>
        ) : is_full ? (
          <button disabled className="btn-secondary flex-1 !py-2 text-sm">Session full</button>
        ) : (
          <button onClick={() => onJoin?.(id)} disabled={busy === id}
            className="btn-primary flex-1 !py-2 text-sm">
            {busy === id ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
            {busy === id ? 'Joining…' : `Join · ${spots_left} spot${spots_left === 1 ? '' : 's'} left`}
          </button>
        )}
      </div>
    </div>
  );
}
