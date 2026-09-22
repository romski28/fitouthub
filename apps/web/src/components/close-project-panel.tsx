'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '@/config/api';
import { getUploadResponseKeys, resolveMediaAssetUrl } from '@/lib/media-assets';

interface CloseoutReview {
  id: string;
  reviewerType: string;
  rating: number;
  comment?: string | null;
}

interface CloseoutState {
  status: string;
  clientReviewed: boolean;
  proReviewed: boolean;
  clientReviewedAt?: string | null;
  proReviewedAt?: string | null;
  clientPhotos: string[];
  proPhotos: string[];
  pmPhotos: string[];
  closedAt?: string | null;
  reviews: CloseoutReview[];
  canClose: boolean;
}

interface CloseProjectPanelProps {
  projectId: string;
  accessToken: string;
  role: 'client' | 'professional';
}

const STARS = [1, 2, 3, 4, 5];

export const CloseProjectPanel: React.FC<CloseProjectPanelProps> = ({ projectId, accessToken, role }) => {
  const [closeout, setCloseout] = useState<CloseoutState | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchCloseout = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/financial/project/${projectId}/closeout`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to load closeout');
      const data = (await res.json()) as CloseoutState;
      setCloseout(data);
    } catch {
      // Non-fatal: keep the panel hidden on error.
      setCloseout(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, accessToken]);

  useEffect(() => {
    void fetchCloseout();
  }, [fetchCloseout]);

  const myReviewed = closeout
    ? role === 'client'
      ? closeout.clientReviewed
      : closeout.proReviewed
    : false;

  const myReview = closeout?.reviews?.find(
    (r) => r.reviewerType === (role === 'client' ? 'client' : 'professional'),
  );

  const handleFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (incoming.length === 0) {
      toast.error('Please choose image files');
      return;
    }
    setPhotos((prev) => [...prev, ...incoming]);
    setPreviews((prev) => [...prev, ...incoming.map((f) => URL.createObjectURL(f))]);
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      const url = prev[index];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const submit = async () => {
    if (rating < 1) {
      toast.error('Please select a rating');
      return;
    }
    setSubmitting(true);
    try {
      let photoKeys: string[] = [];
      if (photos.length > 0) {
        const formData = new FormData();
        photos.forEach((f) => formData.append('files', f));
        const uploadRes = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/uploads`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        });
        if (!uploadRes.ok) throw new Error('Photo upload failed');
        const uploadData = await uploadRes.json();
        photoKeys = getUploadResponseKeys(uploadData);
      }

      const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/financial/project/${projectId}/closeout-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ rating, comment: comment.trim() || undefined, photos: photoKeys }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Failed to submit review');
      }
      const result = await res.json();
      toast.success(result.closed ? 'Project closed 🎉' : 'Review submitted');
      setRating(0);
      setComment('');
      setPhotos([]);
      setPreviews([]);
      await fetchCloseout();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return null;
  }

  // Only render once the close procedure has begun or the project is in a close phase.
  if (!closeout || closeout.status === 'pending') {
    return null;
  }

  const closed = closeout.status === 'closed';

  return (
    <div className="rounded-2xl border border-[rgba(120,53,15,0.14)] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            {closed ? 'Project closed' : myReviewed ? 'Thanks — waiting for the other party' : 'Close your project'}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {closed
              ? 'Reviews and completed-project photos are in. Thank you!'
              : 'Leave a rating to complete the closeout — photos are recommended.'}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            closed
              ? 'bg-emerald-100 text-emerald-700'
              : myReviewed
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-700'
          }`}
        >
          {closed ? 'Closed' : myReviewed ? 'Awaiting other party' : 'Action needed'}
        </span>
      </div>

      {!myReviewed && !closed && (
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-800">Your rating <span className="font-normal text-slate-500">(required)</span></label>
            <div className="mt-2 flex gap-1">
              {STARS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  aria-label={`${value} star${value === 1 ? '' : 's'}`}
                  className="text-3xl leading-none transition hover:scale-110"
                >
                  <span className={value <= rating ? 'text-amber-400' : 'text-slate-300'}>★</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800">Comment <span className="font-normal text-slate-500">(optional)</span></label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="How did the project go?"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800">Completed project photos <span className="font-normal text-slate-500">(recommended)</span></label>
            <div className="mt-2 flex flex-wrap gap-3">
              {previews.map((url, index) => (
                <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="preview" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute right-0 top-0 rounded-bl-lg bg-slate-900/70 px-1.5 text-xs font-bold text-white"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-2xl text-slate-400 transition hover:border-emerald-400 hover:text-emerald-500"
                aria-label="Add photos"
              >
                +
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit review'}
          </button>
        </div>
      )}

      {myReviewed && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-amber-400">{'★'.repeat(myReview?.rating ?? 0)}</span>
            <span className="text-slate-500">{(myReview?.rating ?? 0) || '—'}/5</span>
          </div>
          {myReview?.comment && <p className="mt-1">{myReview.comment}</p>}
          <p className="mt-2 text-xs text-slate-500">
            {closeout?.clientReviewed && closeout?.proReviewed
              ? 'Both parties have reviewed — closing now.'
              : 'Waiting for the other party to submit their review.'}
          </p>
        </div>
      )}

      {(closeout.clientPhotos.length > 0 || closeout.proPhotos.length > 0) && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed project photos</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...closeout.clientPhotos, ...closeout.proPhotos, ...closeout.pmPhotos].map((key, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${key}-${i}`}
                src={resolveMediaAssetUrl(key)}
                alt="completed project"
                className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
