import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, Search, RefreshCw, Send, Calendar, Users, MapPin, ChefHat, ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatIndianDate } from '@/lib/formatters';
import type { ChatMessage } from '@caterconnect/shared';

interface CustomerInboxItem {
  threadId: string;
  bookingId: string;
  bookingStatus: string;
  eventDate: string;
  guestCount: number;
  caterer: {
    id: string;
    businessName: string;
    city: string;
  };
  lastMessage: {
    text: string;
    senderRole: string;
  } | null;
  lastMessageAt: string;
}

export const CustomerChatHub: React.FC = () => {
  const [inbox, setInbox] = useState<CustomerInboxItem[]>([]);
  const [selectedThread, setSelectedThread] = useState<CustomerInboxItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchInbox = async () => {
    try {
      setLoading(true);
      const res = await apiFetch<{ inbox: CustomerInboxItem[] }>('/api/chat/customer/inbox');
      setInbox(res.inbox || []);
      if (res.inbox && res.inbox.length > 0) {
        // Keep current selected if still present, else pick first
        setSelectedThread((curr) => {
          if (curr) {
            const found = res.inbox.find((i) => i.threadId === curr.threadId);
            return found || res.inbox[0];
          }
          return res.inbox[0];
        });
      }
    } catch (err: any) {
      console.error('Failed to load customer inbox:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInbox();
  }, []);

  const fetchMessages = async (threadId: string) => {
    try {
      setMessagesLoading(true);
      const res = await apiFetch<{ messages: ChatMessage[] }>(`/api/chat/threads/${threadId}/messages`);
      setMessages(res.messages || []);
    } catch (err: any) {
      console.error('Failed to load messages for thread:', err);
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    if (selectedThread) {
      fetchMessages(selectedThread.threadId);
    }
  }, [selectedThread?.threadId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedThread || sending) return;

    setSending(true);
    try {
      const res = await apiFetch<{ message: ChatMessage }>(`/api/chat/threads/${selectedThread.threadId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: inputText.trim() }),
      });

      setMessages((prev) => [...prev, res.message]);
      setInputText('');

      // Update inbox preview snippet
      setInbox((prev) =>
        prev.map((item) =>
          item.threadId === selectedThread.threadId
            ? {
                ...item,
                lastMessage: { text: res.message.message, senderRole: 'customer' },
                lastMessageAt: new Date().toISOString(),
              }
            : item
        )
      );
    } catch (err: any) {
      alert(err.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const filteredInbox = inbox.filter((i) =>
    (i.caterer?.businessName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (i.caterer?.city || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (i.bookingId || '').includes(searchQuery)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-emerald-600" />
            My Caterer Messages
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Coordinate menus, arrival logistics, and dietary requirements directly with your caterers.
          </p>
        </div>

        <Link
          to="/customer/bookings"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Bookings</span>
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col md:flex-row h-[680px]">
        {/* Left Pane: Conversations List */}
        <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 flex flex-col bg-slate-50/50">
          <div className="p-4 border-b border-slate-200 bg-white">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Conversations ({inbox.length})
              </span>
              <button
                onClick={fetchInbox}
                className="p-1.5 text-slate-400 hover:text-slate-600 transition rounded-lg hover:bg-slate-100"
                title="Refresh messages"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search caterer or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading conversations...</div>
            ) : filteredInbox.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-3">
                <MessageSquare className="h-8 w-8 mx-auto text-slate-300" />
                <p>No caterer conversations found.</p>
                <Link
                  to="/"
                  className="inline-block rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                >
                  Explore Caterers
                </Link>
              </div>
            ) : (
              filteredInbox.map((item) => {
                const isSelected = selectedThread?.threadId === item.threadId;
                return (
                  <button
                    key={item.threadId}
                    onClick={() => setSelectedThread(item)}
                    className={`w-full p-4 text-left transition flex items-start gap-3 ${
                      isSelected
                        ? 'bg-emerald-50/80 border-l-4 border-l-emerald-600'
                        : 'hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="h-10 w-10 shrink-0 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                      {item.caterer?.businessName ? item.caterer.businessName[0].toUpperCase() : 'C'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-xs font-bold text-slate-900 truncate">
                          {item.caterer?.businessName || 'Catering Partner'}
                        </h4>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-emerald-600" />
                          {item.caterer?.city || 'India'}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-slate-400" />
                          {item.guestCount} guests
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 truncate">
                        {item.lastMessage ? (
                          <>
                            <span className="font-semibold text-slate-700">
                              {item.lastMessage.senderRole === 'customer' ? 'You: ' : 'Caterer: '}
                            </span>
                            {item.lastMessage.text}
                          </>
                        ) : (
                          <span className="italic text-slate-400">No messages yet</span>
                        )}
                      </p>

                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[9px] font-bold text-slate-700 capitalize">
                          {item.bookingStatus}
                        </span>
                        {item.eventDate && (
                          <span className="text-[10px] text-slate-400">
                            Event: {formatIndianDate(item.eventDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Selected Conversation & Messaging Box */}
        <div className="flex-1 flex flex-col bg-white">
          {selectedThread ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
                    <ChefHat className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      {selectedThread.caterer?.businessName}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-emerald-600" />
                        {selectedThread.caterer?.city}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-slate-400" />
                        {formatIndianDate(selectedThread.eventDate)}
                      </span>
                      <span>•</span>
                      <span>{selectedThread.guestCount} Guests</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/caterer-profile/${selectedThread.caterer.id}`}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition"
                  >
                    View Menu & Profile &rarr;
                  </Link>
                </div>
              </div>

              {/* Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                {messagesLoading ? (
                  <div className="py-12 text-center text-xs text-slate-400">Loading chat history...</div>
                ) : messages.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                    No messages yet. Send a note to the caterer to discuss special recipes, timings, or logistics.
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = m.senderRole === 'customer';
                    return (
                      <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2 text-xs shadow-2xs ${
                            isMe
                              ? 'bg-emerald-600 text-white rounded-br-none'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                          }`}
                        >
                          <p className="leading-relaxed whitespace-pre-wrap">{m.message}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 px-1">
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type a message to your caterer..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || sending}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50 shadow-2xs"
                >
                  <Send className="h-4 w-4" />
                  <span>{sending ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
              <MessageSquare className="h-12 w-12 text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-600">Select a Conversation</p>
              <p className="text-xs text-slate-400">Choose any caterer conversation from the left to read and send messages.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
