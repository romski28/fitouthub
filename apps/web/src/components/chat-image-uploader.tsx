'use client';

import { useState } from 'react';
import { API_BASE_URL } from '@/config/api';

interface ChatImageUploaderProps {
  onImagesUploaded: (images: { url: string; filename: string }[]) => void;
  maxImages?: number;
  disabled?: boolean;
}

export default function ChatImageUploader({
  onImagesUploaded,
  maxImages = 3,
  disabled = false,
}: ChatImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate
    if (files.length > maxImages) {
      setError(`Maximum ${maxImages} image${maxImages > 1 ? 's' : ''} allowed`);
      return;
    }

    // Check file sizes (10MB limit per file)
    const oversized = files.filter(f => f.size > 10 * 1024 * 1024);
    if (oversized.length > 0) {
      setError(`File too large: ${oversized[0].name} (max 10MB)`);
      return;
    }

    // Check file types
    const invalidTypes = files.filter(f => !f.type.startsWith('image/'));
    if (invalidTypes.length > 0) {
      setError(`Invalid file type: ${invalidTypes[0].name} (images only)`);
      return;
    }

    setError(null);
    setPreviewFiles(files);
    
    // Create preview URLs
    const urls = files.map(f => URL.createObjectURL(f));
    setPreviewUrls(urls);
  };

  const handleUpload = async () => {
    if (previewFiles.length === 0) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      previewFiles.forEach((file) => formData.append('files', file));

      const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/uploads`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Upload failed');
      }

      const data = await res.json();
      const images = data.urls.map((url: string, i: number) => ({
        url,
        filename: previewFiles[i].name,
      }));

      onImagesUploaded(images);
      
      // Clean up
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setPreviewFiles([]);
      setPreviewUrls([]);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removePreview = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setPreviewFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPreviewFiles([]);
    setPreviewUrls([]);
    setError(null);
  };

  return (
    <div className="space-y-2">
      {/* File input button */}
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer text-sm transition disabled:opacity-50 disabled:cursor-not-allowed">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Add images</span>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileSelect}
            disabled={disabled || uploading}
            className="hidden"
          />
        </label>

        {previewFiles.length > 0 && (
          <span className="text-xs text-slate-600">
            {previewFiles.length} image{previewFiles.length > 1 ? 's' : ''} selected
          </span>
        )}
      </div>

      {/* Preview images */}
      {previewFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {previewFiles.map((file, i) => (
              <div key={i} className="relative group">
                <img
                  src={previewUrls[i]}
                  alt={file.name}
                  className="w-20 h-20 object-cover rounded border border-slate-200"
                />
                <button
                  onClick={() => removePreview(i)}
                  disabled={uploading}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 text-sm hover:bg-red-600 shadow-md disabled:opacity-50"
                >
                  ×
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition">
                  {file.name}
                </div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleUpload}
              disabled={uploading || disabled}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Uploading...
                </span>
              ) : (
                `Upload ${previewFiles.length} image${previewFiles.length > 1 ? 's' : ''}`
              )}
            </button>
            <button
              onClick={clearAll}
              disabled={uploading}
              className="px-3 py-2 text-slate-600 hover:text-slate-800 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200 flex items-start gap-2">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
