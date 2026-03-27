'use client';

import React from 'react';
import ProjectChat from '@/components/project-chat';
import ChatImageUploader from '@/components/chat-image-uploader';

interface ProjectProfessional {
  id: string;
  professionalId: string;
  projectId: string;
  status: string;
  professional: {
    id: string;
    email: string;
    fullName?: string;
    businessName?: string;
    phone?: string;
  };
}

interface Message {
  id: string;
  projectProfessionalId: string;
  senderType: 'professional' | 'client' | string;
  content: string;
  attachments?: { url: string; filename: string }[];
  createdAt: string;
}

interface AssistThreadOption {
  id: string;
  status?: 'open' | 'in_progress' | 'closure_pending' | 'closed' | string;
  caseNumber?: string;
  createdAt?: string;
}

interface ChatTabProps {
  projectId: string;
  professionals: ProjectProfessional[];
  accessToken: string;
  selectedProfessional: ProjectProfessional | null;
  onSelectProfessional: (prof: ProjectProfessional | null) => void;
  viewingAssistChat: boolean;
  onViewingAssistChatChange: (viewing: boolean) => void;
  assistRequestId: string | null;
  assistThreads?: AssistThreadOption[];
  onSelectAssistThread?: (assistRequestId: string) => void;
  // Team chat
  messages: Message[];
  newMessage: string;
  onNewMessageChange: (msg: string) => void;
  onSendMessage: () => void;
  loadingMessages: boolean;
  sending: boolean;
  messageError: string | null;
  pendingAttachments: { url: string; filename: string }[];
  onPendingAttachmentsChange: (attachments: { url: string; filename: string }[]) => void;
  // Fitout Hub Assistance
  assistMessages: Message[];
  assistNewMessage: string;
  onAssistNewMessageChange: (msg: string) => void;
  onSendAssistMessage: () => void;
  assistLoading: boolean;
  assistSending: boolean;
  assistError: string | null;
  assistHasMore?: boolean;
  assistLoadingOlder?: boolean;
  onLoadOlderAssistMessages?: () => void;
  assistStatus?: 'open' | 'in_progress' | 'closure_pending' | 'closed' | string | null;
  assistClosureDueAt?: string | null;
  assistResolvedAt?: string | null;
}

