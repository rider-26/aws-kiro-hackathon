import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart as LineChartIcon, Search, Sparkles, Calendar } from 'lucide-react';
import { getProgress } from '../api/progress';
import ProgressChart from '../components/ProgressChart';
import ImprovementBanner from '../components/ImprovementBanner';
import TopicBreakdownBars from '../components/TopicBreakdownBars';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

export default function Progress() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      setData(await getProgress());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <p className="text-sm text-slate-400">Loading your progress…</p>;
  if (error || !data) return <ErrorState onRetry={load} />;

  const { history, improvement, topic_performance, weak_topics } = data;

  if (history.length === 0) {
    return (
      <div className="max-w-3xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Progress</h1>
          <p className="text-sm text-slate-500">Track how your quiz scores change over time.</p>
        </div>
        <EmptyState
          icon={LineChartIcon}
          title="No quiz attempts yet"
          description="Take a quiz in AI Study and your results will start building a progress history here."
          action={<Link to="/ai-study" className="btn-primary"><Sparkles size={15} /> Go to AI Study</Link>}
        />
      </div>
    );
  }

  const weakestModuleId = weak_topics[0]?.module_id;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Progress</h1>
        <p className="text-sm text-slate-500">
          {history.length} completed attempt{history.length === 1 ? '' : 's'}
        </p>
      </div>

      <ImprovementBanner
        latest={improvement.latest}
        previous={improvement.previous}
        delta={improvement.delta}
      />

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Score Trend</h2>
        <ProgressChart history={history} />
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Current Topic Standing</h2>
        <TopicBreakdownBars items={topic_performance} showCounts={false} />
      </div>

      {weak_topics.length > 0 && (
        <div className="card border-brand-200 bg-brand-50/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {weak_topics.length} topic{weak_topics.length === 1 ? '' : 's'} still need work
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {weak_topics.map((t) => t.topic).join(', ')}
              </p>
            </div>
            <Link
              to={`/find-tutors?${new URLSearchParams({
                ...(weakestModuleId ? { moduleId: weakestModuleId } : {}),
                weakTopics: weak_topics.map((t) => t.topic).join(','),
              }).toString()}`}
              className="btn-primary shrink-0"
            >
              <Search size={15} /> Find a Tutor
            </Link>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Attempt History</h2>
        <div className="space-y-2">
          {[...history].reverse().map((a, i) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">
                  {a.quiz_title}
                  {a.module && <span className="ml-2 text-xs text-brand-600">{a.module.module_code}</span>}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                  <Calendar size={11} />
                  {a.completed_date ? new Date(a.completed_date).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  {i === 0 && <span className="ml-1 chip bg-brand-100 text-brand-700 text-[10px]">Latest</span>}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-semibold text-slate-700">
                  {a.score}/{a.total_questions}
                </span>
                <span className={`chip text-[10px] ${
                  a.percentage >= 80 ? 'bg-emerald-100 text-emerald-800'
                  : a.percentage >= 60 ? 'bg-amber-100 text-amber-800'
                  : 'bg-red-100 text-red-700'
                }`}>
                  {a.percentage}%
                </span>
                <Link to={`/ai-study/quiz/${a.quiz_id}/result?attemptId=${a.id}`}
                  className="text-xs text-brand-600 hover:underline">Details</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
