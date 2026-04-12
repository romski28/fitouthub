"use client";

import { ModalOverlay } from '@/components/modal-overlay';
import { Professional } from '@/lib/types';
import { useState } from 'react';
import { SYSTEM_EMAILS } from '@/config/system-emails';
import { resolveMediaAssetUrls } from '@/lib/media-assets';

import ImageLightbox from '@/components/image-lightbox';
import { PortfolioCarousel } from '@/components/portfolio-carousel';
type ProfessionalDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  professional: Professional | null;
};

const formatRegistrationDate = (value?: string) => {
  if (!value) return undefined;
  try {
    return new Intl.DateTimeFormat('en-HK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const buildPersuasiveHighlights = (professional: Professional) => {
  const bullets: string[] = [];
  const referenceCount = professional.referenceProjects?.length || 0;
  const photoCount = professional.profileImages?.length || 0;
  const tradeCount = professional.tradesOffered?.length || 0;
  const supplyCount = professional.suppliesOffered?.length || 0;

  if (professional.primaryTrade) bullets.push(`Focused on ${professional.primaryTrade} work.`);
  if (professional.serviceArea) bullets.push(`Actively covers ${professional.serviceArea}.`);
  if (referenceCount > 0) bullets.push(`Shows ${referenceCount} completed reference project${referenceCount === 1 ? '' : 's'}.`);
  if (photoCount > 0) bullets.push(`Includes ${photoCount} portfolio photo${photoCount === 1 ? '' : 's'} as visual proof.`);
  if (professional.emergencyCalloutAvailable) bullets.push('Offers emergency callout availability for urgent jobs.');
  if (tradeCount + supplyCount > 1) bullets.push(`Provides a broader scope across ${tradeCount + supplyCount} listed capabilities.`);

  return bullets.slice(0, 4);
};

export function ProfessionalDetailsModal({ isOpen, onClose, professional }: ProfessionalDetailsModalProps) {
  const [reportOpen, setReportOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  if (!professional) return null;

  const normalizedProfileImages = resolveMediaAssetUrls(professional.profileImages || []);

  const name = professional.fullName || professional.businessName || professional.email || 'Professional';
  const referenceProjectCount = professional.referenceProjects?.length || 0;
  const serviceAreas = (professional.serviceArea || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const persuasiveHighlights = buildPersuasiveHighlights(professional);

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
            <p className="text-xs uppercase font-semibold tracking-[0.12em] text-emerald-600">Professional Details</p>
              <h2 className="text-2xl font-bold text-slate-900">{name}</h2>
              <p className="text-sm text-slate-600">{professional.professionType}</p>
            </div>
            {typeof professional.rating === 'number' && professional.rating > 0 && (
              <div className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-100">
                {professional.rating.toFixed(1)}★ rating
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <StatCard label="Primary Trade" value={professional.primaryTrade || 'Not set'} />
            <StatCard label="Reference Projects" value={referenceProjectCount} />
            <StatCard label="Portfolio Photos" value={normalizedProfileImages.length} />
            <StatCard label="Emergency" value={professional.emergencyCalloutAvailable ? '24/7 available' : 'Standard response'} />
          </div>

          {persuasiveHighlights.length > 0 && (
            <div className="mt-4 rounded-lg border border-emerald-100 bg-white/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Why clients shortlist this professional</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {persuasiveHighlights.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-0.5 text-emerald-600">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Detail label="Email" value={professional.email} />
          <Detail label="Phone" value={professional.phone} />
          <Detail label="Status" value={professional.status} />
          <Detail label="Rating" value={typeof professional.rating === 'number' ? `${professional.rating.toFixed(1)}★` : undefined} />
          <Detail label="Registration Date" value={formatRegistrationDate(professional.registrationDate)} />
          <Detail label="Full Name" value={professional.fullName || undefined} />
          <Detail label="Business Name" value={professional.businessName || undefined} />
          <Detail label="Service Area" value={professional.serviceArea || undefined} />
          <Detail label="Location Primary" value={professional.locationPrimary || undefined} />
          <Detail label="Location Secondary" value={professional.locationSecondary || undefined} />
          <Detail label="Location Tertiary" value={professional.locationTertiary || undefined} />
          <Detail label="Primary Trade" value={professional.primaryTrade || undefined} />
        </div>

        {serviceAreas.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Coverage</p>
            <div className="flex flex-wrap gap-2">
              {serviceAreas.map((area) => (
                <span key={area} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  {area}
                </span>
              ))}
            </div>
          </div>
        )}

        {(professional.tradesOffered && professional.tradesOffered.length > 0) && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Trades Offered</p>
            <div className="flex flex-wrap gap-2">
              {professional.tradesOffered.map((t, idx) => (
                <span key={`${t}-${idx}`} className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">{t}</span>
              ))}
            </div>
          </div>
        )}

        {(professional.suppliesOffered && professional.suppliesOffered.length > 0) && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Supplies Offered</p>
            <div className="flex flex-wrap gap-2">
              {professional.suppliesOffered.map((s, idx) => (
                <span key={`${s}-${idx}`} className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white">{s}</span>
              ))}
            </div>
          </div>
        )}

        {professional.additionalData ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Additional Data</p>
            <pre className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 overflow-x-auto">
              {JSON.stringify(professional.additionalData, null, 2)}
            </pre>
          </div>
        ) : null}

        {(normalizedProfileImages && normalizedProfileImages.length > 0) && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Photos</p>
            <div className="grid gap-2 sm:grid-cols-3">
                {normalizedProfileImages.map((url, idx) => (
                <button
                  key={url}
                  type="button"
                  className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                  onClick={() => setLightbox({ images: normalizedProfileImages, index: idx })}
                >
                  <img src={url} alt={name} className="h-28 w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {professional.referenceProjects && professional.referenceProjects.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Reference Projects</p>
            <div className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory">
              {professional.referenceProjects.map((proj) => (
                <div key={proj.id} className="flex-shrink-0 w-full sm:w-96 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{proj.title}</p>
                      {proj.description ? (
                        <p className="mt-1 text-xs text-slate-700 whitespace-pre-line">{proj.description}</p>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-slate-500">{proj.createdAt ? new Date(proj.createdAt).toLocaleDateString() : ''}</span>
                  </div>
                  <div className="mt-2">
                    <PortfolioCarousel 
                      images={proj.imageUrls || []}
                      emptyMessage="No photos in this project"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            No project entered, please add more for better client experience.
          </div>
        )}

        {lightbox ? (
          <ImageLightbox
            images={lightbox.images}
            startIndex={lightbox.index}
            onClose={() => setLightbox(null)}
          />
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition"
            onClick={() => setReportOpen(true)}
          >
            Report an issue
          </button>
        </div>

        <ReportProfessionalModal
          isOpen={reportOpen}
          onClose={() => setReportOpen(false)}
          professional={professional}
        />
      </div>
    </ModalOverlay>
  );
}

function Detail({ label, value }: { label: string; value?: string | number | null }) {
  if (!value) return null;
  return (
    <div className="grid gap-1">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className="text-sm text-slate-800 break-all">{String(value)}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-emerald-100 bg-white p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

type ReportProfessionalModalProps = {
  isOpen: boolean;
  onClose: () => void;
  professional: Professional;
};

function ReportProfessionalModal({ isOpen, onClose, professional }: ReportProfessionalModalProps) {
  const [text, setText] = useState('');
  const name = professional.fullName || professional.businessName || professional.email || 'Professional';
  const mailto = (() => {
    const to = SYSTEM_EMAILS.contact;
    const subject = encodeURIComponent(`Professional report: ${name}`);
    const body = encodeURIComponent(`Professional ID: ${professional.id}\nProfessional Email: ${professional.email}\n\nComments:\n${text}`);
    return `mailto:${to}?subject=${subject}&body=${body}`;
  })();

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-4">
        <div>
          <p className="text-xs uppercase font-semibold tracking-[0.12em] text-rose-600">Report</p>
          <h3 className="text-xl font-bold text-slate-900">Let us know your comments on {name}</h3>
          <p className="text-sm text-slate-600">We will investigate and take appropriate action.</p>
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-800">Comments</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Describe errors, poor experiences, or any information we should review."
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
            onClick={async () => {
              try {
                const res = await fetch(`/professionals/${encodeURIComponent(professional.id)}/report`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ comments: text }),
                });
                if (!res.ok) throw new Error(await res.text());
                onClose();
              } catch (e) {
                console.error('Failed to submit report', e);
                onClose();
              }
            }}
          >
            Send
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
