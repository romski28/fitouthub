'use client';

import React from 'react';

type PageLoadingStateProps = {
  message?: string;
  fullScreen?: boolean;
  spinnerClassName?: string;
  textClassName?: string;
  className?: string;
};

export function PageLoadingState({
  message = 'Loading...',
  fullScreen = true,
  spinnerClassName = 'border-[#FF7F50]',
  textClassName = 'text-[#F5EEDB] font-medium',
  className = '',
}: PageLoadingStateProps) {
  return (
    <div className={`${fullScreen ? 'min-h-screen' : ''} bg-transparent flex items-center justify-center ${className}`.trim()}>
      <div className="text-center">
        <div className={`inline-block h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 ${spinnerClassName}`}></div>
        <p className={`mt-4 ${textClassName}`}>{message}</p>
      </div>
    </div>
  );
}
