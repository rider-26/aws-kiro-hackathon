import { Link } from 'react-router-dom';
import {
  Bell, CalendarCheck, CalendarX, MessageSquare, Award, Star, ShieldCheck, FileWarning, Clock, CheckCheck,
} from 'lucide-react';
import { useRealtime } from '../context/RealtimeContext.jsx';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';

const ICONS = {
  BookingRequestReceived: CalendarCheck,
  BookingAccepted: CalendarCheck,
  BookingDeclined: CalendarX,
  BookingCancelled: CalendarX,
  SessionApproaching: Clock,
  NewMessage: MessageSquare,
  SessionCompleted: Award,
  ReviewAvailable: Star,
  TutorVerified: ShieldCheck,
  ReportUpdated: FileWarning,
};

const TONES = {
  BookingAccepted: 'bg-emerald-50 text-emerald-600',
  BookingDeclined: 'bg-red-50 text-red-600',
  BookingCancelled: 'bg-slate-100 text-slate-500',
  BookingRequestReceived: 'bg-amber-50 text-amber-600',
  SessionApproaching: 'bg-amber-50 text-amber-600',
  TutorVerified: 'bg-emerald-50 text-emerald-600',
  ReportUpdated: 'bg-red-50 text-red-600',
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Notifications() {
  const {
    notifications, unread, connected, loadError, loadingNotifications,
    markRead, markAllRead, refreshNotifications,
  } = useRealtime();

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Notifications</h1>
          <p className="text-sm text-slate-500">
            {unread > 0 ? `${unread} unread` : 'You are all caught up'}
            <span className={`ml-2 inline-flex items-center gap-1 text-xs ${connected ? 'text-emerald-600' : 'text-slate-400'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              {connected ? 'Live' : 'Offline'}
            </span>
          </p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="btn-secondary !py-1.5 !px-3 text-xs">
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>

      {/* A background refresh failing shouldn't blank a list we already have,
          but the list may now be stale, so say so rather than looking current. */}
      {loadError && notifications.length > 0 && (
        <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {loadError} This list may be out of date.{' '}
          <button onClick={refreshNotifications} className="font-semibold underline">Retry</button>
        </p>
      )}

      {loadingNotifications && notifications.length === 0 && !loadError ? (
        <p className="text-sm text-slate-400">Loading notifications…</p>
      ) : loadError && notifications.length === 0 ? (
        /* Never claim "all caught up" when the request actually failed. */
        <ErrorState message={loadError} onRetry={refreshNotifications} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="Booking updates, messages and session reminders will appear here."
        />
      ) : (
        <div className="card divide-y divide-slate-100 p-0">
          {notifications.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            const tone = TONES[n.type] || 'bg-brand-50 text-brand-600';
            const body = (
              <div className={`flex gap-3 px-5 py-4 ${n.read ? '' : 'bg-brand-50/40'}`}>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                  <Icon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${n.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>
                      {n.title}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-[11px] text-slate-400">{timeAgo(n.created_date)}</span>
                      {!n.read && <span className="h-2 w-2 rounded-full bg-brand-600" aria-label="Unread" />}
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{n.message}</p>
                </div>
              </div>
            );

            return (
              <div key={n.id} onClick={() => !n.read && markRead(n.id)} className="cursor-pointer">
                {n.link ? <Link to={n.link}>{body}</Link> : body}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
