import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Guards a route to authenticated users, optionally restricted to specific roles.
 * Unauthenticated users are redirected to /login. Authenticated users of the
 * wrong role are redirected to their own home rather than shown a blank page.
 */
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return children;
}

export function roleHome(role) {
  if (role === 'Tutor') return '/tutor';
  if (role === 'Admin') return '/admin';
  return '/';
}
