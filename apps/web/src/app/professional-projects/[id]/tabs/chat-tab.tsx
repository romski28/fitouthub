'use client';

import React from 'react';
import ProjectChat from '@/components/project-chat';

interface ChatTabProps {
  tab?: string;
  projectId: string;
  projectStatus: string;
  clientName?: string;
  clientId?: string;
  accessToken?: string;
}

export const ChatTab: React.FC<ChatTabProps> = ({ projectId, projectStatus, clientName, clientId, accessToken }) => {
  const isAwarded = projectStatus === 'awarded';

  if (!isAwarded) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Team chat will be available once your quote is awarded.
      </div>
    );
  }

  return (
    <div>
      {projectId && accessToken && (
        <ProjectChat
          projectId={projectId}
          currentUserRole="professional"
          accessToken={accessToken}
        />
      )}
    </div>
  );
};
