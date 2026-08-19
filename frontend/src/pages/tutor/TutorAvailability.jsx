import { useEffect, useState } from 'react';
import {
  CalendarCheck, Plus, Trash2, Loader2, Info, ToggleLeft, ToggleRight,
} from 'lucide-react';
import {
  listOwnAvailability, addAvailability, updateAvailability, removeAvailability,
} from '../../api/tutors';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MODES = ['Both', 'Online', 'Physical'];

export default function TutorAvailability() {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [form, setForm] = useState({
    day_or_date: 'Monday', start_time: '15:00', end_time: '17:00', session_mode: 'Both',
  });
  const [busy, setBusy] = useState('');
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    setError(false);
    try {
      setSlots(await listOwnAvailability());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setBusy('add');
    setFormError('');
    try {
      await addAvailability(form);
      await load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Could not add that slot.');
    } finally {
      setBusy('');
    }
  }

  async function handleToggleActive(slot) {
    setBusy(slot.id);
    try {
      await updateAvailability(slot.id, { active: slot.active === false });
      await load();
    } finally {
      setBusy('');
    }
  }

  async function handleRemove(slotId) {
    setBusy(slotId);
    try {
      await removeAvailability(slotId);
      await load();
    } finally {
      setBusy('');
    }
  }

  const sorted = [...slots].sort((a, b) => {
    const dayDiff = DAYS.indexOf(a.day_or_date) - DAYS.indexOf(b.day_or_date);
    return dayDiff !== 0 ? dayDiff : a.start_time.localeCompare(b.start_time);
  });

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Availability</h1>
        <p className="text-sm text-slate-500">
          Students can only request times that fall inside these slots.
        </p>
      </div>

      <div className="flex gap-2 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
        <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          Slots repeat weekly. Deactivating a slot hides it from students without deleting it, and
          PeerLink also blocks any booking that would clash with a session you have already accepted.
        </p>
      </div>

      <form onSubmit={handleAdd} className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Plus size={16} /> Add a slot
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Day</label>
            <select value={form.day_or_date}
              onChange={(e) => setForm((f) => ({ ...f, day_or_date: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Session mode</label>
            <select value={form.session_mode}
              onChange={(e) => setForm((f) => ({ ...f, session_mode: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start</label>
            <input type="time" required value={form.start_time}
              onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">End</label>
            <input type="time" required value={form.end_time}
              onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <button type="submit" disabled={busy === 'add'} className="btn-primary">
          {busy === 'add' ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Add Slot
        </button>
      </form>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Your slots {slots.length > 0 && <span className="text-slate-400 font-normal">({slots.length})</span>}
        </h2>

        {loading ? (
          <p className="text-sm text-slate-400">Loading availability…</p>
        ) : error ? (
          <ErrorState onRetry={load} />
        ) : slots.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="No availability yet"
            description="Add at least one slot so students can book you."
          />
        ) : (
          <div className="space-y-2">
            {sorted.map((slot) => {
              const inactive = slot.active === false;
              return (
                <div key={slot.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5 ${
                    inactive ? 'bg-slate-50 opacity-60' : 'bg-slate-50'
                  }`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">{slot.day_or_date}</p>
                    <p className="text-xs text-slate-400">
                      {slot.start_time} – {slot.end_time} · {slot.session_mode}
                      {inactive && ' · inactive'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleToggleActive(slot)} disabled={busy === slot.id}
                      title={inactive ? 'Activate slot' : 'Deactivate slot'}
                      className="text-slate-400 hover:text-brand-600 transition-colors">
                      {busy === slot.id
                        ? <Loader2 size={17} className="animate-spin" />
                        : inactive ? <ToggleLeft size={20} /> : <ToggleRight size={20} className="text-brand-600" />}
                    </button>
                    <button onClick={() => handleRemove(slot.id)} disabled={busy === slot.id}
                      title="Remove slot"
                      className="text-slate-400 hover:text-red-600 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
