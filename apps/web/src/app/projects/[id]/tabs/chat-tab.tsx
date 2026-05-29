'use client';

import React from 'react';
import ProjectChat from '@/components/project-chat';
import ChatImageUploader from '@/components/chat-image-uploader';
import ChatEventCard from '@/components/chat-event-card';
import { parseChatEvent } from '@/lib/chat-event-parser';

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
  privateFirstUnreadMessageId?: string | null;
  newMessage: string;
  onNewMessageChange: (msg: string) => void;
  onSendMessage: () => void;
  loadingMessages: boolean;
  sending: boolean;
  messageError: string | null;
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
  uploaderClearKey?: number;
  // Mimo Assistance
  assistMessages: Message[];
  assistFirstUnreadMessageId?: string | null;
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
  privateFirstUnreadMessageId = null,
  newMessage,
  onNewMessageChange,
  onSendMessage,
  loadingMessages,
  sending,
  messageError,
  pendingFiles,
  onPendingFilesChange,
  uploaderClearKey = 0,
  assistMessages,
  assistFirstUnreadMessageId = null,
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
          <h2 className="text-lg font-bold text-slate-900">Project Chat</h2>
          <p className="text-sm text-slate-600">Communicate with all awarded professionals and Mimo</p>
          {!hasProfessionals && (
            <p className="mt-1 text-xs text-slate-600">No professionals invited yet. FoH General chat is still available.</p>
          )}
        </div>

        {/* Chat Mode Selector - Dropdown */}
        <div className="rounded-xl border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.78)] shadow-sm">
          <div className="border-b border-[rgba(120,53,15,0.14)] p-4">
            <label className="mb-2 block text-sm font-semibold text-slate-800">Chat with:</label>
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
              className="w-full rounded-md border border-[rgba(120,53,15,0.2)] bg-white px-3 py-2 text-sm text-slate-800 focus:border-[rgba(215,107,78,0.75)] focus:outline-none"
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
              <div className="border-b border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.82)] p-4">
                <p className="text-sm text-slate-700">Chat with all awarded professionals</p>
              </div>
              <ProjectChat
                projectId={projectId}
                accessToken={accessToken}
                currentUserRole="client"
              />
            </div>
          )}

          {/* Mimo Assistance View */}
          {isAssistView && (
            <div className="border-t border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.6)]">
              <div className="p-4 space-y-4">
                  {assistRequestId && (
                    <div className="rounded-md border border-[rgba(215,107,78,0.35)] bg-[rgba(255,240,232,0.9)] px-3 py-2 text-xs text-[rgba(176,74,46,0.95)]">
                      Active PM case: {assistThreads.find((thread) => thread.id === assistRequestId)?.caseNumber || assistRequestId}
                    </div>
                  )}
                {assistError && (
                  <div className="mb-3 rounded-md border border-[rgba(194,110,37,0.35)] bg-[rgba(255,245,224,0.9)] px-3 py-2 text-sm text-[rgba(144,86,30,0.95)]">
                    {assistError}
                  </div>
                )}

                {(assistStatus === 'closure_pending' || assistStatus === 'closed') && (
                  <div className="rounded-md border border-[rgba(215,107,78,0.35)] bg-[rgba(255,240,232,0.9)] px-3 py-2 text-sm text-[rgba(176,74,46,0.95)]">
                    {assistStatus === 'closure_pending'
                      ? `Mimo marked this assistance thread as pending closure${assistClosureDueAt ? ` (auto-close after ${new Date(assistClosureDueAt).toLocaleString()})` : ''}. Send a message here if you still need help.`
                      : `This assistance thread was closed${assistResolvedAt ? ` on ${new Date(assistResolvedAt).toLocaleString()}` : ''}. Send a message here to reopen it.`}
                  </div>
                )}

                {/* Assist Messages */}
                <div className="max-h-96 space-y-3 overflow-y-auto rounded-lg border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.84)] p-4">
                  {assistHasMore && !assistLoading && (
                    <div className="flex justify-center pb-2">
                      <button
                        type="button"
                        onClick={onLoadOlderAssistMessages}
                        disabled={assistLoadingOlder}
                        className="rounded-md border border-[rgba(120,53,15,0.2)] bg-[rgba(245,238,219,0.92)] px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-[rgba(239,231,207,0.95)] disabled:opacity-50"
                      >
                        {assistLoadingOlder ? 'Loading…' : 'Load older messages'}
                      </button>
                    </div>
                  )}
                  {assistLoading ? (
                    <div className="text-center text-sm text-slate-600">Loading messages...</div>
                  ) : assistMessages.length === 0 ? (
                    <div className="text-center text-sm text-slate-600">
                      No messages yet. Reach out to Mimo for assistance!
                    </div>
                  ) : (
                    assistMessages.map((msg) => (
                      <div key={msg.id}>
                        {assistFirstUnreadMessageId === msg.id && (
                          <div className="my-2 flex items-center gap-3">
                            <div className="h-px flex-1 bg-[rgba(215,107,78,0.35)]" />
                            <span className="shrink-0 rounded-full border border-[rgba(215,107,78,0.35)] bg-[rgba(255,240,232,0.9)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[rgba(176,74,46,0.95)]">
                              New messages
                            </span>
                            <div className="h-px flex-1 bg-[rgba(215,107,78,0.35)]" />
                          </div>
                        )}

                        <div
                          className={`flex ${msg.senderType === 'client' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                              msg.senderType === 'client'
                                ? 'bg-[rgba(215,107,78,0.95)] text-white'
                                : 'border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.95)] text-slate-800'
                            }`}
                          >
                            <p>{msg.content}</p>
                            <p className={`mt-1 text-xs ${msg.senderType === 'client' ? 'text-[rgba(255,244,238,0.95)]' : 'text-slate-600'}`}>
                              {new Date(msg.createdAt).toLocaleString()}
                            </p>
                          </div>
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
                    placeholder="Ask Mimo for help..."
                    className="flex-1 rounded-md border border-[rgba(120,53,15,0.2)] bg-white px-3 py-2 text-sm text-slate-800 focus:border-[rgba(215,107,78,0.75)] focus:outline-none"
                    disabled={assistSending}
                  />
                  <button
                    onClick={onSendAssistMessage}
                    disabled={assistSending || !assistNewMessage.trim()}
                    className="rounded-md bg-[rgba(215,107,78,0.95)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[rgba(176,74,46,0.98)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {assistSending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Private Chat with Professional View */}
          {hasProfessionals && !isAssistView && selectedProfessional && (
            <div className="border-t border-[rgba(120,53,15,0.14)] bg-[rgba(245,238,219,0.6)]">
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="h-4 w-4 text-[rgba(215,107,78,0.95)]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Private Chat with {selectedProfessional.professional.fullName || selectedProfessional.professional.businessName || selectedProfessional.professional.email}
                    </h3>
                    <p className="text-xs text-slate-600">Only visible to you, this professional, and Mimo</p>
                  </div>
                  <button
                    onClick={() => onSelectProfessional(null)}
                    className="ml-auto text-slate-600 hover:text-slate-900"
                    title="Back to contacts"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>

                {messageError && (
                  <div className="rounded-md border border-[rgba(194,110,37,0.35)] bg-[rgba(255,245,224,0.9)] px-3 py-2 text-sm text-[rgba(144,86,30,0.95)]">
                    {messageError}
                  </div>
                )}

                {/* Messages */}
                <div className="max-h-96 space-y-3 overflow-y-auto rounded-lg border border-[rgba(120,53,15,0.14)] bg-[rgba(255,250,240,0.84)] p-4">
                  {loadingMessages ? (
                    <div className="text-center text-sm text-slate-600">Loading messages...</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-sm text-slate-600">
                      No messages yet. Start the conversation!
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const event = parseChatEvent(msg.content || '');
                      return (
                      <div key={msg.id}>
                        {privateFirstUnreadMessageId === msg.id && (
                          <div className="my-2 flex items-center gap-3">
                            <div className="h-px flex-1 bg-[rgba(215,107,78,0.35)]" />
                            <span className="shrink-0 rounded-full border border-[rgba(215,107,78,0.35)] bg-[rgba(255,240,232,0.9)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[rgba(176,74,46,0.95)]">
                              New messages
                            </span>
                            <div className="h-px flex-1 bg-[rgba(215,107,78,0.35)]" />
                          </div>
                        )}

                        <div
                          className={`flex ${msg.senderType === 'client' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`text-sm ${event ? 'max-w-[86%]' : 'max-w-[75%] rounded-lg px-3 py-2'} ${
                              event
                                ? ''
                                : msg.senderType === 'client'
                                ? 'bg-[rgba(215,107,78,0.95)] text-white'
                                : 'border border-[rgba(120,53,15,0.18)] bg-[rgba(245,238,219,0.95)] text-slate-800'
                            }`}
                          >
                            {event ? (
                              <ChatEventCard event={event} isCurrentUser={msg.senderType === 'client'} />
                            ) : (
                              <>
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
                                          className="h-24 w-24 rounded border border-[rgba(120,53,15,0.2)] object-cover transition hover:opacity-80"
                                          title={att.filename}
                                        />
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                            <p className={`mt-1 text-xs ${msg.senderType === 'client' ? 'text-[rgba(255,244,238,0.95)]' : 'text-slate-600'}`}>
                              {new Date(msg.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                    })
                  )}
                </div>

                {/* Send Message - Disabled if professional declined */}
                {selectedProfessional.status === 'declined' ? (
                  <div className="rounded-md border border-[rgba(215,107,78,0.4)] bg-[rgba(255,240,232,0.92)] p-3 text-sm text-[rgba(176,74,46,0.95)]">
                    This professional has declined the project. This chat is read-only.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Image uploader — files are uploaded on send */}
                    <div>
                      <ChatImageUploader
                        onFilesSelected={onPendingFilesChange}
                        maxImages={3}
                        disabled={sending || loadingMessages}
                        isUploading={sending && pendingFiles.length > 0}
                        uploadingCount={pendingFiles.length}
                        clearKey={uploaderClearKey}
                      />
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
                        className="flex-1 rounded-md border border-[rgba(120,53,15,0.2)] bg-white px-3 py-2 text-sm text-slate-800 focus:border-[rgba(215,107,78,0.75)] focus:outline-none"
                        disabled={sending}
                      />
                      <button
                        onClick={onSendMessage}
                        disabled={(!newMessage.trim() && pendingFiles.length === 0) || sending}
                        className="rounded-md bg-[rgba(215,107,78,0.95)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[rgba(176,74,46,0.98)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sending
                          ? (pendingFiles.length > 0 ? 'Uploading & Sending...' : 'Sending...')
                          : 'Send'}
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
