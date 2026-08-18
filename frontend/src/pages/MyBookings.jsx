import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Calendar, Clock, MapPin, MonitorSmartphone, MessageSquare, Users } from 'lucide-react';
import { listBookings, cancelBooking, getAlternatives } from '../api/bookings';
import StatusChip from '../components/StatusChip';
import TutorCard from '../components/TutorCard';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [alternatives, setAlternatives] = useState({});
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      setBookings(await listBookings());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCancel(id) {
    setBusyId(id);
    try {
      await cancelBooking(id);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not cancel this booking.');
    } finally {
      setBusyId(null);
    }
  }

  async function showAlternatives(id) {
    setBusyId(id);
    try {
      const tutors = await getAlternatives(id);
      setAlternatives((prev) => ({ ...prev, [id]: tutors }));
    } catch {
      setAlternatives((prev) => ({ ...prev, [id]: [] }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">My Bookings</h1>
        <p className="text-sm text-slate-500">Track your tutoring requests and confirmed sessions.</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading bookings…</p>
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No bookings yet"
          description="Find a verified tutor and submit your first session request."
          action={<Link to="/find-tutors" className="btn-primary">Find Tutors</Link>}
        />
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div key={b.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">
                    {b.module?.module_code} — {b.tutor?.user?.full_name || 'Tutor'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {b.date}</span>
                    <span className="flex items-center gap-1"><Clock size={12} /> {b.start_time}–{b.end_time}</span>
                    <span className="flex items-center gap-1">
                      {b.session_mode === 'Online' ? <MonitorSmartphone size={12} /> : <MapPin size={12} />} {b.session_mode}
                    </span>
                    <span className="flex items-center gap-1"><Users size={12} /> {b.session_type}</span>
                  </div>
                </div>
                <StatusChip status={b.status === 'Accepted' ? 'Confirmed' : b.status} />
              </div>

              {b.topics?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {b.topics.map((t) => <span key={t} className="chip bg-brand-50 text-brand-700 text-[11px]">{t}</span>)}
                </div>
              )}

              {b.status === 'Declined' && b.decline_reason && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                  Declined — {b.decline_reason}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {b.status === 'Accepted' && b.session && (
                  <Link to={`/sessions/${b.session.id}`} className="btn-primary !py-1.5 !px-3 text-xs">
                    <MessageSquare size={13} /> Open Session
                  </Link>
                )}
                {['Pending', 'Accepted'].includes(b.status) && (
                  <button onClick={() => handleCancel(b.id)} disabled={busyId === b.id}
                    className="btn-secondary !py-1.5 !px-3 text-xs">
                    {busyId === b.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
                {b.status === 'Declined' && !alternatives[b.id] && (
                  <button onClick={() => showAlternatives(b.id)} disabled={busyId === b.id}
                    className="btn-secondary !py-1.5 !px-3 text-xs">
                    {busyId === b.id ? 'Finding…' : 'See alternative tutors'}
                  </button>
                )}
              </div>

              {alternatives[b.id] && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-600 mb-2">
                    Alternative tutors for {b.module?.module_code}
                  </p>
                  {alternatives[b.id].length === 0 ? (
                    <p className="text-xs text-slate-400">No other verified tutors available for this module right now.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {alternatives[b.id].slice(0, 4).map((t) => (
                        <TutorCard key={t.tutor_profile_id} tutor={t} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
