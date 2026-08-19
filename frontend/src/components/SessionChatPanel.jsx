import { useEffect, useRef, useState, useCallback } from 'react';
import { Send, MessageSquare, Lock } from 'lucide-react';
import { listMessages, sendMessage } from '../api/sessions';
import { useAuth } from '../context/AuthContext.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';
import ErrorState from './ErrorState';

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return 'Today';
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

/**
 * In-app session chat (spec section 14). Loads history over REST, then
 * receives new messages live via the shared WebSocket in RealtimeContext.
 *
 * Access is enforced by the backend on every read and write — if the current
 * user isn't a session member the fetch returns 403 and this panel shows a
 * locked state rather than an empty conversation.
 */
export default function SessionChatPanel({ sessionId, disabled, disabledReason }) {
  const { user } = useAuth();
  const { subscribe, connected } = useRealtime();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMessages(await listMessages(sessionId));
    } catch (err) {
      setError(err.response?.status === 403
        ? 'You do not have access to this session chat.'
        : 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // Live updates: append any chat message for this session that we don't already have.
  useEffect(() => subscribe((payload) => {
    if (payload.type !== 'chat_message' || payload.session_id !== sessionId) return;
    setMessages((prev) => (
      prev.some((m) => m.id === payload.message.id) ? prev : [...prev, payload.message]
    ));
  }), [subscribe, sessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    try {
      const sent = await sendMessage(sessionId, text);
      setDraft('');
      // Add immediately in case the socket echo is slow or unavailable.
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send that message.');
    } finally {
      setSending(false);
    }
  }

  if (error && messages.length === 0) {
    return <ErrorState message={error} onRetry={load} />;
  }

  let lastDate = null;

  return (
    <div className="card flex flex-col p-0 overflow-hidden" style={{ height: '30rem' }}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <MessageSquare size={16} /> Session Chat
        </h2>
        <span className={`flex items-center gap-1 text-[11px] ${connected ? 'text-emerald-600' : 'text-slate-400'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          {connected ? 'Live' : 'Reconnecting'}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {loading ? (
          <p className="text-sm text-slate-400">Loading messages…</p>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquare size={28} className="text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-500">No messages yet</p>
            <p className="text-xs text-slate-400">Say hello and agree what to focus on.</p>
          </div>
        ) : messages.map((m) => {
          const mine = m.sender_id === user?.id;
          const dateLabel = formatDateLabel(m.created_date);
          const showDate = dateLabel !== lastDate;
          lastDate = dateLabel;

          return (
            <div key={m.id}>
              {showDate && (
                <p className="my-2 text-center text-[11px] font-medium text-slate-400">{dateLabel}</p>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%]">
                  {!mine && (
                    <p className="mb-0.5 text-[11px] font-medium text-slate-500">{m.sender?.full_name || 'Member'}</p>
                  )}
                  <div className={`rounded-2xl px-3.5 py-2 text-sm ${
                    mine ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                  }`}>
                    {m.message}
                  </div>
                  <p className={`mt-0.5 text-[10px] text-slate-400 ${mine ? 'text-right' : ''}`}>
                    {formatTime(m.created_date)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {error && messages.length > 0 && (
        <p className="px-5 pb-2 text-xs text-red-600">{error}</p>
      )}

      {disabled ? (
        <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          <Lock size={13} /> {disabledReason || 'This chat is closed.'}
        </div>
      ) : (
        <form onSubmit={handleSend} className="flex gap-2 border-t border-slate-100 px-4 py-3">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            maxLength={2000}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
          />
          <button type="submit" disabled={sending || !draft.trim()} className="btn-primary !px-3">
            <Send size={16} />
            <span className="sr-only">Send</span>
          </button>
        </form>
      )}
    </div>
  );
}
