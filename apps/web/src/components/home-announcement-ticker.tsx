'use client';

import React from 'react';

type HomeAnnouncementTickerProps = {
  title?: string | null;
  content: string;
};

export const HomeAnnouncementTicker: React.FC<HomeAnnouncementTickerProps> = ({
  title,
  content,
}) => {
  const text = title?.trim() ? `${title.trim()}: ${content}` : content;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 overflow-hidden">
      <div className="home-ticker-track">
        <span className="home-ticker-item">📢 {text}</span>
        <span className="home-ticker-item" aria-hidden>
          📢 {text}
        </span>
      </div>
    </div>
  );
};
