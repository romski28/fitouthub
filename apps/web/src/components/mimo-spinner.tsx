'use client';

import React from 'react';

type MimoSpinnerProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeMap = {
  sm: 'h-5 w-5 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-[3px]',
};

/**
 * Shared Mimo spinner — coral tapered-ends.
 * Import as: import { MimoSpinner } from '@/components/mimo-spinner';
 */
export function MimoSpinner({ size = 'md', className = '' }: MimoSpinnerProps) {
  return (
    <div
      className={`inline-block animate-spin rounded-full border-t-transparent border-b-transparent border-[#FF7F50] ${sizeMap[size]} ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
