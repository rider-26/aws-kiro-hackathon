import { NavLink, useNavigate, Link } from 'react-router-dom';
import {
  GraduationCap, Home, Search, Users, Sparkles, CalendarCheck, MessageSquare,
  LineChart, Bell, UserRound, LayoutDashboard, Inbox, CalendarClock, Star,
  ShieldCheck, BookOpen, FileWarning, BarChart3, LogOut, Award,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';

const TUTEE_NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/find-tutors', label: 'Find Tutors', icon: Search },
  { to: '/group-sessions', label: 'Group Sessions', icon: Users },
  { to: '/ai-study', label: 'AI Study', icon: Sparkles },
  { to: '/bookings', label: 'My Bookings', icon: CalendarCheck },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/progress', label: 'Progress', icon: LineChart },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/reports', label: 'My Reports', icon: FileWarning },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

const TUTOR_NAV = [
  { to: '/tutor', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tutor/requests', label: 'Requests', icon: Inbox },
  { to: '/tutor/sessions', label: 'Sessions', icon: CalendarClock },
  { to: '/tutor/availability', label: 'Availability', icon: CalendarCheck },
  { to: '/tutor/messages', label: 'Messages', icon: MessageSquare },
  { to: '/tutor/reviews', label: 'Reviews', icon: Star },
  { to: '/reports', label: 'My Reports', icon: FileWarning },
  { to: '/tutor/profile', label: 'Profile', icon: UserRound },
];

const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/tutors', label: 'Tutors', icon: ShieldCheck },
  { to: '/admin/students', label: 'Students', icon: Users },
  { to: '/admin/sessions', label: 'Sessions', icon: CalendarClock },
  { to: '/admin/reports', label: 'Reports', icon: FileWarning },
  { to: '/admin/modules', label: 'Modules', icon: BookOpen },
  { to: '/admin/recognition', label: 'Recognition', icon: Award },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
];

function navForRole(role) {
  if (role === 'Tutor') return TUTOR_NAV;
  if (role === 'Admin') return ADMIN_NAV;
  return TUTEE_NAV;
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { unread } = useRealtime();
  const navigate = useNavigate();
  const nav = navForRole(user?.role);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-slate-100">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <GraduationCap size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 leading-tight">PeerLink</p>
            <p className="text-[11px] text-slate-400 leading-tight">NYP Tutoring</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/' || to === '/tutor' || to === '/admin'}
              className={({ isActive }) =>
                `flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <span className="flex items-center gap-3">
                <Icon size={18} />
                {label}
              </span>
              {label === 'Notifications' && unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-4">
          <Link
            to="/academic-integrity"
            className="mb-3 block rounded-lg bg-slate-50 p-3 text-xs text-slate-500 transition-colors hover:bg-slate-100"
          >
            <p className="font-semibold text-slate-600 mb-1">Academic Integrity</p>
            Tutors guide and explain — they do not complete graded work.
            <span className="mt-1 block font-medium text-brand-700">Read the full notice</span>
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
                {user?.full_name?.[0] || 'U'}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 leading-tight">{user?.full_name}</p>
                <p className="text-[11px] text-slate-400 leading-tight">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
              className="text-slate-400 hover:text-red-600 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6 py-3">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <GraduationCap size={16} />
            </div>
            <p className="text-sm font-bold text-slate-800">PeerLink NYP</p>
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3">
            <NavLink
              to="/notifications"
              className="relative text-slate-400 hover:text-slate-600 transition-colors"
              title="Notifications"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            >
              <Bell size={19} />
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </NavLink>
            <button onClick={handleLogout} className="text-slate-400 hover:text-red-600 transition-colors md:hidden" title="Log out" aria-label="Log out">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-y-auto">{children}</main>

        {/* Every destination is reachable on mobile. This used to render only the
            first five items, which left Progress, Notifications, My Reports and
            Profile with no route in on a phone — so it scrolls horizontally
            instead of truncating. */}
        <nav
          className="md:hidden border-t border-slate-200 bg-white flex overflow-x-auto"
          aria-label="Main navigation"
        >
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/' || to === '/tutor' || to === '/admin'}
              className={({ isActive }) =>
                `relative flex min-w-[72px] shrink-0 flex-col items-center gap-1 px-2 py-2 text-[11px] ${
                  isActive ? 'text-brand-600' : 'text-slate-400'
                }`
              }
            >
              <span className="relative">
                <Icon size={18} />
                {label === 'Notifications' && unread > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
              <span className="whitespace-nowrap">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
