import { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Sparkles, Upload, FileText, BrainCircuit, Layers, Headphones, Video,
  Loader2, CheckCircle2, X, FlaskConical,
} from 'lucide-react';
import { listMaterials, uploadStudyMaterial, getResource } from '../api/study';
import { generateQuiz, listQuizzes } from '../api/quizzes';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

const RESOURCES = [
  { kind: 'quiz', label: 'Generate Quiz', icon: BrainCircuit, blurb: 'AI-generated quiz from your material', live: true },
  { kind: 'notes', label: 'Study Notes', icon: FileText, blurb: 'Summarised key concepts', live: false },
  { kind: 'flashcards', label: 'Flashcards', icon: Layers, blurb: 'Quick review cards', live: false },
  { kind: 'audio', label: 'Audio Notes', icon: Headphones, blurb: 'Listen while you commute', live: false },
  { kind: 'video', label: 'Video Revision Script', icon: Video, blurb: 'Scripted walkthrough', live: false },
];

export default function AIStudy() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [materials, setMaterials] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState('');
  const [resource, setResource] = useState(null);
  const [resourceLoading, setResourceLoading] = useState('');

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const [mats, qs] = await Promise.all([listMaterials(), listQuizzes()]);
      setMaterials(mats);
      setQuizzes(qs);
      setSelectedId((prev) => prev || mats[0]?.id || null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const selected = materials.find((m) => m.id === selectedId) || null;

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const created = await uploadStudyMaterial(file);
      await load();
      setSelectedId(created.id);
    } catch (err) {
      setUploadError(err.response?.data?.message || err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleGenerateQuiz() {
    if (!selected) return;
    setGenerating(true);
    setActionError('');
    try {
      const { quiz } = await generateQuiz({ study_material_id: selected.id, question_count: 10 });
      navigate(`/ai-study/quiz/${quiz.id}`);
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not generate a quiz.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleResource(kind) {
    if (!selected) return;
    if (kind === 'quiz') return handleGenerateQuiz();
    setResourceLoading(kind);
    setActionError('');
    try {
      setResource(await getResource(selected.id, kind));
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not load that resource.');
    } finally {
      setResourceLoading('');
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading your study area…</p>;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Sparkles size={20} className="text-brand-600" /> AI Study Assistant
        </h1>
        <p className="text-sm text-slate-500">
          Upload study material, generate a quiz, and find out exactly which topics to work on.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Generated questions are practice only, not past or predicted exam papers.{' '}
          <Link to="/academic-integrity" className="font-medium text-brand-700 hover:underline">
            AI use and academic integrity
          </Link>
        </p>
      </div>

      {/* Upload */}
      <div className="card border-dashed border-2 border-slate-200 text-center py-8">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Upload size={22} />
        </div>
        <p className="text-sm font-semibold text-slate-700">Upload Study Material</p>
        <p className="text-xs text-slate-400 mt-1">PDF, DOCX or PPTX. Your materials are private to you.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="btn-secondary">
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploading ? 'Uploading…' : 'Choose file'}
          </button>
          <span className="text-xs text-slate-400">or use the sample material below</span>
        </div>
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.pptx" onChange={handleUpload} className="hidden" />
        {uploadError && <p className="mt-3 text-xs text-red-600">{uploadError}</p>}
      </div>

      {/* Material picker */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Your Study Material</h2>
        {materials.length === 0 ? (
          <EmptyState icon={FileText} title="No materials yet" description="Upload a file to get started." />
        ) : (
          <div className="space-y-2">
            {materials.map((m) => {
              const isSelected = m.id === selectedId;
              return (
                <button key={m.id} onClick={() => { setSelectedId(m.id); setResource(null); }}
                  className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                    isSelected ? 'border-brand-500 bg-brand-50/50' : 'border-slate-200 hover:bg-slate-50'
                  }`}>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    isSelected ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <FileText size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">{m.filename}</p>
                      {m.is_sample && (
                        <span className="chip bg-brand-100 text-brand-700 text-[10px]">Demo Content</span>
                      )}
                    </div>
                    {m.description && <p className="mt-0.5 text-xs text-slate-500">{m.description}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.page_count && <span className="chip bg-slate-100 text-slate-500 text-[10px]">{m.page_count} pages</span>}
                      {(m.topics || []).map((t) => (
                        <span key={t} className="chip bg-slate-100 text-slate-500 text-[10px]">{t}</span>
                      ))}
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 size={17} className="text-brand-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Resource actions */}
      {selected && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Sparkles size={15} className="text-brand-600" /> Generate Learning Resources
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {RESOURCES.map(({ kind, label, icon: Icon, blurb, live }) => (
              <button key={kind} onClick={() => handleResource(kind)}
                disabled={generating || resourceLoading === kind}
                className="card text-left hover:border-brand-300 transition-colors disabled:opacity-60">
                <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${
                  live ? 'bg-brand-600 text-white' : 'bg-amber-50 text-amber-600'
                }`}>
                  {(generating && kind === 'quiz') || resourceLoading === kind
                    ? <Loader2 size={17} className="animate-spin" />
                    : <Icon size={17} />}
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">{label}</p>
                  {!live && <span className="chip bg-amber-100 text-amber-800 text-[10px]">Simulated</span>}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">{blurb}</p>
                {live && (
                  <p className="mt-2 text-[11px] font-medium text-brand-600">
                    {generating ? 'Generating…' : 'Start now →'}
                  </p>
                )}
              </button>
            ))}
          </div>
          {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
        </div>
      )}

      {/* Simulated resource viewer */}
      {resource && <ResourceViewer resource={resource} onClose={() => setResource(null)} />}

      {/* Past quizzes */}
      {quizzes.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Your Quizzes</h2>
          <div className="space-y-2">
            {quizzes.map((q) => (
              <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-700">{q.title}</p>
                    <span className={`chip text-[10px] ${
                      q.source === 'deepseek' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {q.source === 'deepseek' ? 'AI generated' : 'Sample question bank'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {q.question_count} questions · {q.attempt_count} attempt{q.attempt_count === 1 ? '' : 's'}
                    {q.latest_attempt ? ` · best/last ${q.latest_attempt.score}/${q.latest_attempt.total_questions}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  {q.latest_attempt && (
                    <button onClick={() => navigate(`/ai-study/quiz/${q.id}/result?attemptId=${q.latest_attempt.id}`)}
                      className="btn-secondary !py-1.5 !px-3 text-xs">Results</button>
                  )}
                  <button onClick={() => navigate(`/ai-study/quiz/${q.id}`)}
                    className="btn-primary !py-1.5 !px-3 text-xs">
                    {q.attempt_count > 0 ? 'Retake' : 'Start'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResourceViewer({ resource, onClose }) {
  const { kind, content, notice, material_name } = resource;

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 capitalize flex items-center gap-2">
            {kind === 'notes' ? 'Study Notes' : kind === 'flashcards' ? 'Flashcards' : kind === 'audio' ? 'Audio Notes' : 'Video Revision Script'}
            <span className="chip bg-amber-100 text-amber-800 text-[10px]">
              <FlaskConical size={11} /> Simulated
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{material_name}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={17} /></button>
      </div>

      <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800 mb-4">
        {notice}
      </div>

      {kind === 'notes' && (
        <div className="space-y-4">
          {content.sections.map((s) => (
            <div key={s.heading}>
              <p className="text-sm font-semibold text-slate-700">{s.heading}</p>
              <ul className="mt-1 space-y-1 list-disc list-inside text-sm text-slate-600">
                {s.points.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
              <p className="mt-1 text-[11px] text-slate-400">Pages {s.source_pages.join(', ')}</p>
            </div>
          ))}
        </div>
      )}

      {kind === 'flashcards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {content.cards.map((c, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-800">{c.front}</p>
              <p className="mt-1 text-xs text-slate-600">{c.back}</p>
              <p className="mt-2 text-[10px] text-slate-400">{c.topic} · p.{c.source_page}</p>
            </div>
          ))}
        </div>
      )}

      {kind === 'audio' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-3">
            <Headphones size={18} className="text-slate-400" />
            <div className="flex-1">
              <div className="h-1.5 rounded-full bg-slate-200">
                <div className="h-1.5 w-0 rounded-full bg-brand-500" />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                0:00 / {Math.floor(content.duration_seconds / 60)}:{String(content.duration_seconds % 60).padStart(2, '0')}
                {' '}· playback not available in this prototype
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {content.transcript.map((line, i) => (
              <p key={i} className="text-sm text-slate-600">{line}</p>
            ))}
          </div>
        </div>
      )}

      {kind === 'video' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Estimated runtime {content.estimated_runtime}</p>
          {content.scenes.map((s) => (
            <div key={s.scene} className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold text-brand-600">Scene {s.scene}</p>
              <p className="mt-1 text-xs font-medium text-slate-700">{s.visual}</p>
              <p className="mt-1 text-sm text-slate-600">{s.narration}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
