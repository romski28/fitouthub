'use client';

import React, { useEffect, useCallback } from 'react';
import Image from 'next/image';
import { resolveMediaAssetUrl } from '@/lib/media-assets';

interface FileViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  file?: {
    id: string;
    url: string;
    note?: string | null;
    createdAt?: string;
  } | null;
  onDownload?: (url: string) => void;
}

function getFileInfo(url: string) {
  const ext = (url || '').split('.').pop()?.split('?')[0]?.toLowerCase() || '';
  const isImage = ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext);
  const isPdf = ext === 'pdf';
  const isOfficeDoc = ['doc','docx','xls','xlsx','ppt','pptx'].includes(ext);
  const isViewable = isImage || isPdf || isOfficeDoc;
  return { ext, isImage, isPdf, isOfficeDoc, isViewable };
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  isOpen,
  onClose,
  file,
  onDownload,
}) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !file) return null;

  const fileUrl = resolveMediaAssetUrl(file.url);
  const { ext, isImage, isPdf, isOfficeDoc, isViewable } = getFileInfo(file.url);
  const encodedUrl = encodeURIComponent(fileUrl);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 shrink-0 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {file.url.split('/').pop() || 'File'}
            </p>
            {file.note && (
              <p className="text-xs text-slate-500 truncate mt-0.5">{file.note}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={fileUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onDownload?.(fileUrl)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
            >
              Download
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 transition"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex items-center justify-center bg-slate-100">
          {isImage ? (
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <Image
                src={fileUrl}
                alt={file.url.split('/').pop() || 'File'}
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          ) : isViewable ? (
            <iframe
              src={`https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`}
              className="w-full h-full border-0"
              title="File viewer"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 p-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-200">
                <span className="text-2xl font-bold uppercase text-slate-500">{ext || 'FILE'}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Preview not available</p>
                <p className="text-xs text-slate-500 mt-1">This file type cannot be previewed. Download to view.</p>
              </div>
              <a
                href={fileUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
              >
                Download file
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        {file.createdAt && (
          <div className="shrink-0 border-t border-slate-200 px-5 py-2">
            <p className="text-xs text-slate-400">
              Uploaded {new Date(file.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
