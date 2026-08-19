import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, ShieldAlert, ShieldX, Search, Star, GraduationCap, Loader2,
  Link as LinkIcon, Linkedin, RotateCcw, CalendarClock, Users, Ban,
} from 'lucide-react';
import {
  listVerifications, decideVerification, listTutors, reinstateUser,
} from '../../api/admin';
import StatusChip from '../../components/StatusChip.jsx';
import StarRating from '../../components/StarRating.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const FIELD =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none';

const STATUS_FILTERS = ['Pending', 'Verified', 'Rejected', 'Revoked'];

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Tutor verification (business rule 12) plus the tutor roster.
 *
 * This page is the ONLY place a tutor-module verification changes state, which
 * is what makes "verified tutor" meaningful: a tutor can request verification
 * but never grant it to themselves.
 */
export default function AdminTutors() {
  const [tab, setTab] = useState('verifications');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Tutors & Verification</h1>
        <p className="text-sm text-slate-500">
          Approve module verifications and review the tutor roster. Only verified tutor-module pairs are
          bookable by students.
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {[
          { key: 'verifications', label: 'Verification queue' },
          { key: 'roster', label: 'Tutor roster' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'verifications' ? <VerificationQueue /> : <TutorRoster />}
    </div>
  );
}

function VerificationQueue() {
  const [verifications, setVerifications] = useState([]);
  const [counts, setCounts] = useState(null);
  const [status, setStatus] = useState('Pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState('');
  const [actionError, setActionError] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listVerifications({ status: status || undefined });
      setVerifications(data.verifications);
      setCounts(data.counts);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the verification queue.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(verification, nextStatus) {
    setBusyId(`${verification.id}:${nextStatus}`);
    setActionError('');
    try {
      await decideVerification(verification.id, {
        status: nextStatus,
        admin_notes: notes[verification.id] || '',
      });
      setNotes((n) => ({ ...n, [verification.id]: '' }));
      await load();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not apply that decision.');
    } finally {
      setBusyId('');
      setConfirmRevoke(null);
    }
  }

  return (
    <div className="space-y-4">
      {counts && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Pending', value: counts.pending, tone: 'text-amber-600' },
            { label: 'Verified', value: counts.verified, tone: 'text-emerald-600' },
            { label: 'Rejected', value: counts.rejected, tone: 'text-red-600' },
            { label: 'Revoked', value: counts.revoked, tone: 'text-slate-500' },
          ].map((c) => (
            <div key={c.label} className="card py-4">
              <p className={`text-2xl font-bold ${c.tone}`}>{c.value}</p>
              <p className="text-xs text-slate-500">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatus('')}
          className={`chip ${status === '' ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
        >
          All
        </button>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`chip ${status === s ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {actionError && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</p>
      )}

      {loading && (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-white py-12 text-sm text-slate-400">
          <Loader2 size={16} className="mr-2 animate-spin" /> Loading requests…
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && verifications.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title={status ? `No ${status.toLowerCase()} requests` : 'No verification requests'}
          description={
            status === 'Pending'
              ? 'Every request has been reviewed. New ones appear here as tutors submit them.'
              : 'Try a different status filter.'
          }
        />
      )}

      {!loading &&
        !error &&
        verifications.map((v) => {
          const isPending = v.status === 'Pending';
          const isVerified = v.status === 'Verified';

          return (
            <div key={v.id} className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-slate-800">{v.tutor?.user?.full_name || 'Unknown tutor'}</p>
                    <StatusChip status={v.status} />
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    <GraduationCap size={12} /> {v.tutor?.user?.course || 'Course not set'}
                    {v.tutor?.user?.year_of_study ? ` · Year ${v.tutor.user.year_of_study}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-brand-700">{v.module?.module_code}</p>
                  <p className="text-xs text-slate-400">{v.module?.module_name}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-slate-400">Rating</p>
                  <p className="mt-0.5 font-semibold text-slate-700">
                    {v.tutor?.average_rating ? v.tutor.average_rating.toFixed(1) : 'No reviews'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Sessions done</p>
                  <p className="mt-0.5 font-semibold text-slate-700">{v.tutor?.completed_sessions ?? 0}</p>
                </div>
                <div>
                  <p className="text-slate-400">Requested</p>
                  <p className="mt-0.5 font-semibold text-slate-700">{formatDate(v.created_date)}</p>
                </div>
                <div>
                  <p className="text-slate-400">Decided</p>
                  <p className="mt-0.5 font-semibold text-slate-700">{formatDate(v.verified_date)}</p>
                </div>
              </div>

              {(v.tutor?.bio || v.tutor?.teaching_style) && (
                <div className="space-y-1 text-xs text-slate-600">
                  {v.tutor.bio && <p><span className="font-semibold text-slate-500">Bio:</span> {v.tutor.bio}</p>}
                  {v.tutor.teaching_style && (
                    <p><span className="font-semibold text-slate-500">Teaching style:</span> {v.tutor.teaching_style}</p>
                  )}
                </div>
              )}

              {(v.tutor?.portfolio_url || v.tutor?.linkedin_url) && (
                <div className="flex flex-wrap gap-3 text-xs">
                  {v.tutor.portfolio_url && (
                    <a href={v.tutor.portfolio_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-brand-600 hover:underline">
                      <LinkIcon size={12} /> Portfolio
                    </a>
                  )}
                  {v.tutor.linkedin_url && (
                    <a href={v.tutor.linkedin_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-brand-600 hover:underline">
                      <Linkedin size={12} /> LinkedIn
                    </a>
                  )}
                </div>
              )}

              {v.admin_notes && !isPending && (
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">Admin notes</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-600">{v.admin_notes}</p>
                </div>
              )}

              {(isPending || isVerified) && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label htmlFor={`notes-${v.id}`} className="block text-xs font-semibold text-slate-500">
                    Notes {isPending ? '(shown to the tutor if you reject)' : '(reason for revoking)'}
                  </label>
                  <textarea
                    id={`notes-${v.id}`}
                    rows={2}
                    value={notes[v.id] || ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [v.id]: e.target.value.slice(0, 1000) }))}
                    className={FIELD}
                    placeholder={
                      isPending
                        ? 'e.g. Transcript confirms a distinction in IT2513.'
                        : 'e.g. Verification revoked following a conduct review.'
                    }
                  />

                  <div className="flex flex-wrap gap-2">
                    {isPending && (
                      <>
                        <button
                          onClick={() => decide(v, 'Verified')}
                          disabled={!!busyId}
                          className="btn-primary"
                        >
                          {busyId === `${v.id}:Verified` ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <ShieldCheck size={14} />
                          )}
                          Approve
                        </button>
                        <button
                          onClick={() => decide(v, 'Rejected')}
                          disabled={!!busyId}
                          className="btn-secondary text-red-700 hover:bg-red-50"
                        >
                          {busyId === `${v.id}:Rejected` ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <ShieldX size={14} />
                          )}
                          Reject
                        </button>
                      </>
                    )}
                    {isVerified && (
                      <button onClick={() => setConfirmRevoke(v)} disabled={!!busyId} className="btn-danger">
                        <ShieldAlert size={14} /> Revoke verification
                      </button>
                    )}
                  </div>

                  {isVerified && (
                    <p className="text-[11px] text-slate-400">
                      Revoking removes this tutor from {v.module?.module_code} search results and stops them
                      accepting new bookings for it. Existing sessions are not cancelled.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

      <ConfirmDialog
        open={!!confirmRevoke}
        danger
        busy={!!busyId}
        title={`Revoke ${confirmRevoke?.module?.module_code} verification?`}
        message={`${confirmRevoke?.tutor?.user?.full_name || 'This tutor'} will stop appearing in search results for ${
          confirmRevoke?.module?.module_code || 'this module'
        } and can no longer accept new bookings for it. They will be notified. Existing sessions are not cancelled.`}
        confirmLabel="Revoke verification"
        onCancel={() => setConfirmRevoke(null)}
        onConfirm={() => decide(confirmRevoke, 'Revoked')}
      />
    </div>
  );
}

function TutorRoster() {
  const [tutors, setTutors] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async (term) => {
    setLoading(true);
    setError('');
    try {
      setTutors(await listTutors({ search: term || undefined }));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the tutor roster.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReinstate(tutor) {
    setBusyId(tutor.id);
    try {
      await reinstateUser(tutor.id);
      await load(search);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reinstate that account.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load(search);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className={`${FIELD} pl-9`}
            aria-label="Search tutors"
          />
        </div>
        <button type="submit" className="btn-secondary">Search</button>
      </form>

      {loading && (
        <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-white py-12 text-sm text-slate-400">
          <Loader2 size={16} className="mr-2 animate-spin" /> Loading tutors…
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={() => load(search)} />}

      {!loading && !error && tutors.length === 0 && (
        <EmptyState
          icon={Users}
          title={search ? 'No tutors match that search' : 'No tutor accounts yet'}
          description={search ? 'Try a different name or email.' : 'Seeded tutor accounts will appear here.'}
        />
      )}

      {!loading &&
        !error &&
        tutors.map((t) => (
          <div key={t.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-slate-800">{t.full_name}</p>
                  {t.account_status === 'Suspended' && <StatusChip status="Suspended" />}
                  {!t.has_profile && (
                    <span className="chip bg-amber-100 text-amber-800">Profile not set up</span>
                  )}
                </div>
                <p className="break-all text-xs text-slate-500">{t.email}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                  <GraduationCap size={12} /> {t.course || 'Course not set'}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {t.average_rating > 0 ? (
                  <div className="text-right">
                    <StarRating value={t.average_rating} size={13} />
                    <p className="text-[11px] text-slate-400">{t.review_count} review{t.review_count === 1 ? '' : 's'}</p>
                  </div>
                ) : (
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <Star size={12} /> No reviews
                  </p>
                )}
                {t.tutor_profile_id && (
                  <Link to={`/tutors/${t.tutor_profile_id}`} className="btn-secondary !py-1.5 !px-3 text-xs">
                    View profile
                  </Link>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-4">
              <div>
                <p className="text-slate-400">Verified modules</p>
                <p className="mt-0.5 font-semibold text-slate-700">{t.verified_module_count}</p>
              </div>
              <div>
                <p className="text-slate-400">Pending requests</p>
                <p className={`mt-0.5 font-semibold ${t.pending_verification_count > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                  {t.pending_verification_count}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Completed</p>
                <p className="mt-0.5 font-semibold text-slate-700">{t.completed_sessions}</p>
              </div>
              <div>
                <p className="text-slate-400 flex items-center gap-1"><CalendarClock size={11} /> Upcoming</p>
                <p className="mt-0.5 font-semibold text-slate-700">{t.upcoming_sessions}</p>
              </div>
            </div>

            {t.verified_modules.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.verified_modules.map((m) => (
                  <span key={m.id} className="chip bg-emerald-50 text-emerald-700">
                    <ShieldCheck size={11} /> {m.module_code}
                  </span>
                ))}
              </div>
            )}

            {t.verified_module_count === 0 && t.has_profile && (
              <p className="mt-3 text-[11px] text-slate-400">
                Not verified for any module yet, so this tutor does not appear in student search results.
              </p>
            )}

            {t.account_status === 'Suspended' && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50 p-3">
                <p className="flex items-center gap-1.5 text-xs text-red-700">
                  <Ban size={13} /> Suspended — blocked from signing in.
                </p>
                <button
                  onClick={() => handleReinstate(t)}
                  disabled={busyId === t.id}
                  className="btn-secondary !py-1.5 !px-3 text-xs"
                >
                  {busyId === t.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                  Reinstate
                </button>
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
