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
  messages: Message[];
  newMessage: string;
  onNewMessageChange: (value: string) => void;
  onSendMessage: () => void;
  sending: boolean;
  messageError: string | null;
}

export const ChatTab: React.FC<ChatTabProps> = ({
  projectId,
  projectStatus,
  clientName,
  accessToken,
  messages,
  newMessage,
  onNewMessageChange,
  onSendMessage,
  sending,
  messageError,
}) => {
  const isAwarded = projectStatus === 'awarded';
  const [chatMode, setChatMode] = useState<'project' | 'direct'>('project');

  if (!isAwarded) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Team chat will be available once your quote is awarded.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-slate-900">Project Chat</h2>
          <p className="text-sm text-slate-600">Communicate with your client and project team</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="p-4 border-b border-slate-200">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Chat with:</label>
          <select
            value={chatMode}
            onChange={(e) => setChatMode(e.target.value === 'direct' ? 'direct' : 'project')}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="project">Project (Team chat)</option>
            <option value="direct">Direct with client</option>
          </select>
        </div>

        {chatMode === 'project' && (
          <div>
            <div className="p-4 bg-blue-50">
              <p className="text-sm text-blue-700">Chat with the full project team</p>
            </div>
            {projectId && accessToken && (
              <ProjectChat
                projectId={projectId}
                currentUserRole="professional"
                accessToken={accessToken}
              />
            )}
          </div>
        )}

        {chatMode === 'direct' && (
          <div className="bg-amber-50 border-t border-amber-200">
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

              {messageError && (
                <div className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-amber-800">
                  {messageError}
                </div>
              )}

              <div className="max-h-96 overflow-y-auto space-y-3 border border-slate-200 rounded-lg p-4 bg-white">
                {messages.length === 0 ? (
                  <div className="text-center text-sm text-slate-500">
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
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 border border-slate-200 text-slate-800'
                        }`}
                      >
                        <p>{msg.content}</p>
                        <p
                          className={`text-xs mt-1 ${
                            msg.senderType === 'professional' ? 'text-blue-100' : 'text-slate-500'
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
                    if (e.key === 'Enter' && !sending) {
                      onSendMessage();
                    }
                  }}
                  placeholder="Type your message..."
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  disabled={sending}
                />
                <button
                  type="button"
                  onClick={onSendMessage}
                  disabled={sending || !newMessage.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
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
