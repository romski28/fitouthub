'use client';

import React, { useState } from 'react';
import ChatEventCard from '@/components/chat-event-card';
import ProjectChat from '@/components/project-chat';
import { parseChatEvent } from '@/lib/chat-event-parser';

interface Message {
  id: string;
  senderType: 'professional' | 'client' | string;
  content: string;
  createdAt: string;
}

interface ChatTabProps {
  tab?: string;
  projectId: string;
  projectStatus: string;
  clientName?: string;
  accessToken?: string;
  messages?: Message[];
  directFirstUnreadMessageId?: string | null;
  newMessage?: string;
  onNewMessageChange?: (value: string) => void;
  onSendMessage?: () => void;
  sending?: boolean;
  messageError?: string | null;
}

export const ChatTab: React.FC<ChatTabProps> = ({
  projectId,
  projectStatus,
  clientName,
  accessToken,
  messages = [],
  directFirstUnreadMessageId = null,
  newMessage = '',
  onNewMessageChange = () => undefined,
  onSendMessage = () => undefined,
  sending = false,
  messageError = null,
}) => {
  const isAwarded = projectStatus === 'awarded';
  const [chatMode, setChatMode] = useState<'project' | 'direct'>(isAwarded ? 'project' : 'direct');
  const directChatLocked = isAwarded;

  return (
    <div className="space-y-4 rounded-3xl border border-[rgba(120,53,15,0.14)] bg-[rgba(239,231,207,0.76)] p-5 shadow-[0_18px_40px_rgba(81,55,32,0.06)]">
      <div>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-slate-900">Project Chat</h2>
          <p className="text-sm text-slate-600">Communicate with your client and project team</p>
        </div>

        <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.75)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[rgba(120,53,15,0.14)]">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Chat with:</label>
          <select
            value={chatMode}
            onChange={(e) => setChatMode(e.target.value === 'direct' ? 'direct' : 'project')}
            className="w-full rounded-lg border border-[rgba(120,53,15,0.2)] bg-[rgba(255,250,240,0.95)] px-3 py-2 text-sm text-slate-900 focus:border-[rgba(120,53,15,0.45)] focus:outline-none"
          >
            <option value="project">Project (Team chat)</option>
            <option value="direct">Direct with client</option>
          </select>
        </div>

        {chatMode === 'project' && (
          <div>
            <div className="p-4 bg-[rgba(255,250,240,0.9)] border-b border-[rgba(120,53,15,0.14)]">
              <p className="text-sm text-slate-700">Chat with the full project team</p>
            </div>
            {!isAwarded ? (
              <div className="p-4">
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Team chat will be available once your quote is awarded.
                </div>
              </div>
            ) : (
              projectId && accessToken && (
                <ProjectChat
                  projectId={projectId}
                  currentUserRole="professional"
                  accessToken={accessToken}
                />
              )
            )}
          </div>
        )}

        {chatMode === 'direct' && (
          <div className="bg-[rgba(255,250,240,0.95)] border-t border-[rgba(120,53,15,0.14)]">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h3 className="font-bold text-amber-900 text-sm">
                    Private Chat with {clientName || 'Client'}
                  </h3>
                  <p className="text-xs text-amber-700">Only visible to you, the client, and Fitout Hub</p>
                </div>
              </div>

              {directChatLocked && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Direct chat is read-only after award. Please use the project chat.
                </div>
              )}

              {messageError && (
                <div className="rounded-2xl border border-rose-400 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {messageError}
                </div>
              )}

              <div className="max-h-96 overflow-y-auto space-y-3 border border-[rgba(120,53,15,0.14)] rounded-2xl p-4 bg-[rgba(255,250,240,0.95)]">
                {messages.length === 0 ? (
                  <div className="text-center text-sm text-slate-500">
                    No messages yet. Start the conversation!
                  </div>
                ) : (
                  messages.map((msg) => {
                    const event = parseChatEvent(msg.content || '');
                    return (
                    <div key={msg.id}>
                      {directFirstUnreadMessageId === msg.id && (
                        <div className="my-2 flex items-center gap-3">
                          <div className="h-px flex-1 bg-amber-300" />
                          <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                            New messages
                          </span>
                          <div className="h-px flex-1 bg-amber-300" />
                        </div>
                      )}
                      <div
                        className={`flex ${msg.senderType === 'professional' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`text-sm ${event ? 'max-w-[86%]' : 'max-w-[75%] rounded-lg px-3 py-2'} ${
                            event
                              ? ''
                              : msg.senderType === 'professional'
                              ? 'bg-[rgba(126,58,33,0.92)] text-white'
                              : 'bg-[rgba(245,238,219,0.75)] border border-[rgba(120,53,15,0.14)] text-slate-700'
                          }`}
                        >
                          {event ? <ChatEventCard event={event} isCurrentUser={msg.senderType === 'professional'} /> : <p>{msg.content}</p>}
                          <p
                            className={`text-xs mt-1 ${
                              msg.senderType === 'professional' ? 'text-amber-100' : 'text-slate-500'
                            }`}
                          >
                            {new Date(msg.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => onNewMessageChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !sending && !directChatLocked) {
                      onSendMessage();
                    }
                  }}
                  placeholder="Type your message..."
                  className="flex-1 rounded-lg border border-[rgba(120,53,15,0.2)] bg-[rgba(255,250,240,0.95)] px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[rgba(120,53,15,0.45)] focus:outline-none"
                  disabled={sending || directChatLocked}
                />
                <button
                  type="button"
                  onClick={onSendMessage}
                  disabled={sending || directChatLocked || !newMessage.trim()}
                  className="rounded-lg bg-[rgba(126,58,33,0.92)] px-4 py-2 text-sm font-semibold text-white hover:bg-[rgba(100,45,26,0.96)] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
