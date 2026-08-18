import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { roleHome } from '../components/ProtectedRoute.jsx';
import { apiErrorMessage } from '../api/errors';

const DEMO_ACCOUNTS = [
  { label: 'Tutee — Jinyu Chen', email: 'jinyu@student.demo' },
  { label: 'Tutor — Alex Tan', email: 'alex@tutor.demo' },
  { label: 'Admin — Ms Lim', email: 'lecturer@admin.demo' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(email, password);
      const target = location.state?.from?.pathname || roleHome(user.role);
      navigate(target, { replace: true });
    } catch (err) {
      // Only claim bad credentials when the server actually said so — a
      // transport failure gets its own message from apiErrorMessage.
      setError(apiErrorMessage(err, 'Invalid email or password'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white mb-3">
            <GraduationCap size={26} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">PeerLink NYP</h1>
          <p className="text-sm text-slate-400">AI-assisted peer tutoring</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@student.demo"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            <LogIn size={16} />
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="card mt-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">Demo accounts (password: demo1234)</p>
          <div className="space-y-1">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => setEmail(acc.email)}
                className="block w-full text-left text-sm text-brand-700 hover:underline"
              >
                {acc.label} — {acc.email}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          New student?{' '}
          <Link to="/register" className="text-brand-600 font-medium hover:underline">
            Create a tutee account
          </Link>
        </p>
      </div>
    </div>
  );
}
