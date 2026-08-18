import { useEffect, useState, useCallback } from 'react';
import {
  PlayCircle, StopCircle, QrCode, ScanLine, CheckCircle2, Clock, Users,
  ShieldCheck, ShieldAlert, Loader2, FlaskConical,
} from 'lucide-react';
import {
  getAttendance, startSession, endSession, checkIn, confirmCompletion,
} from '../api/sessions';
import { useRealtime } from '../context/RealtimeContext.jsx';
import RecognitionEligibilityCard from './RecognitionEligibilityCard';
import ErrorState from './ErrorState';

/**
 * Attendance panel (spec section 21).
 *
 * The check-in code is real and verified server-side; the QR rendering is a
 * labelled placeholder rather than a scanner integration, and the panel says so
 * plainly. No claim is made about NYP infrastructure (business rule 15).
 */
export default function AttendancePanel({ sessionId, onSessionChange }) {
  const { subscribe } = useRealtime();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [liveToken, setLiveToken] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAttendance(sessionId));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load attendance.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // Live session state changes so both sides stay in step without refreshing.
  useEffect(() => subscribe((payload) => {
    if (payload.session_id !== sessionId) return;
    if (payload.type === 'session_started') {
      if (payload.check_in_token) setLiveToken(payload.check_in_token);
      load();
    }
    if (payload.type === 'session_ended' || payload.type === 'participant_checked_in') {
      load();
    }
  }), [subscribe, sessionId, load]);

  async function run(action, fn) {
    setBusy(action);
    setError(null);
    try {
      await fn();
      await load();
      onSessionChange?.();
    } catch (err) {
      setError(err.response?.data?.message || 'That action could not be completed.');
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <div className="card">
        <p className="text-sm text-slate-400 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading attendance…
        </p>
      </div>
    );
  }

  if (!data) return <ErrorState message={error} onRetry={load} />;

  const {
    session, is_tutor, check_in_token, duration_minutes,
    attendance_verified, own_participant, recognition,
  } = data;

  const status = session.status;
  const token = check_in_token || liveToken;
  const checkedInCount = session.participants.filter((p) => p.check_in_time).length;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <ScanLine size={16} /> Attendance
          </h2>
          <span className={`chip text-[10px] ${
            attendance_verified ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
          }`}>
            {attendance_verified
              ? <><ShieldCheck size={11} /> Verified Attendance</>
              : <><ShieldAlert size={11} /> Not Verified</>}
          </span>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <Stat icon={Clock} label="Duration" value={duration_minutes ? `${duration_minutes} min` : '—'} />
          <Stat icon={Users} label="Checked in" value={`${checkedInCount}/${session.participants.length}`} />
          <Stat icon={CheckCircle2} label="Status" value={status} />
        </div>

        {/* Tutor controls */}
        {is_tutor && (
          <div className="space-y-3">
            {status === 'Upcoming' && (
              <button onClick={() => run('start', () => startSession(sessionId))}
                disabled={busy === 'start'} className="btn-primary w-full">
                {busy === 'start' ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={16} />}
                Start Session
              </button>
            )}

            {status === 'In Progress' && (
              <>
                {token && <CheckInCodeDisplay token={token} />}
                <button onClick={() => run('end', () => endSession(sessionId))}
                  disabled={busy === 'end'} className="btn-danger w-full">
                  {busy === 'end' ? <Loader2 size={15} className="animate-spin" /> : <StopCircle size={16} />}
                  End Session
                </button>
              </>
            )}

            {status === 'Completed' && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Session ended. Attendance is verified once a checked-in student confirms completion.
              </p>
            )}
          </div>
        )}

        {/* Student controls */}
        {!is_tutor && own_participant && (
          <div className="space-y-3">
            {status === 'Upcoming' && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                Your tutor will start the session and share a check-in code.
              </p>
            )}

            {status === 'In Progress' && !own_participant.check_in_time && (
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600">
                  Enter the check-in code shown by your tutor
                </label>
                <div className="flex gap-2">
                  <input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. A1B2C3"
                    maxLength={6}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tracking-widest uppercase focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                  <button onClick={() => run('checkin', () => checkIn(sessionId, codeInput))}
                    disabled={busy === 'checkin' || codeInput.length < 4} className="btn-primary">
                    {busy === 'checkin' ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
                    Check In
                  </button>
                </div>
                {liveToken && (
                  <button onClick={() => run('checkin', () => checkIn(sessionId, liveToken))}
                    className="text-xs text-brand-600 hover:underline">
                    Simulate QR scan with the code from this session
                  </button>
                )}
              </div>
            )}

            {own_participant.check_in_time && !own_participant.completion_confirmed && status === 'In Progress' && (
              <p className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 size={13} /> You are checked in. Waiting for the tutor to end the session.
              </p>
            )}

            {own_participant.check_in_time && !own_participant.completion_confirmed && status === 'Completed' && (
              <button onClick={() => run('confirm', () => confirmCompletion(sessionId))}
                disabled={busy === 'confirm'} className="btn-primary w-full">
                {busy === 'confirm' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Confirm Session Completed
              </button>
            )}

            {own_participant.completion_confirmed && (
              <p className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2">
                <ShieldCheck size={13} /> Attendance confirmed. Thanks!
              </p>
            )}

            {status === 'Completed' && !own_participant.check_in_time && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                You were not checked in for this session, so attendance could not be recorded.
              </p>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        {/* Participant roster with attendance state */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-600 mb-2">Participants</p>
          <div className="space-y-1.5">
            {session.participants.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-600 truncate">{p.user?.full_name || 'Student'}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.check_in_time && (
                    <span className="text-[10px] text-slate-400">
                      {new Date(p.check_in_time).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  <span className={`chip text-[10px] ${
                    p.attendance_status === 'Attended' ? 'bg-emerald-100 text-emerald-800'
                    : p.attendance_status === 'Checked In' ? 'bg-blue-100 text-blue-700'
                    : p.attendance_status === 'Absent' ? 'bg-red-100 text-red-700'
                    : 'bg-slate-100 text-slate-500'
                  }`}>
                    {p.attendance_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <RecognitionEligibilityCard recognition={recognition} />
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
      <Icon size={14} className="mx-auto text-slate-400" />
      <p className="mt-1 text-xs font-semibold text-slate-700 truncate">{value}</p>
      <p className="text-[10px] text-slate-400">{label}</p>
    </div>
  );
}

/**
 * Renders the check-in code as a QR-style placeholder. Explicitly labelled
 * simulated — there is no scanner integration behind it.
 */
function CheckInCodeDisplay({ token }) {
  // Deterministic pattern derived from the token so it looks like a real code
  // without pretending to be a scannable QR.
  const cells = [];
  for (let i = 0; i < 49; i += 1) {
    const charCode = token.charCodeAt(i % token.length);
    cells.push((charCode + i * 7) % 3 !== 0);
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4 text-center">
      <div className="mx-auto grid w-fit grid-cols-7 gap-0.5 mb-3">
        {cells.map((filled, i) => (
          <span key={i} className={`h-3 w-3 rounded-[2px] ${filled ? 'bg-slate-800' : 'bg-slate-100'}`} />
        ))}
      </div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">Check-in code</p>
      <p className="font-mono text-xl font-bold tracking-[0.3em] text-slate-800">{token}</p>
      <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-amber-700">
        <FlaskConical size={10} /> Simulated QR — students enter this code to check in
      </p>
    </div>
  );
}
