import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  Trophy, TrendingUp, AlertTriangle, CheckCircle2, BookOpen, Search,
  RotateCcw, Sparkles, ArrowRight,
} from 'lucide-react';
import { getDiagnosis } from '../api/quizzes';
import TopicBreakdownBars from '../components/TopicBreakdownBars';
import ErrorState from '../components/ErrorState';

/**
 * Quiz result & diagnosis (spec section 17).
 *
 * The primary action is "Find a Tutor", which deep-links into Find Tutors with
 * the module preselected and the weak topics passed through so results are
 * ranked by match score against exactly the gaps this attempt revealed. That
 * connection is the core of the product's learning loop.
 */
export default function QuizResult() {
  const { quizId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const attemptId = searchParams.get('attemptId');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!attemptId) {
      setError('No attempt specified.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await getDiagnosis(attemptId));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your results.');
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-slate-400">Scoring your quiz…</p>;
  if (error || !data) return <ErrorState message={error} onRetry={load} />;

  const { diagnosis, quiz } = data;
  const {
    score, total_questions, percentage, overall_status,
    breakdown, strong, developing, needs_improvement, weak_topics, recommended_pages, module_id,
  } = diagnosis;

  const scoreTone =
    percentage >= 80 ? 'text-emerald-600'
    : percentage >= 60 ? 'text-amber-600'
    : 'text-red-600';

  function handleFindTutor() {
    const params = new URLSearchParams();
    if (module_id) params.set('moduleId', module_id);
    if (weak_topics.length > 0) params.set('weakTopics', weak_topics.join(','));
    navigate(`/find-tutors?${params.toString()}`);
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <p className="text-xs font-medium text-brand-600">{quiz?.title}</p>
        <h1 className="text-xl font-bold text-slate-800">Your Results</h1>
      </div>

      {/* Score summary */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
              percentage >= 80 ? 'bg-emerald-50' : percentage >= 60 ? 'bg-amber-50' : 'bg-red-50'
            }`}>
              <Trophy size={26} className={scoreTone} />
            </div>
            <div>
              <p className={`text-3xl font-bold leading-none ${scoreTone}`}>
                {score}<span className="text-lg text-slate-400">/{total_questions}</span>
              </p>
              <p className="mt-1 text-sm text-slate-500">{percentage}% overall · {overall_status}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate(`/ai-study/quiz/${quizId}`)} className="btn-secondary">
              <RotateCcw size={15} /> Retake
            </button>
          </div>
        </div>
      </div>

      {/* Primary CTA — the AI→tutor connection */}
      {weak_topics.length > 0 && (
        <div className="card border-brand-200 bg-brand-50/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Sparkles size={16} className="text-brand-600" />
                We found {weak_topics.length} topic{weak_topics.length === 1 ? '' : 's'} to work on
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Get help from a verified tutor who specialises in {weak_topics.join(' and ')}.
              </p>
            </div>
            <button onClick={handleFindTutor} className="btn-primary shrink-0">
              <Search size={15} /> Find a Tutor <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}

      {weak_topics.length === 0 && (
        <div className="card border-emerald-200 bg-emerald-50/40">
          <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={16} /> No weak topics in this attempt
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Strong work. You can still book a tutor to go deeper on any topic.
          </p>
          <Link to="/find-tutors" className="btn-secondary mt-3">
            <Search size={15} /> Browse Tutors
          </Link>
        </div>
      )}

      {/* Full topic breakdown */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Topic Breakdown</h2>
        <TopicBreakdownBars items={breakdown} />
      </div>

      {/* Grouped topic lists */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TopicGroup
          title="Needs Improvement" icon={AlertTriangle} tone="red"
          topics={needs_improvement} emptyText="Nothing below 60%"
        />
        <TopicGroup
          title="Developing" icon={TrendingUp} tone="amber"
          topics={developing} emptyText="Nothing in 60–79%"
        />
        <TopicGroup
          title="Strong" icon={CheckCircle2} tone="emerald"
          topics={strong} emptyText="Nothing at 80%+ yet"
        />
      </div>

      {/* Recommended pages */}
      {recommended_pages.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <BookOpen size={15} /> Recommended Pages to Review
          </h2>
          <div className="space-y-2">
            {recommended_pages.map((rp) => (
              <div key={rp.topic} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-sm font-medium text-slate-700">{rp.topic}</span>
                <span className="text-sm text-slate-500">
                  Page{rp.pages.length === 1 ? '' : 's'} {rp.pages.join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link to="/ai-study" className="btn-secondary">Back to AI Study</Link>
        <Link to="/progress" className="btn-secondary">View Progress</Link>
      </div>
    </div>
  );
}

function TopicGroup({ title, icon: Icon, tone, topics, emptyText }) {
  const tones = {
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon size={15} />
        </span>
        <p className="text-sm font-semibold text-slate-700">{title}</p>
      </div>
      {topics.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyText}</p>
      ) : (
        <ul className="space-y-1">
          {topics.map((t) => (
            <li key={t.topic} className="flex items-center justify-between text-sm">
              <span className="text-slate-600 truncate">{t.topic}</span>
              <span className="text-slate-400 shrink-0 ml-2">{t.score_percentage}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
