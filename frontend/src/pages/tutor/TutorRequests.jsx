import { useEffect, useState } from 'react';
import { Inbox, Calendar, Clock, MapPin, MonitorSmartphone, Users, MessageCircle } from 'lucide-react';
import { listBookings, acceptBooking, declineBooking, DECLINE_REASONS } from '../../api/bookings';
import StatusChip from '../../components/StatusChip';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';

export default function TutorRequests() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [decliningId, setDecliningId] = useState(null);
  const [declineReason, setDeclineReason] = useState(DECLINE_REASONS[0]);
  const [actionError, setActionError] = useState('');

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

  async function handleAccept(id) {
    setBusyId(id);
    setActionError('');
    try {
      await acceptBooking(id);
      await load();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not accept this request.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(id) {
    setBusyId(id);
    setActionError('');
    try {
      await declineBooking(id, declineReason);
      setDecliningId(null);
      await load();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not decline this request.');
    } finally {
      setBusyId(null);
    }
  }

  const pending = bookings.filter((b) => b.status === 'Pending');
  const resolved = bookings.filter((b) => b.status !== 'Pending');

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Booking Requests</h1>
        <p className="text-sm text-slate-500">Accept or decline incoming tutoring requests.</p>
      </div>

      {actionError && <ErrorState message={actionError} />}

      {loading ? (
        <p className="text-sm text-slate-400">Loading requests…</p>
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-600">Pending ({pending.length})</h2>
            {pending.length === 0 ? (
              <EmptyState icon={Inbox} title="No pending requests" description="New booking requests from students will appear here." />
            ) : pending.map((b) => (
              <div key={b.id} className="card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-800">{b.student?.full_name} · {b.module?.module_code}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Calendar size={12} /> {b.date}</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {b.start_time}–{b.end_time}</span>
                      <span className="flex items-center gap-1">
                        {b.session_mode === 'Online' ? <MonitorSmartphone size={12} /> : <MapPin size={12} />} {b.session_mode}
                      </span>
                      <span className="flex items-center gap-1"><Users size={12} /> {b.session_type}</span>
                    </div>
                  </div>
                  <StatusChip status={b.status} />
                </div>

                {b.topics?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {b.topics.map((t) => <span key={t} className="chip bg-brand-50 text-brand-700 text-[11px]">{t}</span>)}
                  </div>
                )}

                {b.student_message && (
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 flex gap-2">
                    <MessageCircle size={13} className="shrink-0 mt-0.5" />
                    {b.student_message}
                  </div>
                )}

                {decliningId === b.id ? (
                  <div className="space-y-2 rounded-lg bg-red-50 border border-red-100 p-3">
                    <label className="block text-xs font-medium text-red-800">Reason for declining</label>
                    <select value={declineReason} onChange={(e) => setDeclineReason(e.target.value)}
                      className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm outline-none">
                      {DECLINE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={() => setDecliningId(null)} className="btn-secondary !py-1.5 !px-3 text-xs flex-1">Back</button>
                      <button onClick={() => handleDecline(b.id)} disabled={busyId === b.id}
                        className="btn-danger !py-1.5 !px-3 text-xs flex-1">
                        {busyId === b.id ? 'Declining…' : 'Confirm Decline'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => handleAccept(b.id)} disabled={busyId === b.id}
                      className="btn-primary !py-1.5 !px-3 text-xs">
                      {busyId === b.id ? 'Accepting…' : 'Accept'}
                    </button>
                    <button onClick={() => { setDecliningId(b.id); setDeclineReason(DECLINE_REASONS[0]); }}
                      className="btn-secondary !py-1.5 !px-3 text-xs">Decline</button>
                  </div>
                )}
              </div>
            ))}
          </section>

          {resolved.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-600">Past requests</h2>
              <div className="card divide-y divide-slate-100 p-0">
                {resolved.map((b) => (
                  <div key={b.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{b.student?.full_name} · {b.module?.module_code}</p>
                      <p className="text-xs text-slate-400">{b.date} · {b.start_time}–{b.end_time}
                        {b.decline_reason ? ` · ${b.decline_reason}` : ''}</p>
                    </div>
                    <StatusChip status={b.status} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
