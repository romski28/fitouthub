'use client';

import { useState, useEffect } from 'react';

interface ChatImageUploaderProps {
  onFilesSelected: (files: File[]) => void;
  maxImages?: number;
  disabled?: boolean;
  /** Increment this value to programmatically clear the uploader (e.g. after a successful send). */
  clearKey?: number;
  compact?: boolean;
}

export default function ChatImageUploader({
  onFilesSelected,
  maxImages = 3,
  disabled = false,
  clearKey = 0,
  compact = false,
}: ChatImageUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  // Clear when parent signals success via clearKey increment
  useEffect(() => {
    if (clearKey > 0) {
      setPreviewUrls((prev) => { prev.forEach(u => URL.revokeObjectURL(u)); return []; });
      setPreviewFiles([]);
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearKey]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (files.length > maxImages) {
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

    // Revoke any existing preview URLs before replacing
    previewUrls.forEach(u => URL.revokeObjectURL(u));

    const urls = files.map(f => URL.createObjectURL(f));
    setPreviewFiles(files);
    setPreviewUrls(urls);
    onFilesSelected(files);

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
      <div className="flex items-center gap-2">
        <label
          className={
            compact
              ? `inline-flex h-10 w-10 items-center justify-center rounded-lg cursor-pointer transition shadow-sm ${disabled ? 'bg-slate-400 opacity-50 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'} text-white`
              : `inline-flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-sm font-medium transition shadow-sm ${disabled ? 'bg-slate-600 opacity-50 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'} text-white`
          }
          title="Attach images"
          aria-label="Attach images"
        >
          <svg className={compact ? 'w-5 h-5' : 'w-4 h-4'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {!compact && <span>Add images</span>}
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileSelect}
            disabled={disabled}
            className="hidden"
          />
        </label>

        {previewFiles.length > 0 && !compact && (
          <span className="text-xs text-slate-400 ml-1">
            {previewFiles.length} image{previewFiles.length > 1 ? 's' : ''} attached — will send with message
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

