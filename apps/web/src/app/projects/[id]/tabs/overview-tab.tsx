'use client';

import React, { useState } from 'react';
import { AccordionItem, AccordionGroup } from '@/components/project-tabs';
import { ProjectProgressBar } from '@/components/project-progress-bar';
import ProjectFinancialsCard from '@/components/project-financials-card';
import toast from 'react-hot-toast';

interface ProjectDetail {
  id: string;
  projectName: string;
  region: string;
  status?: string;
  budget?: string;
  approvedBudget?: string;
  notes?: string;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
  updatedAt?: string;
  contractorContactName?: string;
  contractorContactPhone?: string;
  contractorContactEmail?: string;
  professionals?: any[];
}

interface OverviewTabProps {
  project: ProjectDetail;
  expandedAccordions: Record<string, boolean>;
  onToggleAccordion: (id: string) => void;
  accessToken: string;
  fundsSecured: boolean;
  onScheduleUpdate: (data: { startDate?: string; endDate?: string }) => Promise<void>;
  onContactUpdate: (data: { name?: string; phone?: string; email?: string }) => Promise<void>;
  onPayInvoice: () => Promise<void>;
  isUpdatingSchedule: boolean;
  isUpdatingContact: boolean;
  isPayingInvoice: boolean;
}

const formatDate = (date?: string) => {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(date));
  } catch {
    return '—';
  }
};

