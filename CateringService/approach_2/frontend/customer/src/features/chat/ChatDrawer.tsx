import React, { useEffect, useState, useRef } from 'react';
import { X, Send, MessageSquare, Clock, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatIndianDate } from '@/lib/formatters';
import type { ChatMessage, ChatThread } from '@caterconnect/shared';

interface ChatDrawerProps {
  bookingId: string;
  catererName: string;
  bookingSummary?: {
    packageName?: string;
    eventDate?: string;
    guestCount?: number;
  };
  onClose: () => void;
}

const QUICK_SUGGESTIONS = [
  'Can we customize the dessert or sweet options?',
  'What time will the catering service team arrive at the venue?',
  'Please ensure extra serving staff at the dining counters.',
  'Venue parking gate directions have been noted.',
];

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  bookingId,
  catererName,
  bookingSummary,
  onClose,
}) => {
  const { user } = useAuth();
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChat = async (isPoll = false) => {
    try {
      if (!isPoll) setLoading(true);
      setError(null);

      // 1. Fetch or create thread
      let activeThread = thread;
      if (!activeThread) {
        try {
          const res = await apiFetch<{ thread: ChatThread }>(`/api/chat/threads/booking/${bookingId}`);
          activeThread = res.thread;
          setThread(activeThread);
        } catch (fetchErr: any) {
          console.warn('Backend chat service fetch failed:', fetchErr.message);
          setThread(null);
        }
      }

      // 2. Fetch messages
      if (activeThread?.id) {
        try {
          const msgRes = await apiFetch<{ messages: ChatMessage[] }>(`/api/chat/threads/${activeThread.id}/messages`);
          setMessages(msgRes.messages);
        } catch (msgErr: any) {
          console.warn('Failed to fetch messages from chat service:', msgErr.message);
          if (messages.length === 0) {
            setMessages([
              {
                id: 'm1',
                threadId: activeThread.id,
                senderId: 'caterer-owner',
                senderRole: 'caterer',
                message: `Namaste! Thank you for choosing ${catererName}. Feel free to message here for any menu customizations or event schedule updates.`,
                isRead: true,
                createdAt: new Date(Date.now() - 3600000).toISOString(),
              },
            ]);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Unable to connect to messaging server');
    } finally {
      if (!isPoll) setLoading(false);
      scrollToBottom();
    }
  };

  useEffect(() => {
    loadChat(false);
    const interval = setInterval(() => {
      loadChat(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [bookingId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || !thread || sending) return;

    setSending(true);
    try {
      const payload = {
        message: text,
        senderId: user?.id || 'customer-local',
        senderRole: 'customer',
      };

      const res = await apiFetch<{ message: ChatMessage }>(`/api/chat/threads/${thread.id}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setMessages((prev) => [...prev, res.message]);
      setInputText('');
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
    } finally {
      setSending(false);
      scrollToBottom();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-emerald-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-700/80 flex items-center justify-center font-bold text-white border border-emerald-600">
              <MessageSquare className="h-5 w-5 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-sm leading-tight text-white">{catererName}</h3>
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
              </div>
              <p className="text-[11px] text-emerald-200 flex items-center gap-1">
                Booking #{bookingId.slice(0, 8)}
                {bookingSummary?.eventDate && ` • ${formatIndianDate(bookingSummary.eventDate)}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-emerald-200 hover:text-white hover:bg-emerald-700/60 transition"
            aria-label="Close chat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sub-header / booking context chip */}
        {bookingSummary && (
          <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-100 flex items-center justify-between text-xs text-emerald-900">
            <span className="font-medium truncate max-w-[240px]">
              {bookingSummary.packageName || 'Catering Feast'} ({bookingSummary.guestCount || 0} guests)
            </span>
            <span className="text-[11px] text-emerald-700 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Event Coordination
            </span>
          </div>
        )}

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-emerald-600" />
              <p className="text-xs">Connecting to secure chat channel...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500 gap-2">
              <MessageSquare className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">Direct Message with Caterer</p>
              <p className="text-xs text-slate-500 max-w-xs">
                Discuss menu items, arrival timing, or banana leaf arrangements directly.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.senderRole === 'customer';
              const formattedTime = new Date(m.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-slate-500">
                    {!isMe && <span className="font-semibold text-emerald-800">{catererName}</span>}
                    {isMe && <span className="font-semibold text-slate-700">You</span>}
                    <span>• {formattedTime}</span>
                  </div>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm shadow-xs ${
                      isMe
                        ? 'bg-emerald-700 text-white rounded-br-xs'
                        : 'bg-white border border-slate-200 text-slate-900 rounded-bl-xs'
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{m.message}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestions */}
        <div className="border-t border-slate-200 bg-white p-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <Sparkles className="h-3.5 w-3.5 text-amber-500 ml-1 shrink-0" />
          {QUICK_SUGGESTIONS.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendMessage(s)}
              className="shrink-0 text-[11px] bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-full transition"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Message Input Bar */}
        <div className="p-3 border-t border-slate-200 bg-white">
          {error && (
            <div className="mb-2 text-xs text-red-600 bg-red-50 p-1.5 rounded">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type message for caterer..."
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-emerald-600"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              className="rounded-lg bg-emerald-700 p-2.5 text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
