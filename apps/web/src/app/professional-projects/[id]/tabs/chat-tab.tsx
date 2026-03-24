'use client';

import React, { useState } from 'react';
import ProjectChat from '@/components/project-chat';

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
    <div className="space-y-5">
      <div>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-white">Project Chat</h2>
          <p className="text-sm text-slate-300">Communicate with your client and project team</p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/60 shadow-sm">
        <div className="p-4 border-b border-slate-700">
          <label className="block text-sm font-semibold text-slate-200 mb-2">Chat with:</label>
          <select
            value={chatMode}
            onChange={(e) => setChatMode(e.target.value === 'direct' ? 'direct' : 'project')}
            className="w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="project">Project (Team chat)</option>
            <option value="direct">Direct with client</option>
          </select>
        </div>

        {chatMode === 'project' && (
          <div>
            <div className="p-4 bg-slate-800/50 border-b border-slate-700">
              <p className="text-sm text-sky-200">Chat with the full project team</p>
            </div>
            {!isAwarded ? (
              <div className="p-4">
                <div className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
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
          <div className="bg-slate-800/40 border-t border-slate-700">
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-300" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h3 className="font-bold text-amber-200 text-sm">
                    Private Chat with {clientName || 'Client'}
                  </h3>
                  <p className="text-xs text-amber-300">Only visible to you, the client, and Fitout Hub</p>
                </div>
              </div>

              {directChatLocked && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
                  Direct chat is read-only after award. Please use the project chat.
                </div>
              )}

              {messageError && (
                <div className="rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
                  {messageError}
                </div>
              )}

              <div className="max-h-96 overflow-y-auto space-y-3 border border-slate-700 rounded-lg p-4 bg-slate-900/70">
                {messages.length === 0 ? (
                  <div className="text-center text-sm text-slate-400">
                    No messages yet. Start the conversation!
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.senderType === 'professional' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                          msg.senderType === 'professional'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-800 border border-slate-700 text-slate-100'
                        }`}
                      >
                        <p>{msg.content}</p>
                        <p
                          className={`text-xs mt-1 ${
                            msg.senderType === 'professional' ? 'text-emerald-100' : 'text-slate-400'
                          }`}
                        >
                          {new Date(msg.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
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
                  className="flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                  disabled={sending || directChatLocked}
                />
                <button
                  type="button"
                  onClick={onSendMessage}
                  disabled={sending || directChatLocked || !newMessage.trim()}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
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
