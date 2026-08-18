import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  UserRound, Save, Shield, Bookmark, Loader2, Info, Search, Trash2, ShieldCheck,
} from 'lucide-react';
import {
  getOwnProfile, updateOwnProfile, getSharingState, listSavedTutors, unsaveTutor,
} from '../api/users';
import { useAuth } from '../context/AuthContext.jsx';
import StarRating from '../components/StarRating';
import VerifiedBadge from '../components/VerifiedBadge';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

export default function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({ full_name: '', course: '', year_of_study: '' });
  const [sharing, setSharing] = useState(null);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [togglingShare, setTogglingShare] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const [profile, sharingState, savedList] = await Promise.all([
        getOwnProfile(),
        getSharingState(),
        listSavedTutors(),
      ]);
      setForm({
        full_name: profile.full_name || '',
        course: profile.course || '',
        year_of_study: profile.year_of_study || '',
      });
      setSharing(sharingState);
      setSaved(savedList);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    setSavedMsg('');
    try {
      const updated = await updateOwnProfile(form);
      setSavedMsg('Profile saved.');
      // Keep the shell's displayed name in step with the edit.
      setUser((prev) => (prev ? { ...prev, full_name: updated.full_name } : prev));
      localStorage.setItem('peerlink_user', JSON.stringify({ ...user, full_name: updated.full_name }));
    } catch {
      setSavedMsg('Could not save your profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleToggleSharing(next) {
    setTogglingShare(true);
    try {
      await updateOwnProfile({ share_learning_summary: next });
      setSharing((s) => ({ ...s, share_learning_summary: next }));
    } catch {
      // Leave the toggle where it was; the state is re-read on next load.
    } finally {
      setTogglingShare(false);
    }
  }

  async function handleUnsave(tutorId) {
    setRemovingId(tutorId);
    try {
      await unsaveTutor(tutorId);
      setSaved((prev) => prev.filter((t) => t.tutor_profile_id !== tutorId));
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading your profile…</p>;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Profile</h1>
        <p className="text-sm text-slate-500">Manage your details, privacy and saved tutors.</p>
      </div>

      {/* Details */}
      <form onSubmit={handleSaveProfile} className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <UserRound size={16} /> Your Details
        </h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
          <input required value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Course</label>
            <input value={form.course}
              onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Year of study</label>
            <input value={form.year_of_study}
              onChange={(e) => setForm((f) => ({ ...f, year_of_study: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input value={user?.email || ''} disabled
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
          <p className="mt-1 text-xs text-slate-400">Your email is fixed to your account.</p>
        </div>

        {savedMsg && (
          <p className={`text-sm ${savedMsg.startsWith('Could not') ? 'text-red-600' : 'text-emerald-700'}`}>
            {savedMsg}
          </p>
        )}

        <button type="submit" disabled={savingProfile} className="btn-primary">
          {savingProfile ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {savingProfile ? 'Saving…' : 'Save Changes'}
        </button>
      </form>

      {/* Privacy — learning summary sharing */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Shield size={16} /> Privacy
        </h2>

        <label className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-3 cursor-pointer">
          <input type="checkbox"
            checked={!!sharing?.share_learning_summary}
            disabled={togglingShare}
            onChange={(e) => handleToggleSharing(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-700">
              Share Learning Summary With Tutor
            </span>
            <span className="block text-xs text-slate-500 mt-0.5">
              Lets tutors you have booked see your latest quiz score, weak topics, strong topics and a
              suggested session focus — so they can prepare. Off by default.
            </span>
          </span>
        </label>

        <div className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <Info size={13} className="text-slate-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500">
            Tutors never see your individual answers, uploaded files, or results for modules you have
            not booked them for. You can switch this off at any time and access is revoked immediately.
          </p>
        </div>

        {sharing?.share_learning_summary && sharing.shared_with?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1.5">
              Currently visible to {sharing.shared_with.length} tutor{sharing.shared_with.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sharing.shared_with.map((t) => (
                <span key={t.tutor_profile_id} className="chip bg-emerald-100 text-emerald-800 text-[11px]">
                  <ShieldCheck size={11} /> {t.full_name}
                </span>
              ))}
            </div>
          </div>
        )}

        {sharing?.share_learning_summary && sharing.shared_with?.length === 0 && (
          <p className="text-xs text-slate-400">
            Sharing is on, but you have no active bookings yet — no tutor can see anything.
          </p>
        )}
      </div>

      {/* Saved tutors */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
          <Bookmark size={16} /> Saved Tutors
          {saved.length > 0 && <span className="text-slate-400 font-normal">({saved.length})</span>}
        </h2>

        {saved.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="No saved tutors"
            description="Save tutors while browsing so you can come back to them later."
            action={<Link to="/find-tutors" className="btn-primary"><Search size={15} /> Find Tutors</Link>}
          />
        ) : (
          <div className="space-y-2">
            {saved.map((t) => (
              <div key={t.tutor_profile_id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700 text-sm font-semibold">
                  {t.user?.full_name?.[0] || 'T'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{t.user?.full_name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <StarRating value={t.profile?.average_rating} size={11} />
                    {t.verified_modules?.slice(0, 2).map((m) => (
                      <VerifiedBadge key={m.id} moduleCode={m.module_code} size="sm" />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link to={`/tutors/${t.tutor_profile_id}`} className="btn-secondary !py-1.5 !px-3 text-xs">
                    View
                  </Link>
                  <button onClick={() => handleUnsave(t.tutor_profile_id)} disabled={removingId === t.tutor_profile_id}
                    title="Remove from saved" className="text-slate-400 hover:text-red-600 transition-colors">
                    {removingId === t.tutor_profile_id
                      ? <Loader2 size={15} className="animate-spin" />
                      : <Trash2 size={15} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
