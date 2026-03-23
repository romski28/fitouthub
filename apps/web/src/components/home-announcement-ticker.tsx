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
    <div className="rounded-lg border border-amber-200 bg-amber-50 py-2 px-3 overflow-hidden">
      <div className="ticker-track">
        <span className="ticker-item">📢 {text}</span>
        <span className="ticker-item" aria-hidden>
          📢 {text}
        </span>
      </div>

      <style jsx>{`
        .ticker-track {
          display: flex;
          width: max-content;
          min-width: 100%;
          animation: ticker-scroll 24s linear infinite;
        }

        .ticker-item {
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
          padding-right: 4rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: rgb(146, 64, 14);
        }

        @keyframes ticker-scroll {
          0% {
            transform: translateX(0%);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
};
