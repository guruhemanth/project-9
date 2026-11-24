import React, { useState, useEffect } from 'react';
import { MessageSquare, Search, Phone, RefreshCw, Send } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { formatIndianDate } from '@/lib/formatters';
import type { ChatMessage } from '@caterconnect/shared';

interface InboxItem {
  threadId: string;
  bookingId: string;
  bookingStatus: string;
  eventDate: string;
  guestCount: number;
  venueAddress: string;
  packageName?: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  lastMessage: {
    text: string;
    senderRole: string;
  } | null;
  lastMessageAt: string;
}

export const PartnerChatHub: React.FC = () => {
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [selectedThread, setSelectedThread] = useState<InboxItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchInbox = async () => {
    try {
      setLoading(true);
      const res = await apiFetch<{ inbox: InboxItem[] }>('/api/chat/caterer/inbox');
      setInbox(res.inbox || []);
      if (!selectedThread && res.inbox && res.inbox.length > 0) {
        setSelectedThread(res.inbox[0]);
      }
    } catch (err: any) {
      console.error('Failed to load chat inbox:', err);
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

      // Update inbox preview
      setInbox((prev) =>
        prev.map((item) =>
          item.threadId === selectedThread.threadId
            ? {
                ...item,
                lastMessage: { text: res.message.message, senderRole: 'caterer' },
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
    (i.customer.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (i.customer.phone || '').includes(searchQuery) ||
    (i.packageName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col md:flex-row h-[700px]">
      {/* Left Sidebar: Multi-Customer Conversations List */}
      <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 flex flex-col bg-slate-50/50">
        <div className="p-4 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-amber-600" />
              Customer Inquiries ({inbox.length})
            </h2>
            <button
              onClick={fetchInbox}
              className="p-1.5 text-slate-400 hover:text-slate-600 transition"
              title="Refresh messages"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by client or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs focus:bg-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Conversations Feed */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading chats...</div>
          ) : filteredInbox.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No conversations found. Chats will appear when customers place orders or inquiries.
            </div>
          ) : (
            filteredInbox.map((item) => {
              const isSelected = selectedThread?.threadId === item.threadId;
              return (
                <div
                  key={item.threadId}
                  onClick={() => setSelectedThread(item)}
                  className={`p-4 cursor-pointer transition flex items-start gap-3 ${
                    isSelected ? 'bg-amber-50/80 border-l-4 border-amber-600' : 'hover:bg-white'
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm shrink-0">
                    {item.customer.name ? item.customer.name[0].toUpperCase() : 'C'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {item.customer.name || 'Client'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {item.eventDate ? formatIndianDate(item.eventDate) : ''}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 truncate">
                      {item.lastMessage ? item.lastMessage.text : 'New booking coordination started'}
                    </p>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600 uppercase">
                        {item.bookingStatus}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {item.guestCount} guests
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Pane: Selected Customer Chat View */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedThread ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-sm">
                  {selectedThread.customer.name ? selectedThread.customer.name[0].toUpperCase() : 'C'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900">{selectedThread.customer.name}</h3>
                    {selectedThread.customer.phone && (
                      <a
                        href={`tel:${selectedThread.customer.phone}`}
                        className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {selectedThread.customer.phone}
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {selectedThread.packageName} • {selectedThread.guestCount} guests • {selectedThread.venueAddress}
                  </p>
                </div>
              </div>

              <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-900">
                Booking #{selectedThread.bookingId.slice(0, 8)}
              </span>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {messagesLoading ? (
                <div className="py-12 text-center text-xs text-slate-400">Loading conversation history...</div>
              ) : messages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                  No messages yet. Send a message to coordinate menu details and venue arrival.
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.senderRole === 'caterer';
                  return (
                    <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 text-xs shadow-2xs ${
                          isMe
                            ? 'bg-amber-600 text-white rounded-br-none'
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

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
              <input
                type="text"
                placeholder="Type your message to customer..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs focus:bg-white focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-amber-700 transition disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span>{sending ? 'Sending...' : 'Send'}</span>
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
            <MessageSquare className="h-12 w-12 text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-600">Select a Customer Conversation</p>
            <p className="text-xs text-slate-400">Choose any inquiry from the left to read and reply.</p>
          </div>
        )}
      </div>
    </div>
  );
};
