import { useEffect, useState } from 'react';
import {
  UserRound, Save, Loader2, Plus, X, ShieldCheck, Clock, Send, Info,
} from 'lucide-react';
import {
  getOwnTutorProfile, updateOwnTutorProfile, addTopic, removeTopic, requestVerification,
} from '../../api/tutors';
import { listModules } from '../../api/modules';
import { updateOwnProfile } from '../../api/users';
import VerifiedBadge from '../../components/VerifiedBadge';
import ErrorState from '../../components/ErrorState';

const VERIFICATION_TONES = {
  Verified: 'bg-emerald-100 text-emerald-800',
  Pending: 'bg-amber-100 text-amber-800',
  Rejected: 'bg-red-100 text-red-700',
  Revoked: 'bg-slate-200 text-slate-600',
};

export default function TutorProfileSettings() {
  const [tutor, setTutor] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [account, setAccount] = useState({ full_name: '', course: '', year_of_study: '' });
  const [profile, setProfile] = useState({
    bio: '', teaching_style: '', portfolio_url: '', linkedin_url: '',
    maximum_group_size: 4, maximum_weekly_sessions: 10,
    physical_enabled: true, online_enabled: true,
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [newTopic, setNewTopic] = useState({ module_id: '', topic_name: '' });
  const [busy, setBusy] = useState('');
  const [verifyModuleId, setVerifyModuleId] = useState('');

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const [data, mods] = await Promise.all([getOwnTutorProfile(), listModules()]);
      setTutor(data);
      setAccount({
        full_name: data.user?.full_name || '',
        course: data.user?.course || '',
        year_of_study: data.user?.year_of_study || '',
      });
      setProfile({
        bio: data.profile.bio || '',
        teaching_style: data.profile.teaching_style || '',
        portfolio_url: data.profile.portfolio_url || '',
        linkedin_url: data.profile.linkedin_url || '',
        maximum_group_size: data.profile.maximum_group_size ?? 4,
        maximum_weekly_sessions: data.profile.maximum_weekly_sessions ?? 10,
        physical_enabled: data.profile.physical_enabled !== false,
        online_enabled: data.profile.online_enabled !== false,
      });
      setModules(mods);
      setNewTopic({ module_id: data.verified_modules[0]?.id || mods[0]?.id || '', topic_name: '' });
      setVerifyModuleId(mods[0]?.id || '');
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await Promise.all([updateOwnTutorProfile(profile), updateOwnProfile(account)]);
      setMessage('Profile saved.');
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddTopic(e) {
    e.preventDefault();
    if (!newTopic.module_id || !newTopic.topic_name.trim()) return;
    setBusy('topic');
    try {
      await addTopic({ module_id: newTopic.module_id, topic_name: newTopic.topic_name.trim() });
      setNewTopic((t) => ({ ...t, topic_name: '' }));
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not add that topic.');
    } finally {
      setBusy('');
    }
  }

  async function handleRemoveTopic(topicId) {
    setBusy(topicId);
    try {
      await removeTopic(topicId);
      await load();
    } finally {
      setBusy('');
    }
  }

  async function handleRequestVerification() {
    if (!verifyModuleId) return;
    setBusy('verify');
    setMessage('');
    try {
      await requestVerification(verifyModuleId);
      setMessage('Verification requested. A lecturer will review it.');
      await load();
    } catch (err) {
      setMessage(err.response?.data?.message || 'Could not request verification.');
    } finally {
      setBusy('');
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading your profile…</p>;
  if (error || !tutor) return <ErrorState onRetry={load} />;

  const moduleById = new Map(modules.map((m) => [m.id, m]));

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Tutor Profile</h1>
        <p className="text-sm text-slate-500">
          This is what students see when they find you. Keep it accurate.
        </p>
      </div>

      <form onSubmit={handleSave} className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <UserRound size={16} /> About You
        </h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
          <input required value={account.full_name}
            onChange={(e) => setAccount((a) => ({ ...a, full_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Course</label>
            <input value={account.course}
              onChange={(e) => setAccount((a) => ({ ...a, course: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Year of study</label>
            <input value={account.year_of_study}
              onChange={(e) => setAccount((a) => ({ ...a, year_of_study: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Bio</label>
          <textarea rows={3} value={profile.bio}
            onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
            placeholder="What do you enjoy helping students with?"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Teaching style</label>
          <textarea rows={2} value={profile.teaching_style}
            onChange={(e) => setProfile((p) => ({ ...p, teaching_style: e.target.value }))}
            placeholder="e.g. Diagrams, practical examples and step-by-step explanations."
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Portfolio URL</label>
            <input type="url" value={profile.portfolio_url}
              onChange={(e) => setProfile((p) => ({ ...p, portfolio_url: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">LinkedIn URL</label>
            <input type="url" value={profile.linkedin_url}
              onChange={(e) => setProfile((p) => ({ ...p, linkedin_url: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Workload & Capacity</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Maximum group size</label>
              <input type="number" min={1} max={20} value={profile.maximum_group_size}
                onChange={(e) => setProfile((p) => ({ ...p, maximum_group_size: Number(e.target.value) }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Maximum weekly sessions</label>
              <input type="number" min={1} max={40} value={profile.maximum_weekly_sessions}
                onChange={(e) => setProfile((p) => ({ ...p, maximum_weekly_sessions: Number(e.target.value) }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 cursor-pointer">
              <input type="checkbox" checked={profile.online_enabled}
                onChange={(e) => setProfile((p) => ({ ...p, online_enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-sm text-slate-700">Offer online sessions</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 cursor-pointer">
              <input type="checkbox" checked={profile.physical_enabled}
                onChange={(e) => setProfile((p) => ({ ...p, physical_enabled: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-sm text-slate-700">Offer physical sessions</span>
            </label>
          </div>
        </div>

        {message && (
          <p className={`text-sm ${message.startsWith('Could not') ? 'text-red-600' : 'text-emerald-700'}`}>
            {message}
          </p>
        )}

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </form>

      {/* Verification (read-only status + request) */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <ShieldCheck size={16} /> Module Verification
        </h2>

        <div className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <Info size={13} className="text-slate-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500">
            Verification is granted per module by a lecturer. You can request it, but you cannot approve
            your own — and you can only be booked for modules you are verified for.
          </p>
        </div>

        {tutor.all_verifications.length === 0 ? (
          <p className="text-sm text-slate-400">No verification requests yet.</p>
        ) : (
          <div className="space-y-2">
            {tutor.all_verifications.map((v) => {
              const mod = moduleById.get(v.module_id);
              return (
                <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">
                      {mod ? `${mod.module_code} — ${mod.module_name}` : v.module_id}
                    </p>
                    {v.admin_notes && <p className="text-[11px] text-slate-400 mt-0.5">{v.admin_notes}</p>}
                  </div>
                  <span className={`chip text-[10px] shrink-0 ${VERIFICATION_TONES[v.status] || VERIFICATION_TONES.Pending}`}>
                    {v.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <select value={verifyModuleId} onChange={(e) => setVerifyModuleId(e.target.value)}
            className="flex-1 min-w-[200px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
            {modules.map((m) => <option key={m.id} value={m.id}>{m.module_code} — {m.module_name}</option>)}
          </select>
          <button onClick={handleRequestVerification} disabled={busy === 'verify'} className="btn-secondary">
            {busy === 'verify' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Request Verification
          </button>
        </div>
      </div>

      {/* Specialisations */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Specialisations</h2>

        {tutor.verified_modules.length === 0 ? (
          <p className="text-sm text-slate-400">
            Get verified for a module first, then add the topics you can teach.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {tutor.verified_modules.map((m) => <VerifiedBadge key={m.id} moduleCode={m.module_code} size="sm" />)}
            </div>

            {tutor.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tutor.topics.map((t) => (
                  <span key={t.id} className="chip bg-brand-50 text-brand-700 text-[11px]">
                    {t.topic_name}
                    <button onClick={() => handleRemoveTopic(t.id)} disabled={busy === t.id}
                      className="ml-0.5 hover:text-red-600" title="Remove topic">
                      {busy === t.id ? <Loader2 size={10} className="animate-spin" /> : <X size={11} />}
                    </button>
                  </span>
                ))}
              </div>
            )}

            <form onSubmit={handleAddTopic} className="flex flex-wrap gap-2">
              <select value={newTopic.module_id}
                onChange={(e) => setNewTopic((t) => ({ ...t, module_id: e.target.value }))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
                {tutor.verified_modules.map((m) => (
                  <option key={m.id} value={m.id}>{m.module_code}</option>
                ))}
              </select>
              <input value={newTopic.topic_name}
                onChange={(e) => setNewTopic((t) => ({ ...t, topic_name: e.target.value }))}
                placeholder="e.g. Digital Signatures"
                className="flex-1 min-w-[160px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
              <button type="submit" disabled={busy === 'topic' || !newTopic.topic_name.trim()}
                className="btn-secondary">
                {busy === 'topic' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                Add
              </button>
            </form>
          </>
        )}
      </div>

      {/* Availability pointer */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
          <Clock size={16} /> Availability
        </h2>
        <p className="text-sm text-slate-600">
          You have {tutor.availability.length} active slot{tutor.availability.length === 1 ? '' : 's'}.
          Students can only book times inside your declared availability.
        </p>
        <a href="/tutor/availability" className="btn-secondary mt-3">Manage Availability</a>
      </div>
    </div>
  );
}
