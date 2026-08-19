import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Check } from 'lucide-react';
import { createBooking } from '../api/bookings';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Builds the list of concrete upcoming dates (next 28 days) that fall on a
 * weekday the tutor has an active availability slot for. This is how the UI
 * enforces business rule 4 — students are only ever offered slots the tutor
 * actually declared. The backend re-validates independently.
 */
function buildDateOptions(availability) {
  const activeDays = new Set(availability.map((a) => a.day_or_date));
  const options = [];
  const today = new Date();
  for (let i = 1; i <= 28; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayName = DAY_NAMES[d.getDay()];
    if (activeDays.has(dayName)) {
      options.push({ value: toISODate(d), label: `${dayName}, ${d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}`, dayName });
    }
  }
  return options;
}

/** Splits a slot into bookable 1-hour start times. */
function buildTimeOptions(slot) {
  if (!slot) return [];
  const [sh] = slot.start_time.split(':').map(Number);
  const [eh] = slot.end_time.split(':').map(Number);
  const times = [];
  for (let h = sh; h < eh; h += 1) {
    times.push({
      start: `${String(h).padStart(2, '0')}:00`,
      end: `${String(h + 1).padStart(2, '0')}:00`,
    });
  }
  return times;
}

export default function BookingForm({ tutor, onCancel }) {
  const navigate = useNavigate();
  const { profile, verified_modules, topics, availability } = tutor;

  const [moduleId, setModuleId] = useState(verified_modules[0]?.id || '');
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [sessionType, setSessionType] = useState('Individual');
  const [sessionMode, setSessionMode] = useState(profile.online_enabled ? 'Online' : 'Physical');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const dateOptions = useMemo(() => buildDateOptions(availability), [availability]);
  const selectedDayName = dateOptions.find((o) => o.value === date)?.dayName;
  const slotForDay = availability.find(
    (a) => a.day_or_date === selectedDayName && (a.session_mode === 'Both' || a.session_mode === sessionMode)
  );
  const timeOptions = useMemo(() => buildTimeOptions(slotForDay), [slotForDay]);

  const moduleTopics = topics.filter((t) => t.module_id === moduleId);

  function toggleTopic(name) {
    setSelectedTopics((prev) => prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!timeSlot) {
      setError('Please choose a time.');
      return;
    }
    const [start_time, end_time] = timeSlot.split('-');
    setSubmitting(true);
    try {
      await createBooking({
        tutor_id: tutor.tutor_profile_id,
        module_id: moduleId,
        topics: selectedTopics,
        date,
        start_time,
        end_time,
        session_type: sessionType,
        session_mode: sessionMode,
        student_message: message,
      });
      navigate('/bookings');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit this booking.');
    } finally {
      setSubmitting(false);
    }
  }

  if (verified_modules.length === 0) {
    return (
      <div className="card">
        <p className="text-sm text-slate-500">
          This tutor has no verified modules yet, so they cannot be booked. Verification is granted per module by a lecturer.
        </p>
        <button onClick={onCancel} className="btn-secondary mt-3">Back</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
        <CalendarPlus size={18} /> Book a session with {tutor.user?.full_name}
      </h2>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Module</label>
        <select value={moduleId} onChange={(e) => { setModuleId(e.target.value); setSelectedTopics([]); }}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
          {verified_modules.map((m) => <option key={m.id} value={m.id}>{m.module_code} — {m.module_name}</option>)}
        </select>
        <p className="mt-1 text-xs text-slate-400">Only modules this tutor is verified for are listed.</p>
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

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Session mode</label>
        <div className="flex gap-2">
          {['Online', 'Physical'].map((m) => {
            const enabled = m === 'Online' ? profile.online_enabled : profile.physical_enabled;
            if (!enabled) return null;
            return (
              <button key={m} type="button" onClick={() => { setSessionMode(m); setTimeSlot(''); }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  sessionMode === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
                }`}>
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Session type</label>
        <div className="flex gap-2">
          {['Individual', 'Group'].map((t) => (
            <button key={t} type="button" onClick={() => setSessionType(t)}
              disabled={t === 'Group' && (profile.maximum_group_size || 1) <= 1}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
                sessionType === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
          <select value={date} onChange={(e) => { setDate(e.target.value); setTimeSlot(''); }} required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
            <option value="">Select a date</option>
            {dateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
          <select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} disabled={!date}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none disabled:bg-slate-50">
            <option value="">{date ? 'Select a time' : 'Choose a date first'}</option>
            {timeOptions.map((t) => (
              <option key={t.start} value={`${t.start}-${t.end}`}>{t.start} – {t.end}</option>
            ))}
          </select>
          {date && timeOptions.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">No {sessionMode.toLowerCase()} slots on this day.</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Message (optional)</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
          placeholder="Tell the tutor what you'd like to focus on."
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" disabled={submitting} className="btn-primary flex-1">
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>
    </form>
  );
}
