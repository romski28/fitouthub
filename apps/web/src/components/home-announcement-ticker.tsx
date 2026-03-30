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
    <div className="overflow-hidden border-y border-amber-200 bg-amber-50/95 px-2 py-1">
      <div className="home-ticker-track">
        <span className="home-ticker-item">📢 {text}</span>
        <span className="home-ticker-item" aria-hidden>
          📢 {text}
        </span>
      </div>
    </div>
  );
};
