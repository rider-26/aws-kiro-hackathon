import { useEffect, useState } from 'react';
import { Plus, BookOpen, X } from 'lucide-react';
import { listModules, createModule, updateModule } from '../../api/modules';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';

export default function AdminModules() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ module_code: '', module_name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const data = await listModules({ all: true });
      setModules(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await createModule(form);
      setForm({ module_code: '', module_name: '', description: '' });
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to create module');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(mod) {
    await updateModule(mod.id, { active: !mod.active });
    await load();
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Modules</h1>
          <p className="text-sm text-slate-500">Manage the module catalogue tutors can be verified against.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Cancel' : 'New Module'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Module code</label>
              <input required value={form.module_code} onChange={(e) => setForm((f) => ({ ...f, module_code: e.target.value }))}
                placeholder="IT2513" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Module name</label>
              <input required value={form.module_name} onChange={(e) => setForm((f) => ({ ...f, module_name: e.target.value }))}
                placeholder="Information Security" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Creating…' : 'Create Module'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading modules…</p>
      ) : error ? (
        <ErrorState onRetry={load} />
      ) : modules.length === 0 ? (
        <EmptyState icon={BookOpen} title="No modules yet" description="Create the first module for tutors to be verified against." />
      ) : (
        <div className="card divide-y divide-slate-100 p-0">
          {modules.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">{m.module_code} — {m.module_name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{m.description || 'No description'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`chip ${m.active ? 'chip-accepted' : 'chip-cancelled'}`}>
                  {m.active ? 'Active' : 'Inactive'}
                </span>
                <button onClick={() => toggleActive(m)} className="btn-secondary !py-1.5 !px-3 text-xs">
                  {m.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
