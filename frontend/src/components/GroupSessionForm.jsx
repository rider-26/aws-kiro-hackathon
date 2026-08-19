import { useEffect, useMemo, useState } from 'react';
import { Users, Check, Loader2 } from 'lucide-react';
import { createGroupSession } from '../api/sessions';
import { getOwnTutorProfile } from '../api/tutors';

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Group session creation (spec section 13). Only modules the tutor is verified
 * for are offered, and capacity is capped at their declared maximum group size —
 * the same limits the backend enforces.
 */
export default function GroupSessionForm({ onCreated, onCancel }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: '',
    module_id: '',
    date: '',
    start_time: '15:00',
    end_time: '16:30',
    session_mode: 'Online',
    location: '',
    maximum_students: 4,
  });
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getOwnTutorProfile()
      .then((data) => {
        setProfile(data);
        setForm((f) => ({
          ...f,
          module_id: data.verified_modules[0]?.id || '',
          session_mode: data.profile.online_enabled ? 'Online' : 'Physical',
          maximum_students: Math.min(4, data.profile.maximum_group_size || 4),
        }));
      })
      .catch(() => setError('Could not load your tutor profile.'))
      .finally(() => setLoading(false));
  }, []);

  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toISODate(d);
  }, []);

  const moduleTopics = (profile?.topics || []).filter((t) => t.module_id === form.module_id);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setError('');
  }

  function toggleTopic(name) {
    setSelectedTopics((prev) => prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const created = await createGroupSession({
        ...form,
        maximum_students: Number(form.maximum_students),
        topics: selectedTopics,
      });
      onCreated?.(created);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create this group session.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <p className="text-sm text-slate-400 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading your profile…
        </p>
      </div>
    );
  }

  if (!profile || profile.verified_modules.length === 0) {
    return (
      <div className="card">
        <p className="text-sm font-semibold text-slate-800">No verified modules yet</p>
        <p className="mt-1 text-sm text-slate-600">
          You need to be verified for at least one module before creating group sessions.
          Request verification from your profile page.
        </p>
        <button onClick={onCancel} className="btn-secondary mt-3">Close</button>
      </div>
    );
  }

  const maxGroup = profile.profile.maximum_group_size || 2;

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
        <Users size={18} /> Create a group session
      </h2>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
        <input required value={form.title} onChange={(e) => update('title', e.target.value)}
          placeholder="e.g. IT2513 Crypto Revision"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Module</label>
        <select value={form.module_id} onChange={(e) => { update('module_id', e.target.value); setSelectedTopics([]); }}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
          {profile.verified_modules.map((m) => (
            <option key={m.id} value={m.id}>{m.module_code} — {m.module_name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">Only modules you are verified for are listed.</p>
      </div>

      {moduleTopics.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Topics</label>
          <div className="flex flex-wrap gap-2">
            {moduleTopics.map((t) => (
              <button key={t.id} type="button" onClick={() => toggleTopic(t.topic_name)}
                className={`chip border transition-colors ${
                  selectedTopics.includes(t.topic_name)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}>
                {selectedTopics.includes(t.topic_name) && <Check size={12} />}
                {t.topic_name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
          <input type="date" required min={minDate} value={form.date}
            onChange={(e) => update('date', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Start</label>
          <input type="time" required value={form.start_time}
            onChange={(e) => update('start_time', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">End</label>
          <input type="time" required value={form.end_time}
            onChange={(e) => update('end_time', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Mode</label>
        <div className="flex gap-2">
          {['Online', 'Physical'].map((m) => {
            const enabled = m === 'Online' ? profile.profile.online_enabled : profile.profile.physical_enabled;
            if (!enabled) return null;
            return (
              <button key={m} type="button" onClick={() => update('session_mode', m)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  form.session_mode === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
                }`}>
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
          <input value={form.location} onChange={(e) => update('location', e.target.value)}
            placeholder={form.session_mode === 'Online' ? 'Online (in-app)' : 'e.g. Library discussion room'}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          {form.session_mode === 'Physical' && (
            <p className="mt-1 text-xs text-slate-400">
              Room booking is arranged separately — PeerLink does not reserve facilities.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Maximum participants
          </label>
          <input type="number" min={2} max={maxGroup} required value={form.maximum_students}
            onChange={(e) => update('maximum_students', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          <p className="mt-1 text-xs text-slate-400">Your profile allows up to {maxGroup}.</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={submitting} className="btn-primary flex-1">
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
          {submitting ? 'Creating…' : 'Create Session'}
        </button>
      </div>
    </form>
  );
}
