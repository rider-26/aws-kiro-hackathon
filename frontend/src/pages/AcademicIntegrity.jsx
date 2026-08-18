import { Link } from 'react-router-dom';
import {
  ScrollText, Check, X, ShieldAlert, Flag, Award, Sparkles, Lock, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Academic Integrity notice (spec section 31).
 *
 * A standalone, linkable page rather than only a sidebar snippet, so it can be
 * referenced from a report form, a session, or a lecturer briefing. The
 * allowed/not-allowed split is deliberately concrete: "guide, don't do it for
 * them" is too vague to act on, so each row names an actual behaviour.
 */
const ALLOWED = [
  'Explaining a concept in a different way until it makes sense',
  'Working through a similar practice problem together, step by step',
  'Reviewing marked work to understand why an answer was wrong',
  'Sharing study strategies, revision plans and exam techniques',
  'Pointing to lecture slides, textbook sections or documentation',
  'Checking a student\u2019s reasoning and asking questions that expose a gap',
];

const NOT_ALLOWED = [
  'Completing or partially completing graded assignments, labs or projects',
  'Providing answers to an active assessment, quiz or exam',
  'Writing code, essays or reports that a student submits as their own work',
  'Sharing your own submitted work for another student to copy from',
  'Sitting an online assessment on another student\u2019s behalf',
  'Taking payment for tutoring arranged through PeerLink',
];

export default function AcademicIntegrity() {
  const { user } = useAuth();
  const homeLink = user?.role === 'Tutor' ? '/tutor' : user?.role === 'Admin' ? '/admin' : '/';

  return (
    <div className="max-w-3xl space-y-6">
      <Link to={homeLink} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> Back
      </Link>

      <div className="card">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <ScrollText size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Academic Integrity</h1>
            <p className="mt-1 text-sm text-slate-500">
              PeerLink exists to help students understand their modules. Tutors guide and explain — they never
              produce work that another student submits as their own.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 items-start">
        <div className="card border-emerald-100">
          <h2 className="flex items-center gap-2 text-sm font-bold text-emerald-700">
            <Check size={16} /> This is peer tutoring
          </h2>
          <ul className="mt-3 space-y-2">
            {ALLOWED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="card border-red-100">
          <h2 className="flex items-center gap-2 text-sm font-bold text-red-700">
            <X size={16} /> This is academic misconduct
          </h2>
          <ul className="mt-3 space-y-2">
            {NOT_ALLOWED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                <X size={14} className="mt-0.5 shrink-0 text-red-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <ShieldAlert size={16} className="text-amber-600" /> If a line gets crossed
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Either party in a session can report it. Choose the{' '}
          <span className="font-medium text-slate-800">Academic Integrity Concern</span> category so an
          administrator can prioritise it. Reports carry your name and go to an administrator, who can issue a
          warning or suspend an account.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Being asked to breach integrity is itself worth reporting — a tutor pressured into doing someone&apos;s
          assignment should report the request rather than comply.
        </p>
        {user?.role !== 'Admin' && (
          <Link to="/reports" className="btn-secondary mt-3">
            <Flag size={14} /> View reports I&apos;ve filed
          </Link>
        )}
      </div>

      <div className="card">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Sparkles size={16} className="text-brand-600" /> About the AI features
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          The AI study assistant generates practice questions to help you find your weak topics. Those questions
          are practice only — they are not past papers, not predicted exam questions, and not a substitute for
          your lecture material. Using PeerLink does not exempt you from your module&apos;s own rules on AI use;
          check with your lecturer if you are unsure what is permitted for a specific assignment.
        </p>
      </div>

      <div className="card">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Lock size={16} className="text-slate-500" /> Your learning data
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Your quiz answers, scores and uploaded study material are private to you. A tutor sees a summary of
          your weak topics only if you turn on{' '}
          <span className="font-medium text-slate-800">Share Learning Summary</span> and have an active booking
          with them — and you can switch that off at any time, which revokes access immediately.
          Administrators see engagement counts and session attendance, never your answers or your private
          session chats.
        </p>
        {user?.role === 'Tutee' && (
          <Link to="/profile" className="btn-secondary mt-3">
            Manage sharing settings
          </Link>
        )}
      </div>

      <div className="card">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Award size={16} className="text-amber-600" /> Recognition
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          PeerLink records session attendance and duration, and marks sessions that meet the configured criteria
          as <span className="font-medium text-slate-800">Pending Lecturer Approval</span>. PeerLink does not
          award CCA points, credits or certificates. Any recognition is decided by a lecturer outside the
          platform.
        </p>
      </div>

      <p className="text-xs text-slate-400">
        This notice supplements — and does not replace — Nanyang Polytechnic&apos;s own academic integrity
        policy. Where the two differ, the Polytechnic&apos;s policy applies.
      </p>
    </div>
  );
}