export const ChatTab: React.FC<ChatTabProps> = ({
  projectId,
  professionals,
  accessToken,
  selectedProfessional,
  onSelectProfessional,
  viewingAssistChat,
  onViewingAssistChatChange,
  assistRequestId,
  assistThreads = [],
  onSelectAssistThread = () => undefined,
  messages,
  newMessage,
  onNewMessageChange,
  onSendMessage,
  loadingMessages,
  sending,
  messageError,
  pendingAttachments,
  onPendingAttachmentsChange,
  assistMessages,
  assistNewMessage,
  onAssistNewMessageChange,
  onSendAssistMessage,
  assistLoading,
  assistSending,
  assistError,
  assistHasMore = false,
  assistLoadingOlder = false,
  onLoadOlderAssistMessages = () => undefined,
  assistStatus,
  assistClosureDueAt,
  assistResolvedAt,
}) => {
  const hasProfessionals = Array.isArray(professionals) && professionals.length > 0;
  const isAssistView = !hasProfessionals || viewingAssistChat;
  const selectedAssistOptionValue =
    assistRequestId && assistThreads.some((thread) => thread.id === assistRequestId)
      ? `assist-${assistRequestId}`
      : 'fitouthub';

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-white">Project Chat</h2>
          <p className="text-sm text-slate-300">Communicate with all awarded professionals and Fitout Hub</p>
          {!hasProfessionals && (
            <p className="text-xs text-slate-400 mt-1">No professionals invited yet. FoH General chat is still available.</p>
          )}
        </div>

        {/* Chat Mode Selector - Dropdown */}
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 shadow-sm">
          <div className="p-4 border-b border-slate-700">
            <label className="block text-sm font-semibold text-white mb-2">Chat with:</label>
            <select
              value={
                isAssistView
                  ? selectedAssistOptionValue
                  : selectedProfessional
                    ? `professional-${selectedProfessional.id}`
                    : hasProfessionals
                      ? 'project'
                      : 'fitouthub'
              }
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith('assist-')) {
                  const selectedAssistId = val.replace('assist-', '');
                  onSelectAssistThread(selectedAssistId);
                  onViewingAssistChatChange(true);
                  onSelectProfessional(null);
                } else if (val === 'fitouthub') {
                  onViewingAssistChatChange(true);
                  onSelectProfessional(null);
                } else if (val === 'project') {
                  onViewingAssistChatChange(false);
                  onSelectProfessional(null);
                } else {
                  const profId = val.replace('professional-', '');
                  const prof = professionals.find((pp) => pp.id === profId);
                  if (prof) {
                    onSelectProfessional(prof);
                    onViewingAssistChatChange(false);
                  }
                }
              }}
              className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            >
              {hasProfessionals && <option value="project">Project (Team chat)</option>}
              {hasProfessionals && professionals.map((pp) => {
                const displayName = pp.professional.fullName || pp.professional.businessName || pp.professional.email;
                return (
                  <option key={pp.id} value={`professional-${pp.id}`}>
                    {`Contractor — ${displayName}`}
                  </option>
                );
              })}
              <option value="fitouthub">FoH General</option>
              {assistThreads.map((thread) => {
                const caseLabel = thread.caseNumber || `Assist-${thread.id.slice(0, 8)}`;
                const statusLabel = (thread.status || 'open').replace('_', ' ');
                return (
                  <option key={thread.id} value={`assist-${thread.id}`}>
                    {`~ PM Case ${caseLabel} (${statusLabel})`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Team Chat View */}
          {hasProfessionals && !isAssistView && !selectedProfessional && (
            <div>
              <div className="p-4 bg-slate-800 border-b border-slate-700">
                <p className="text-sm text-slate-200">Chat with all awarded professionals</p>
              </div>
              <ProjectChat
                projectId={projectId}
                accessToken={accessToken}
                currentUserRole="client"
              />
            </div>
          )}

          {/* Fitout Hub Assistance View */}
          {isAssistView && (
            <div className="bg-slate-900/40 border-t border-slate-700">
              <div className="p-4 space-y-4">
                  {assistRequestId && (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                      Active PM case: {assistThreads.find((thread) => thread.id === assistRequestId)?.caseNumber || assistRequestId}
                    </div>
                  )}
                {assistError && (
                  <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
                    {assistError}
                  </div>
                )}

                {(assistStatus === 'closure_pending' || assistStatus === 'closed') && (
                  <div className="rounded-md border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
                    {assistStatus === 'closure_pending'
                      ? `Fitout Hub marked this assistance thread as pending closure${assistClosureDueAt ? ` (auto-close after ${new Date(assistClosureDueAt).toLocaleString()})` : ''}. Send a message here if you still need help.`
                      : `This assistance thread was closed${assistResolvedAt ? ` on ${new Date(assistResolvedAt).toLocaleString()}` : ''}. Send a message here to reopen it.`}
                  </div>
                )}

                {/* Assist Messages */}
                <div className="max-h-96 overflow-y-auto space-y-3 border border-slate-700 rounded-lg p-4 bg-slate-800/60">
                  {assistHasMore && !assistLoading && (
                    <div className="flex justify-center pb-2">
                      <button
                        type="button"
                        onClick={onLoadOlderAssistMessages}
                        disabled={assistLoadingOlder}
                        className="rounded-md border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                      >
                        {assistLoadingOlder ? 'Loading…' : 'Load older messages'}
                      </button>
                    </div>
                  )}
                  {assistLoading ? (
                    <div className="text-center text-sm text-slate-400">Loading messages...</div>
                  ) : assistMessages.length === 0 ? (
                    <div className="text-center text-sm text-slate-400">
                      No messages yet. Reach out to Fitout Hub for assistance!
                    </div>
                  ) : (
                    assistMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.senderType === 'client' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                            msg.senderType === 'client'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-900 border border-slate-700 text-white'
                          }`}
                        >
                          <p>{msg.content}</p>
                          <p className={`text-xs mt-1 ${msg.senderType === 'client' ? 'text-emerald-100' : 'text-slate-400'}`}>
                            {new Date(msg.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Send Assist Message */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={assistNewMessage}
                    onChange={(e) => onAssistNewMessageChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !assistSending) {
                        onSendAssistMessage();
                      }
                    }}
                    placeholder="Ask Fitout Hub for help..."
                    className="flex-1 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    disabled={assistSending}
                  />
                  <button
                    onClick={onSendAssistMessage}
                    disabled={assistSending || !assistNewMessage.trim()}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {assistSending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Private Chat with Professional View */}
          {hasProfessionals && !isAssistView && selectedProfessional && (
            <div className="bg-slate-900/40 border-t border-slate-700">
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      Private Chat with {selectedProfessional.professional.fullName || selectedProfessional.professional.businessName || selectedProfessional.professional.email}
                    </h3>
                    <p className="text-xs text-slate-300">Only visible to you, this professional, and Fitout Hub</p>
                  </div>
                  <button
                    onClick={() => onSelectProfessional(null)}
                    className="text-slate-300 hover:text-white ml-auto"
                    title="Back to contacts"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>

                {messageError && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-200">
                    {messageError}
                  </div>
                )}

                {/* Messages */}
                <div className="max-h-96 overflow-y-auto space-y-3 border border-slate-700 rounded-lg p-4 bg-slate-800/60">
                  {loadingMessages ? (
                    <div className="text-center text-sm text-slate-400">Loading messages...</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-sm text-slate-400">
                      No messages yet. Start the conversation!
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.senderType === 'client' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                            msg.senderType === 'client'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-900 border border-slate-700 text-white'
                          }`}
                        >
                          {msg.content && <p>{msg.content}</p>}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className={`${msg.content ? 'mt-2' : ''} flex flex-wrap gap-2`}>
                              {msg.attachments.map((att, i) => (
                                <a
                                  key={i}
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block"
                                >
                                  <img
                                    src={att.url}
                                    alt={att.filename}
                                    className="w-24 h-24 rounded border border-slate-600 hover:opacity-80 transition object-cover"
                                    title={att.filename}
                                  />
                                </a>
                              ))}
                            </div>
                          )}
                          <p className={`text-xs mt-1 ${msg.senderType === 'client' ? 'text-emerald-100' : 'text-slate-400'}`}>
                            {new Date(msg.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Send Message - Disabled if professional declined */}
                {selectedProfessional.status === 'declined' ? (
                  <div className="p-3 rounded-md bg-rose-500/15 border border-rose-500/40 text-rose-200 text-sm">
                    This professional has declined the project. This chat is read-only.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Image uploader */}
                    <div>
                      <ChatImageUploader
                        onImagesUploaded={(images) => onPendingAttachmentsChange([...pendingAttachments, ...images])}
                        maxImages={3}
                        disabled={sending || loadingMessages}
                        projectId={projectId}
                      />
                    </div>

                    {/* Show pending attachments */}
                    {pendingAttachments.length > 0 && (
                      <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700">
                        <div className="text-xs text-slate-300 mb-2 font-medium">
                          {pendingAttachments.length} image{pendingAttachments.length > 1 ? 's' : ''} ready to send
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {pendingAttachments.map((att, i) => (
                            <div key={i} className="relative group">
                              <img 
                                src={att.url} 
                                alt={att.filename} 
                                className="w-16 h-16 object-cover rounded border border-slate-600"
                              />
                              <button
                                type="button"
                                onClick={() => onPendingAttachmentsChange(pendingAttachments.filter((_, idx) => idx !== i))}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs hover:bg-red-600 shadow-md"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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
                        className="flex-1 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                        disabled={sending}
                      />
                      <button
                        onClick={onSendMessage}
                        disabled={(!newMessage.trim() && pendingAttachments.length === 0) || sending}
                        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {sending ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