const formatHKD = (value?: number | string) => {
  if (value === undefined || value === null || value === '') return 'HK$ —';
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return `HK$ ${value}`;
  return `HK$ ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const projectStatusBadge: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  withdrawn: 'bg-slate-200 text-slate-800',
  awarded: 'bg-blue-100 text-blue-800',
};

export const OverviewTab: React.FC<OverviewTabProps> = ({
  project,
  expandedAccordions,
  onToggleAccordion,
  accessToken,
  fundsSecured,
  onScheduleUpdate,
  onContactUpdate,
  onPayInvoice,
  isUpdatingSchedule,
  isUpdatingContact,
  isPayingInvoice,
}) => {
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    startDate: project.startDate || '',
    endDate: project.endDate || '',
  });

  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: project.contractorContactName || '',
    phone: project.contractorContactPhone || '',
    email: project.contractorContactEmail || '',
  });

  const handleScheduleSave = async () => {
    if (!scheduleForm.startDate && !scheduleForm.endDate) {
      toast.error('Please enter at least a start or end date');
      return;
    }

    try {
      await onScheduleUpdate({
        startDate: scheduleForm.startDate || undefined,
        endDate: scheduleForm.endDate || undefined,
      });
      setEditingSchedule(false);
      toast.success('Schedule updated!');
    } catch (e) {
      console.error('Schedule update failed', e);
      toast.error('Failed to update schedule');
    }
  };

  const handleContactSave = async () => {
    if (!contactForm.name && !contactForm.phone && !contactForm.email) {
      toast.error('Please enter at least one contact detail');
      return;
    }

    try {
      await onContactUpdate({
        name: contactForm.name || undefined,
        phone: contactForm.phone || undefined,
        email: contactForm.email || undefined,
      });
      setEditingContact(false);
      toast.success('Contractor contact updated!');
    } catch (e) {
      console.error('Contact update failed', e);
      toast.error('Failed to update contractor contact');
    }
  };

  const projectStatus = project.status ?? 'pending';
  const awardedPro = project.professionals?.find((pp) => pp.status === 'awarded');
  const projectCostValue = Number(awardedPro?.quoteAmount || project.approvedBudget || project.budget || 0);

  return (
    <div className="space-y-4">
      <AccordionGroup>
        {/* Project Details */}
        <AccordionItem
          id="project-details"
          title="Project Details"
          isOpen={expandedAccordions['project-details'] !== false}
          onToggle={onToggleAccordion}
        >
          <div className="space-y-3">
            {project.notes && (
              <div className="rounded-md bg-slate-50 px-3 py-2 text-sm border border-slate-100">
                <p className="font-semibold text-slate-800 mb-1">Description</p>
                <p className="text-slate-700 leading-relaxed">{project.notes}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-slate-50 p-3 border border-slate-100">
                <p className="text-xs text-slate-600 font-semibold uppercase">Status</p>
                <span
                  className={`inline-block rounded-full px-2 py-1 text-xs font-semibold capitalize mt-1 ${
                    projectStatusBadge[projectStatus] || 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {projectStatus.replace('_', ' ')}
                </span>
              </div>

              <div className="rounded-md bg-slate-50 p-3 border border-slate-100">
                <p className="text-xs text-slate-600 font-semibold uppercase">Region</p>
                <p className="text-slate-900 font-medium mt-1">{project.region}</p>
              </div>

              {project.budget && (
                <div className="rounded-md bg-slate-50 p-3 border border-slate-100">
                  <p className="text-xs text-slate-600 font-semibold uppercase">Budget</p>
                  <p className="text-slate-900 font-medium mt-1">{formatHKD(project.budget)}</p>
                </div>
              )}

              {project.approvedBudget && (
                <div className="rounded-md bg-blue-50 p-3 border border-blue-100">
                  <p className="text-xs text-blue-600 font-semibold uppercase">Approved Budget</p>
                  <p className="text-blue-900 font-medium mt-1">{formatHKD(project.approvedBudget)}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 text-xs text-slate-500 border-t border-slate-200 pt-3">
              {project.createdAt && <span>Created: {formatDate(project.createdAt)}</span>}
              {project.updatedAt && <span>Updated: {formatDate(project.updatedAt)}</span>}
            </div>
          </div>
        </AccordionItem>

        {/* Schedule & Contractor Contact */}
        <AccordionItem
          id="schedule-contact"
          title="Schedule & Contractor Contact"
          isOpen={expandedAccordions['schedule-contact'] === true}
          onToggle={onToggleAccordion}
        >
          <div className="space-y-4">
            {/* Schedule Section */}
            <div className="rounded-md bg-slate-50 p-4 border border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-900">Schedule</h4>
                {!editingSchedule && (
                  <button
                    onClick={() => setEditingSchedule(true)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition"
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>

              {editingSchedule ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={scheduleForm.startDate}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, startDate: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                    <input
                      type="date"
                      value={scheduleForm.endDate}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, endDate: e.target.value })}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      onClick={() => setEditingSchedule(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleScheduleSave}
                      disabled={isUpdatingSchedule}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      {isUpdatingSchedule ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Start Date</p>
                    <p className="font-medium text-slate-900">{formatDate(project.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 mb-1">End Date</p>
                    <p className="font-medium text-slate-900">{formatDate(project.endDate)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Contractor Contact Section */}
            <div className="rounded-md bg-slate-50 p-4 border border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-900">Contractor Contact</h4>
                {!editingContact && (
                  <button
                    onClick={() => setEditingContact(true)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition"
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>

              {editingContact ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Name</label>
                    <input
                      type="text"
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      placeholder="e.g., John Doe"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      placeholder="e.g., +852 1234 5678"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="e.g., john@example.com"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      onClick={() => setEditingContact(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-md hover:bg-slate-100 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleContactSave}
                      disabled={isUpdatingContact}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      {isUpdatingContact ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Name</p>
                    <p className="font-medium text-slate-900">{project.contractorContactName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Phone</p>
                    <p className="font-medium text-slate-900">{project.contractorContactPhone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Email</p>
                    <p className="font-medium text-slate-900">{project.contractorContactEmail || '—'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </AccordionItem>

        {/* Progress & Financials */}
        <AccordionItem
          id="progress-financials"
          title="Progress & Financials"
          isOpen={expandedAccordions['progress-financials'] === true}
          onToggle={onToggleAccordion}
        >
          <div className="space-y-4">
            {/* Project Progress Bar */}
            <ProjectProgressBar
              project={{
                id: project.id,
                status: project.status,
                startDate: project.startDate,
                endDate: project.endDate,
                professionals:
                  project.professionals?.map((p) => ({
                    status: p.status,
                    quoteAmount: p.quoteAmount,
                    invoice: p.invoice || null,
                  })) || [],
              }}
              hasAssist={false}
              variant="compact"
              fundsSecured={fundsSecured}
            />

            {/* Project Financials */}
            {accessToken && (
              <ProjectFinancialsCard
                projectId={project.id}
                accessToken={accessToken}
                projectCost={projectCostValue}
                originalBudget={project.budget}
                role="client"
                onClarify={() => {
                  // This callback could trigger navigation to chat tab
                  // For now, just console log
                  console.log('Clarify clicked');
                }}
              />
            )}
          </div>
        </AccordionItem>
      </AccordionGroup>
    </div>
  );
};
