import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, XCircle, ArrowRight, BookOpen, Loader2, Sparkles,
} from 'lucide-react';
import { getQuiz, startAttempt, gradeAnswer, submitAttempt } from '../api/quizzes';
import ErrorState from '../components/ErrorState';

const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Quiz runner (spec section 16). After every answer it shows correct/incorrect,
 * the correct answer, the explanation, and the page to review, then a Next
 * Question control.
 *
 * Correctness is always decided by the backend (per-question grade call), never
 * inferred in the browser — so the answer key is never present in the client
 * before the student answers.
 */
export default function QuizPlayer() {
  const { quizId } = useParams();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getQuiz(quizId);
      setQuiz(data.quiz);
      setQuestions(data.questions);
      setAttempt(await startAttempt(quizId));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load this quiz.');
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => { load(); }, [load]);

  const question = questions[index];
  const isLast = index === questions.length - 1;

  async function handleSubmitAnswer() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const result = await gradeAnswer(quizId, {
        question_id: question.id,
        selected_answer: selected,
        attempt_id: attempt?.id,
      });
      setFeedback(result);
      setAnswers((prev) => ({ ...prev, [question.id]: selected }));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not check that answer.');
    } finally {
      setBusy(false);
    }
  }

  async function handleNext() {
    if (!isLast) {
      setIndex((i) => i + 1);
      setSelected(null);
      setFeedback(null);
      return;
    }

    setBusy(true);
    try {
      const result = await submitAttempt(quizId, { attempt_id: attempt?.id, answers });
      navigate(`/ai-study/quiz/${quizId}/result?attemptId=${result.attempt.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit your quiz.');
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-slate-400 flex items-center gap-2">
        <Loader2 size={15} className="animate-spin" /> Preparing your quiz…
      </p>
    );
  }
  if (error && !question) return <ErrorState message={error} onRetry={load} />;
  if (!question) return <ErrorState message="This quiz has no questions." />;

  const progress = Math.round(((index + (feedback ? 1 : 0)) / questions.length) * 100);
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold text-slate-800">{quiz?.title}</h1>
          <span className={`chip text-[10px] ${
            quiz?.source === 'deepseek' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
          }`}>
            <Sparkles size={11} />
            {quiz?.source === 'deepseek' ? 'AI generated' : 'Sample question bank'}
          </span>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">
          Question {index + 1} of {questions.length}
        </p>
        <div className="mt-3 h-1.5 rounded-full bg-slate-200">
          <div className="h-1.5 rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="card space-y-4">
        <div>
          <span className="chip bg-brand-50 text-brand-700 text-[11px]">{question.topic}</span>
          <p className="mt-3 text-base font-medium text-slate-800">{question.question_text}</p>
        </div>

        <div className="space-y-2">
          {LETTERS.map((letter) => {
            const text = question[`option_${letter.toLowerCase()}`];
            if (!text) return null;

            const isSelected = selected === letter;
            const isCorrectAnswer = feedback && feedback.correct_answer === letter;
            const isWrongPick = feedback && isSelected && !feedback.correct;

            let cls = 'border-slate-200 hover:bg-slate-50';
            if (feedback) {
              if (isCorrectAnswer) cls = 'border-emerald-400 bg-emerald-50';
              else if (isWrongPick) cls = 'border-red-300 bg-red-50';
              else cls = 'border-slate-200 opacity-60';
            } else if (isSelected) {
              cls = 'border-brand-500 bg-brand-50';
            }

            return (
              <button key={letter} type="button" disabled={!!feedback}
                onClick={() => setSelected(letter)}
                className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${cls}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isCorrectAnswer ? 'bg-emerald-500 text-white'
                  : isWrongPick ? 'bg-red-500 text-white'
                  : isSelected ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-500'
                }`}>
                  {letter}
                </span>
                <span className="text-slate-700">{text}</span>
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className={`rounded-lg border p-3 ${
            feedback.correct ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
          }`}>
            <p className={`flex items-center gap-2 text-sm font-semibold ${
              feedback.correct ? 'text-emerald-700' : 'text-red-700'
            }`}>
              {feedback.correct ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              {feedback.correct ? 'Correct' : 'Incorrect'}
            </p>
            {!feedback.correct && (
              <p className="mt-1.5 text-sm text-slate-700">
                Correct answer: <span className="font-semibold">{feedback.correct_answer}</span>
              </p>
            )}
            <p className="mt-1.5 text-sm text-slate-600">{feedback.explanation}</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <BookOpen size={12} /> Review page {feedback.source_page}
            </p>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-slate-400">{answeredCount} of {questions.length} answered</p>
          {feedback ? (
            <button onClick={handleNext} disabled={busy} className="btn-primary">
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              {isLast ? (busy ? 'Scoring…' : 'See Results') : 'Next Question'}
              {!busy && <ArrowRight size={15} />}
            </button>
          ) : (
            <button onClick={handleSubmitAnswer} disabled={!selected || busy} className="btn-primary">
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              Check Answer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
