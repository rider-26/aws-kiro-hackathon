import { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { listGroupSessions, joinGroupSession, leaveGroupSession } from '../api/sessions';
import { listModules } from '../api/modules';
import GroupSessionCard from '../components/GroupSessionCard';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

/**
 * Group session browsing for students (spec section 13). Join/leave results are
 * always followed by a refetch so occupancy counts stay truthful even when
 * another student joined at the same moment.
 */
export default function GroupSessions() {
  const [sessions, setSessions] = useState([]);
  const [modules, setModules] = useState([]);
  const [moduleFilter, setModuleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState('');

  // Depends on moduleFilter, so it's memoised and the effect below can list it
  // as a dependency honestly rather than suppressing the lint rule.
  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setSessions(await listGroupSessions({ moduleId: moduleFilter || undefined }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [moduleFilter]);

  useEffect(() => {
    // The module list only powers the filter, so a failure here shouldn't block
    // the page.
    listModules().then(setModules).catch(() => setModules([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleJoin(id) {
    setBusy(id);
    setActionError('');
    try {
      await joinGroupSession(id);
      await load();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not join that session.');
      // Refetch anyway: the failure is usually because occupancy changed.
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function handleLeave(id) {
    setBusy(id);
    setActionError('');
    try {
      await leaveGroupSession(id);
      await load();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not leave that session.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Group Sessions</h1>
          <p className="text-sm text-slate-500">
            Join a session run by a verified tutor and learn alongside other students.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Module</label>
          <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none">
            <option value="">All modules</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>{m.module_code} — {m.module_name}</option>
            ))}
          </select>
        </div>
      </div>

      {actionError && <ErrorState message={actionError} />}

      {loading ? (
        <p className="text-sm text-slate-400">Loading group sessions…</p>
      ) : error ? (
        <ErrorState onRetry={() => load()} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No group sessions available"
          description={moduleFilter
            ? 'No open sessions for this module yet. Try another module or clear the filter.'
            : 'Tutors have not scheduled any group sessions yet. Check back soon.'}
          action={moduleFilter
            ? <button className="btn-secondary" onClick={() => setModuleFilter('')}>Clear filter</button>
            : null}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sessions.map((s) => (
            <GroupSessionCard
              key={s.id}
              session={s}
              viewerRole="Tutee"
              busy={busy}
              onJoin={handleJoin}
              onLeave={handleLeave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
