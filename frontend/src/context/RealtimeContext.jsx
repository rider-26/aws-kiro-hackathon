import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../api/notifications';

const RealtimeContext = createContext(null);

/**
 * Owns the single WebSocket connection for the logged-in user and the
 * notification state derived from it.
 *
 * Design notes:
 *  - The socket is authenticated with the JWT as a query param, which is the
 *    only option available to browsers (no custom headers on a WS handshake).
 *  - Real-time is treated as an enhancement, not the source of truth: we always
 *    fetch notifications over REST on mount, and reconnect with backoff. If the
 *    socket never connects, the app still works — it just isn't live.
 *  - Chat messages arriving over the socket are fanned out to subscribers
 *    registered via `subscribe()`, which the session chat panel uses (Task 7).
 */
export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [connected, setConnected] = useState(false);
  // Distinguishes "no notifications" from "couldn't load notifications" — the
  // Notifications page must not show a reassuring empty state after a failure.
  const [loadError, setLoadError] = useState('');
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  const socketRef = useRef(null);
  const reconnectRef = useRef(null);
  const attemptRef = useRef(0);
  const subscribersRef = useRef(new Set());

  const refreshNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const data = await listNotifications();
      setNotifications(data.notifications);
      setUnread(data.unread);
      setLoadError('');
    } catch (err) {
      // Existing state is left in place (a background refresh failing shouldn't
      // blank the list), but the error is surfaced so the Notifications page can
      // say so rather than rendering "you're all caught up".
      setLoadError(err.response?.data?.message || 'Could not load your notifications.');
    } finally {
      setLoadingNotifications(false);
    }
  }, [user]);

  const subscribe = useCallback((handler) => {
    subscribersRef.current.add(handler);
    return () => subscribersRef.current.delete(handler);
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnread(0);
      return undefined;
    }

    refreshNotifications();

    let cancelled = false;

    function connect() {
      const token = localStorage.getItem('peerlink_token');
      if (!token || cancelled) return;

      const base = import.meta.env.VITE_WS_URL || 'ws://localhost:5000/ws';
      const url = `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;

      let socket;
      try {
        socket = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setConnected(true);
      };

      socket.onmessage = (event) => {
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (payload.type === 'notification' && payload.notification) {
          setNotifications((prev) => [payload.notification, ...prev]);
          setUnread((n) => n + 1);
        }

        // Fan out every message (chat, session updates) to subscribers.
        subscribersRef.current.forEach((handler) => {
          try {
            handler(payload);
          } catch {
            // A misbehaving subscriber must not break the socket.
          }
        });
      };

      socket.onclose = () => {
        setConnected(false);
        socketRef.current = null;
        if (!cancelled) scheduleReconnect();
      };

      socket.onerror = () => {
        // onclose always follows, which handles the reconnect.
      };
    }

    function scheduleReconnect() {
      if (cancelled) return;
      attemptRef.current = Math.min(attemptRef.current + 1, 6);
      const delay = Math.min(1000 * 2 ** (attemptRef.current - 1), 30000);
      clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(connect, delay);
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectRef.current);
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      setConnected(false);
    };
  }, [user, refreshNotifications]);

  const markRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((n) => Math.max(0, n - 1));
    try {
      await markNotificationRead(id);
    } catch {
      refreshNotifications();
    }
  }, [refreshNotifications]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch {
      refreshNotifications();
    }
  }, [refreshNotifications]);

  return (
    <RealtimeContext.Provider
      value={{
        notifications, unread, connected, loadError, loadingNotifications,
        refreshNotifications, markRead, markAllRead, subscribe,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used within RealtimeProvider');
  return ctx;
}
