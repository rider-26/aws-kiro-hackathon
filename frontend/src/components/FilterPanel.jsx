import { Filter, X } from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MODES = ['Physical', 'Online', 'Both'];
const RATINGS = [4.5, 4, 3.5, 3];

export default function FilterPanel({ modules, filters, onChange, onClear }) {
  function set(key, value) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Filter size={15} /> Filters
        </h2>
        <button onClick={onClear} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
          <X size={12} /> Clear
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Module</label>
        <select value={filters.moduleId || ''} onChange={(e) => set('moduleId', e.target.value || undefined)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
          <option value="">Any module</option>
          {modules.map((m) => <option key={m.id} value={m.id}>{m.module_code} — {m.module_name}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Topic</label>
        <input value={filters.topic || ''} onChange={(e) => set('topic', e.target.value || undefined)}
          placeholder="e.g. Digital Signatures"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Availability (day)</label>
        <select value={filters.day || ''} onChange={(e) => set('day', e.target.value || undefined)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
          <option value="">Any day</option>
          {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Session Type</label>
        <div className="flex gap-2">
          {['Individual', 'Group'].map((t) => (
            <button key={t} onClick={() => set('sessionType', filters.sessionType === t ? undefined : t)}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filters.sessionType === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Mode</label>
        <div className="flex gap-2">
          {MODES.map((m) => (
            <button key={m} onClick={() => set('mode', filters.mode === m ? undefined : m)}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                filters.mode === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
              }`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Minimum Rating</label>
        <select value={filters.minRating || ''} onChange={(e) => set('minRating', e.target.value || undefined)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
          <option value="">Any rating</option>
          {RATINGS.map((r) => <option key={r} value={r}>{r}+ stars</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Group Size</label>
        <input type="number" min={1} value={filters.groupSize || ''} onChange={(e) => set('groupSize', e.target.value || undefined)}
          placeholder="e.g. 3"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
      </div>
    </div>
  );
}
