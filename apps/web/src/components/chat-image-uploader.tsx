'use client';

import { useState, useEffect, useRef } from 'react';

interface ChatImageUploaderProps {
  onFilesSelected: (files: File[]) => void;
  maxImages?: number;
  disabled?: boolean;
  isUploading?: boolean;
  uploadingCount?: number;
  /** Increment this value to programmatically clear the uploader (e.g. after a successful send). */
  clearKey?: number;
  compact?: boolean;
}

export default function ChatImageUploader({
  onFilesSelected,
  maxImages = 3,
  disabled = false,
  isUploading = false,
  uploadingCount = 0,
  clearKey = 0,
  compact = false,
}: ChatImageUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Clear when parent signals success via clearKey increment
  useEffect(() => {
    if (clearKey > 0) {
      setPreviewUrls((prev) => { prev.forEach(u => URL.revokeObjectURL(u)); return []; });
      setPreviewFiles([]);
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearKey]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, options?: { append?: boolean }) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const append = options?.append === true;
    const nextTotal = append ? previewFiles.length + files.length : files.length;

    if (nextTotal > maxImages) {
      setError(`Maximum ${maxImages} image${maxImages > 1 ? 's' : ''} allowed`);
      return;
    }

    const oversized = files.filter(f => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) {
      setError(`File too large: ${oversized[0].name} (max 10MB)`);
      return;
    }

    const invalidTypes = files.filter(f => !f.type.startsWith('image/'));
    if (invalidTypes.length > 0) {
      setError(`Invalid file type: ${invalidTypes[0].name} (images only)`);
      return;
    }

    setError(null);

    const urls = files.map(f => URL.createObjectURL(f));
    if (append) {
      const mergedFiles = [...previewFiles, ...files];
      const mergedUrls = [...previewUrls, ...urls];
      setPreviewFiles(mergedFiles);
      setPreviewUrls(mergedUrls);
      onFilesSelected(mergedFiles);
    } else {
      // Revoke any existing preview URLs before replacing
      previewUrls.forEach(u => URL.revokeObjectURL(u));
      setPreviewFiles(files);
      setPreviewUrls(urls);
      onFilesSelected(files);
    }

    // Reset the input so the same file can be re-selected after clearing
    e.target.value = '';
  };

  const removePreview = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    const newFiles = previewFiles.filter((_, i) => i !== index);
    const newUrls = previewUrls.filter((_, i) => i !== index);
    setPreviewFiles(newFiles);
    setPreviewUrls(newUrls);
    onFilesSelected(newFiles);
  };

  const clearAll = () => {
    previewUrls.forEach(u => URL.revokeObjectURL(u));
    setPreviewFiles([]);
    setPreviewUrls([]);
    setError(null);
    onFilesSelected([]);
  };

  return (
    <div className="space-y-2">
      {/* File input trigger */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={disabled}
          className={
            compact
              ? `relative inline-flex h-10 w-10 items-center justify-center rounded-lg transition shadow-sm ${disabled ? 'bg-slate-400 opacity-50 cursor-not-allowed' : isUploading ? 'bg-emerald-700 ring-2 ring-emerald-300/70 cursor-progress' : 'bg-emerald-600 hover:bg-emerald-700'} text-white`
              : `relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition shadow-sm ${disabled ? 'bg-slate-600 opacity-50 cursor-not-allowed' : isUploading ? 'bg-emerald-700 ring-2 ring-emerald-300/70 cursor-progress' : 'bg-emerald-600 hover:bg-emerald-700'} text-white`
          }
          title={isUploading ? 'Uploading images' : 'Attach images'}
          aria-label={isUploading ? 'Uploading images' : 'Attach images'}
        >
          {isUploading ? (
            <svg className={compact ? 'h-5 w-5 animate-spin' : 'h-4 w-4 animate-spin'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg className={compact ? 'w-5 h-5' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
          {!compact && <span>{isUploading ? 'Uploading...' : 'Add images'}</span>}
          {isUploading && (
            <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold leading-none text-emerald-700">
              {Math.max(1, uploadingCount)}
            </span>
          )}
        </button>

        <input
          ref={galleryInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          disabled={disabled}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={disabled}
          className={
            compact
              ? `inline-flex h-10 w-10 items-center justify-center rounded-lg transition shadow-sm sm:hidden ${disabled ? 'bg-slate-300 opacity-50 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-800'} text-white`
              : `inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition shadow-sm sm:hidden ${disabled ? 'bg-slate-300 opacity-50 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-800'} text-white`
          }
          title="Take photo"
          aria-label="Take photo"
        >
          <svg className={compact ? 'w-5 h-5' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h4l2-2h6l2 2h4v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            <circle cx="12" cy="13" r="3.5" strokeWidth="2" />
          </svg>
          {!compact && <span>Take photo</span>}
        </button>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFileSelect(e, { append: true })}
          disabled={disabled}
          className="hidden"
        />

        {previewFiles.length > 0 && !compact && (
          <span className="text-xs text-slate-400 ml-1">
            {previewFiles.length} image{previewFiles.length > 1 ? 's' : ''} attached — will send with message
          </span>
        )}

        {isUploading && !compact && (
          <span className="text-xs font-semibold text-emerald-400">
            Uploading {Math.max(1, uploadingCount)} image{Math.max(1, uploadingCount) === 1 ? '' : 's'}...
          </span>
        )}
      </div>

      {/* Previews */}
      {previewFiles.length > 0 && (
        <div className="flex flex-wrap items-start gap-2">
          {previewFiles.map((file, i) => (
            <div key={i} className="relative group">
              <img
                src={previewUrls[i]}
                alt={file.name}
                className="w-20 h-20 object-cover rounded border border-slate-600"
              />
              <button
                type="button"
                onClick={() => removePreview(i)}
                disabled={disabled}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 text-sm hover:bg-red-600 shadow-md disabled:opacity-50"
              >
                ×
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition">
                {file.name}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={clearAll}
            disabled={disabled}
            className="self-end px-2 py-1 text-slate-400 hover:text-slate-200 text-xs disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}

      {/* Validation error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-900/30 px-3 py-2 rounded border border-red-500/40 flex items-start gap-2">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

