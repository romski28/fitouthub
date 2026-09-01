'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import ChatImageUploader from '@/components/chat-image-uploader';

interface ClientImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  accessToken: string;
}

export default function ClientImageUploadModal({
  isOpen,
  onClose,
  projectId,
  accessToken,
}: ClientImageUploadModalProps) {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  if (!isOpen) return null;

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      pendingFiles.forEach((f) => formData.append('files', f));
      formData.append('projectId', projectId);

      const uploadRes = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/uploads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(text || 'Image upload failed');
      }
      const uploadData = await uploadRes.json();
      const urls: string[] = uploadData.urls || [];
      if (urls.length === 0) throw new Error('No URLs returned from upload');

      const saveRes = await fetch(`${API_BASE_URL}/projects/${projectId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      if (!saveRes.ok) {
        const text = await saveRes.text().catch(() => '');
        throw new Error(text || 'Failed to save photos');
      }

      setPendingFiles([]);
      toast.success('Photos added');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload images');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !uploading) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-900">Add project images</h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload photos of your project to help the team visualise the work — this may avoid a site inspection.
        </p>

        <div className="mt-4">
          <ChatImageUploader
            onFilesSelected={setPendingFiles}
            maxImages={5}
            disabled={uploading}
            isUploading={uploading}
            uploadingCount={pendingFiles.length}
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || pendingFiles.length === 0}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
