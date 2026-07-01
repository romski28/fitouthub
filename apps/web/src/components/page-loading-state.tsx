'use client';

import React from 'react';
import { MimoSpinner } from '@/components/mimo-spinner';

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
  spinnerClassName = '',
  textClassName = 'text-[#F5EEDB] font-medium',
  className = '',
}: PageLoadingStateProps) {
  return (
    <div className={`${fullScreen ? 'min-h-screen' : ''} bg-transparent flex items-center justify-center ${className}`.trim()}>
      <div className="text-center">
        <MimoSpinner size="lg" className={spinnerClassName} />
        <p className={`mt-4 ${textClassName}`}>{message}</p>
      </div>
    </div>
  );
}
