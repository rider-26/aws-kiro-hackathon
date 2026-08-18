import { useEffect, useState } from 'react';
import {
  BookOpenCheck, Lock, Target, TrendingUp, Loader2, ShieldCheck,
} from 'lucide-react';
import { getLearningSummary } from '../api/users';

const TONES = {
  'Needs Improvement': 'bg-red-100 text-red-700',
  Developing: 'bg-amber-100 text-amber-800',
  Strong: 'bg-emerald-100 text-emerald-800',
};

/**
 * Tutor-facing learning summary (spec section 18).
 *
 * Renders only what the backend agrees to share, and shows the backend's own
 * refusal reason when access is denied — so the tutor understands whether the
 * student hasn't shared, or there's no booking, rather than seeing a blank card.
 */
export default function LearningSummaryCard({ studentId, studentName }) {
  const [summary, setSummary] = useState(null);
  const [denied, setDenied] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDenied(null);
    setSummary(null);

    getLearningSummary(studentId)
      .then((data) => { if (!cancelled) setSummary(data); })
      .catch((err) => {
        if (cancelled) return;
        setDenied(err.response?.data?.message || 'This learning summary is not available.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [studentId]);

  if (loading) {
    return (
      <div className="card">
        <p className="text-sm text-slate-400 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Checking learning summary…
        </p>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-2">
          <BookOpenCheck size={16} /> Learning Summary
        </h2>
        <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <Lock size={13} className="shrink-0 mt-0.5" />
          {denied}
        </p>
        <p className="mt-2 text-[11px] text-slate-400">
          Students choose whether to share their quiz results. Learning data is private by default.
        </p>
      </div>
    );
  }

  const {
    latest_quiz, improvement_delta, weak_topics, developing_topics, strong_topics,
    suggested_focus, notice, student,
  } = summary;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <BookOpenCheck size={16} /> Learning Summary
        </h2>
        <span className="chip bg-emerald-100 text-emerald-800 text-[10px]">
          <ShieldCheck size={11} /> Shared by student
        </span>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        {studentName || student?.full_name}
        {student?.course ? ` · ${student.course}` : ''}
        {student?.year_of_study ? ` · Year ${student.year_of_study}` : ''}
      </p>

      {/* Latest quiz */}
      {latest_quiz ? (
        <div className="rounded-lg bg-slate-50 px-3 py-3 mb-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Latest quiz</p>
              <p className="mt-0.5 text-lg font-bold text-slate-800 leading-none">
                {latest_quiz.score}/{latest_quiz.total_questions}
                <span className="ml-2 text-sm font-medium text-slate-500">{latest_quiz.percentage}%</span>
              </p>
              {latest_quiz.module_code && (
                <p className="mt-1 text-[11px] text-brand-600">{latest_quiz.module_code}</p>
              )}
            </div>
            {improvement_delta !== null && improvement_delta !== undefined && (
              <span className={`chip text-[10px] ${
                improvement_delta > 0 ? 'bg-emerald-100 text-emerald-800'
                : improvement_delta < 0 ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-200 text-slate-600'
              }`}>
                <TrendingUp size={11} />
                {improvement_delta > 0 ? '+' : ''}{improvement_delta} pts
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 mb-3">No completed quizzes yet.</p>
      )}

      {/* Suggested focus */}
      {suggested_focus && (
        <div className="rounded-lg bg-brand-50 border border-brand-100 px-3 py-2 mb-3">
          <p className="text-[11px] font-semibold text-brand-700 flex items-center gap-1.5">
            <Target size={12} /> Suggested session focus
          </p>
          <p className="mt-1 text-xs text-slate-600">{suggested_focus}</p>
        </div>
      )}

      {/* Topic groups */}
      <div className="space-y-2.5">
        <TopicGroup label="Needs Improvement" topics={weak_topics} />
        <TopicGroup label="Developing" topics={developing_topics} />
        <TopicGroup label="Strong" topics={strong_topics} />
      </div>

      {notice && <p className="mt-3 text-[11px] text-slate-400">{notice}</p>}
    </div>
  );
}

function TopicGroup({ label, topics }) {
  if (!topics || topics.length === 0) return null;

  return (
    <div>
      <p className="text-[11px] font-medium text-slate-500 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {topics.map((t) => (
          <span key={`${t.module_code}-${t.topic}`} className={`chip text-[10px] ${TONES[t.status] || TONES.Developing}`}>
            {t.topic} · {t.score_percentage}%
          </span>
        ))}
      </div>
    </div>
  );
}
