import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { searchTutors } from '../api/search';
import { listModules } from '../api/modules';
import FilterPanel from '../components/FilterPanel';
import TutorCard from '../components/TutorCard';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

/**
 * Supports being deep-linked from the quiz diagnosis page (spec section 17):
 * ?moduleId=...&weakTopics=A,B preselects the module filter and feeds the
 * weak topics into match scoring so the "Find a Tutor" connection works.
 */
export default function FindTutors() {
  const [searchParams] = useSearchParams();
  const [modules, setModules] = useState([]);
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState(() => {
    const initial = {};
    if (searchParams.get('moduleId')) initial.moduleId = searchParams.get('moduleId');
    const weak = searchParams.get('weakTopics');
    if (weak) initial.weakTopics = weak.split(',');
    return initial;
  });

  const runSearch = useCallback(async (activeFilters) => {
    setLoading(true);
    setError(false);
    try {
      const results = await searchTutors(activeFilters);
      setTutors(results);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    listModules().then(setModules).catch(() => setModules([]));
  }, []);

  useEffect(() => {
    runSearch(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const preselectedModule = modules.find((m) => m.id === filters.moduleId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Find Tutors</h1>
        <p className="text-sm text-slate-500">Search verified student tutors by module, topic and availability.</p>
        {filters.weakTopics?.length > 0 && (
          <div className="mt-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800">
            Showing tutors ranked against your weak topics{preselectedModule ? ` in ${preselectedModule.module_code}` : ''}: {filters.weakTopics.join(', ')}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <FilterPanel modules={modules} filters={filters} onChange={setFilters} onClear={() => setFilters({})} />

        <div>
          {loading ? (
            <p className="text-sm text-slate-400">Searching tutors…</p>
          ) : error ? (
            <ErrorState onRetry={() => runSearch(filters)} />
          ) : tutors.length === 0 ? (
            <EmptyState icon={SearchIcon} title="No tutors match these filters" description="Try widening your search, e.g. removing the module or day filter." action={
              <button className="btn-secondary" onClick={() => setFilters({})}>Clear filters</button>
            } />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tutors.map((t) => <TutorCard key={t.tutor_profile_id} tutor={t} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
