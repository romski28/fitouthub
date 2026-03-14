'use client';

import React from 'react';
import toast from 'react-hot-toast';

interface OverviewTabProps {
  tab?: string;
  project: {
    id: string;
    project: {
      id: string;
      projectName: string;
      clientName: string;
      region: string;
      budget?: string;
      notes?: string;
    };
    status: string;
    quoteAmount?: string;
    quoteNotes?: string;
    quotedAt?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  quoteForm: {
    amount: string;
    notes: string;
  };
  onUpdateQuoteForm: (patch: any) => void;
  onSubmitQuote: (e: React.FormEvent) => Promise<void>;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
  onKeepCurrentQuote: () => Promise<void>;
  submittingQuote: boolean;
  accessToken: string | null;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  project,
  quoteForm,
  onUpdateQuoteForm,
  onSubmitQuote,
  onAccept,
  onReject,
  onKeepCurrentQuote,
  submittingQuote,
  accessToken,
}) => {
  // 3-day quote deadline countdown from invitation date
  const invitedAt = project.createdAt ? new Date(project.createdAt) : null;
  const quoteDeadline = invitedAt ? new Date(invitedAt.getTime() + 3 * 24 * 60 * 60 * 1000) : null;
  const msRemaining = quoteDeadline ? quoteDeadline.getTime() - Date.now() : null;
  const isOverdue = msRemaining !== null && msRemaining < 0;
  const daysLeft = msRemaining !== null && msRemaining > 0 ? Math.floor(msRemaining / (24 * 60 * 60 * 1000)) : 0;
  const hoursLeft = msRemaining !== null && msRemaining > 0 ? Math.floor((msRemaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)) : 0;

  const countdownBadge = quoteDeadline && !project.quotedAt ? (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
      isOverdue ? 'bg-red-100 text-red-700' :
      daysLeft === 0 ? 'bg-amber-100 text-amber-700' :
      'bg-blue-100 text-blue-700'
    }`}>
      {isOverdue ? '⚠ Quote overdue' : daysLeft > 0 ? `⏱ ${daysLeft}d ${hoursLeft}h to quote` : `⏱ ${hoursLeft}h to quote`}
    </span>
  ) : null;

  return (
    <div className="space-y-6">
      {/* Quote Form / Status — shown first so the action is immediately visible */}
      {/* (Project Info follows below) */}

      {/* Quote Form/Status */}
      {['pending', 'accepted', 'counter_requested', 'quoted'].includes(project.status) && 
       !(project.status === 'declined' || project.status === 'rejected') ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900">
              {project.quotedAt ? 'Update Your Quote' : 'Submit Your Quote'}
            </h2>
            {countdownBadge}
          </div>

          {project.status === 'counter_requested' && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The client requested a better offer. You can submit a revised quote or keep your current offer.
            </div>
          )}

          {project.status === 'quoted' && (
            <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              You can adjust your quote if needed. Submit a revised amount or keep your current offer.
            </div>
          )}

          <form onSubmit={onSubmitQuote} className="space-y-4">
            <div>
              <label htmlFor="amount" className="block text-sm font-semibold text-slate-700 mb-1">
                Quote Amount ($) *
              </label>
              <input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                required
                value={quoteForm.amount}
                onChange={(e) => onUpdateQuoteForm({ amount: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="0.00"
              />
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-semibold text-slate-700 mb-1">
                Quote Notes (Optional)
              </label>
              <textarea
                id="notes"
                rows={4}
                value={quoteForm.notes}
                onChange={(e) => onUpdateQuoteForm({ notes: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Add any additional notes about your quote..."
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={submittingQuote}
                className="flex-1 min-w-40 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {submittingQuote ? 'Submitting...' : project.quotedAt ? 'Update Quote' : 'Submit Quote'}
              </button>

              {project.status === 'counter_requested' && (
                <button
                  type="button"
                  onClick={onKeepCurrentQuote}
                  disabled={submittingQuote}
                  className="flex-1 min-w-40 rounded-md bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition"
                >
                  {submittingQuote ? 'Processing...' : 'Confirm Quotation'}
                </button>
              )}

              {project.status === 'pending' && (
                <>
                  <button
                    type="button"
                    onClick={onAccept}
                    disabled={submittingQuote}
                    className="flex-1 min-w-40 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    {submittingQuote ? 'Processing...' : 'Accept Project'}
                  </button>
                  <button
                    type="button"
                    onClick={onReject}
                    disabled={submittingQuote}
                    className="flex-1 min-w-40 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
                  >
                    {submittingQuote ? 'Processing...' : 'Reject Project'}
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      ) : project.quoteAmount && !(project.status === 'declined' || project.status === 'rejected') ? (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-5">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Your Quote</h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Amount</p>
              <p className="text-2xl font-bold text-slate-900">${project.quoteAmount}</p>
            </div>
            
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Submitted</p>
              <p className="text-sm font-semibold text-slate-900">
                {project.quotedAt ? new Date(project.quotedAt).toLocaleDateString() : '—'}
              </p>
            </div>
            
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Notes</p>
              <p className="text-sm text-slate-700 line-clamp-2">{project.quoteNotes || '—'}</p>
            </div>
            
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Status</p>
              <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                project.status === 'awarded' ? 'bg-emerald-100 text-emerald-800' :
                project.status === 'quoted' ? 'bg-blue-100 text-blue-800' :
                project.status === 'counter_requested' ? 'bg-amber-100 text-amber-800' :
                'bg-slate-100 text-slate-800'
              }`}>
                {project.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Project Info */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-5">
        <h2 className="text-lg font-bold text-slate-900 mb-4">Project Details</h2>
        
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Project Name</p>
            <p className="text-base font-semibold text-slate-900">{project.project.projectName}</p>
          </div>
          
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Client</p>
            <p className="text-base font-semibold text-slate-900">{project.project.clientName}</p>
          </div>
          
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Region</p>
            <p className="text-base font-semibold text-slate-900">{project.project.region}</p>
          </div>
          
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Client Budget</p>
            <p className="text-base font-semibold text-slate-900">
              {project.project.budget ? `$${project.project.budget}` : '—'}
            </p>
          </div>
          
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Status</p>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
              project.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              project.status === 'accepted' ? 'bg-green-100 text-green-800' :
              project.status === 'quoted' ? 'bg-blue-100 text-blue-800' :
              project.status === 'awarded' ? 'bg-emerald-100 text-emerald-800' :
              project.status === 'counter_requested' ? 'bg-amber-100 text-amber-800' :
              'bg-slate-100 text-slate-800'
            }`}>
              {project.status.replace('_', ' ')}
            </span>
          </div>
          
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1">Invited Date</p>
            <p className="text-sm font-semibold text-slate-900">
              {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : '—'}
            </p>
          </div>
        </div>

        {project.project.notes && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">Project Notes</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{project.project.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
};
