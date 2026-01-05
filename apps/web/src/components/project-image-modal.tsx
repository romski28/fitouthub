'use client';

import { useState } from 'react';

interface ProjectPhoto {
  id: string;
  url: string;
  note?: string | null;
  createdAt?: string;
}

interface ProjectImageModalProps {
  isOpen: boolean;
  photo: ProjectPhoto | null;
  onClose: () => void;
  onSave?: (photo: ProjectPhoto) => Promise<void>;
  isSaving?: boolean;
}

function formatDate(dateString?: string): string {
  if (!dateString) return 'Date unknown';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectImageModal({
  isOpen,
  photo,
  onClose,
  onSave,
  isSaving = false,
}: ProjectImageModalProps) {
  const [note, setNote] = useState<string>(photo?.note || '');

  // Update note when photo changes
  if (isOpen && photo && note !== (photo?.note || '')) {
    setNote(photo?.note || '');
  }

  if (!isOpen || !photo) return null;

  const handleSave = async () => {
    if (!onSave || !photo) return;
    await onSave({
      ...photo,
      note,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative max-h-[90vh] max-w-2xl w-full bg-white rounded-xl shadow-xl overflow-auto animate-in zoom-in duration-200">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Image Details</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Image */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-600">Image</p>
            <div className="relative w-full bg-slate-100 rounded-lg overflow-hidden">
              <img
                src={photo.url}
                alt="Project image"
                className="w-full h-auto object-contain max-h-96"
              />
            </div>
          </div>

          {/* Upload Date */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-600">Uploaded</p>
            <p className="text-sm text-slate-900 font-medium">{formatDate(photo.createdAt)}</p>
          </div>

          {/* Notes */}
          {onSave ? (
            <div className="space-y-2">
              <label htmlFor="imageNote" className="text-sm font-medium text-slate-700">
                Notes
              </label>
              <textarea
                id="imageNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add notes about this image..."
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-600">Notes</p>
              {photo.note ? (
                <p className="text-sm text-slate-900 whitespace-pre-wrap">{photo.note}</p>
              ) : (
                <p className="text-sm text-slate-500 italic">No notes</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {onSave && (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex gap-3">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Notes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
