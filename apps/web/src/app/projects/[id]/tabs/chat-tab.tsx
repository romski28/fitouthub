'use client';

import React, { useState } from 'react';
import ProjectChat from '@/components/project-chat';

interface ChatTabProps {
  projectId: string;
  accessToken: string;
}

export const ChatTab: React.FC<ChatTabProps> = ({ projectId, accessToken }) => {
  const [thread, setThread] = useState<'project' | 'pm'>('project');
  return (
    <div className="space-y-4">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-slate-900">Project Chat</h2>
        <p className="text-sm text-slate-600">Communicate with your Mimo Project Manager and project team</p>
      </div>

      <div className="flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setThread('project')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
            thread === 'project' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Project
        </button>
        <button
          type="button"
          onClick={() => setThread('pm')}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
            thread === 'pm' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Your PM
        </button>
      </div>

      {thread === 'project' ? (
        <ProjectChat
          projectId={projectId}
          accessToken={accessToken}
          currentUserRole="client"
          headerTitle="Project Team Chat"
          headerSubtitle="Client, awarded professionals & Mimo"
        />
      ) : (
        <ProjectChat
          projectId={projectId}
          accessToken={accessToken}
          currentUserRole="client"
          threadScope="pm-private"
          threadScopeId="pm-private"
          headerTitle="Your Project Manager"
          headerSubtitle="Private messages with your Mimo PM"
        />
      )}
    </div>
  );
};
