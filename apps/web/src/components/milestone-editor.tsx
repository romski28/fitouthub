"use client";

import React, { useState } from "react";
import { Plus, Trash2, ChevronDown, AlertCircle } from "lucide-react";

interface MilestoneTemplate {
  id: string;
  stageName: string;
  sequence: number;
  description?: string;
  estimatedDurationDays?: number;
}

interface MilestoneEditData {
  title: string;
  sequence: number;
  status: "not_started" | "in_progress" | "completed";
  percentComplete: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  description?: string;
}

interface MilestoneEditorProps {
  tradeId?: string;
  templates?: MilestoneTemplate[];
  defaultMilestones?: MilestoneEditData[];
  onMilestonesChange: (milestones: MilestoneEditData[]) => void;
  loadingTemplates?: boolean;
}

export function MilestoneEditor({
  tradeId,
  templates = [],
  defaultMilestones = [],
  onMilestonesChange,
  loadingTemplates = false,
}: MilestoneEditorProps) {
  const [milestones, setMilestones] = useState<MilestoneEditData[]>(
    defaultMilestones.length > 0
      ? defaultMilestones
      : [
          {
            title: "",
            sequence: 1,
            status: "not_started",
            percentComplete: 0,
            description: "",
          },
        ]
  );
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateExpanded, setTemplateExpanded] = useState(false);

  const handleAddMilestone = () => {
    const newSequence = Math.max(...milestones.map((m) => m.sequence), 0) + 1;
    const newMilestone: MilestoneEditData = {
      title: "",
      sequence: newSequence,
      status: "not_started",
      percentComplete: 0,
      description: "",
    };
    const updated = [...milestones, newMilestone];
    setMilestones(updated);
    onMilestonesChange(updated);
  };

  const handleRemoveMilestone = (sequence: number) => {
    const updated = milestones.filter((m) => m.sequence !== sequence);
    setMilestones(updated);
    onMilestonesChange(updated);
  };

  const handleMilestoneChange = (
    sequence: number,
    field: keyof MilestoneEditData,
    value: any
  ) => {
    const updated = milestones.map((m) =>
      m.sequence === sequence ? { ...m, [field]: value } : m
    );
    setMilestones(updated);
    onMilestonesChange(updated);
  };

  const handleApplyTemplate = () => {
    if (templates.length === 0) return;
    
    const templateMilestones = templates.map((t) => ({
      title: t.stageName,
      sequence: t.sequence,
      status: "not_started" as const,
      percentComplete: 0,
      description: t.description || "",
      plannedStartDate: undefined,
      plannedEndDate: undefined,
    }));
    
    setMilestones(templateMilestones);
    onMilestonesChange(templateMilestones);
    setShowTemplateForm(false);
  };

  const sortedMilestones = [...milestones].sort(
    (a, b) => a.sequence - b.sequence
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">
          Project Milestones
        </h3>
        <button
          onClick={handleAddMilestone}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Milestone
        </button>
      </div>

      {/* Template Selection */}
      {templates.length > 0 && !showTemplateForm && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <button
            onClick={() => setShowTemplateForm(true)}
            className="flex items-center justify-between w-full text-sm font-medium text-blue-700"
          >
            <span>Use predefined template for this trade?</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                templateExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
          {templateExpanded && (
            <div className="mt-2 pt-2 border-t border-blue-200">
              <p className="text-xs text-blue-600 mb-2">
                {templates.length} standard stages available
              </p>
              <button
                onClick={handleApplyTemplate}
                className="w-full px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
              >
                Apply Template
              </button>
            </div>
          )}
        </div>
      )}

      {/* Milestones List */}
      <div className="space-y-3">
        {sortedMilestones.map((milestone, idx) => (
          <div
            key={milestone.sequence}
            className="p-3 border border-slate-200 rounded-lg space-y-3 hover:border-slate-300 transition-colors"
          >
            {/* Title & Sequence */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-slate-100 rounded text-xs font-semibold text-slate-600">
                {milestone.sequence}
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={milestone.title}
                  onChange={(e) =>
                    handleMilestoneChange(
                      milestone.sequence,
                      "title",
                      e.target.value
                    )
                  }
                  placeholder="Milestone title (e.g., Site Inspection)"
                  className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => handleRemoveMilestone(milestone.sequence)}
                className="flex-shrink-0 p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Status & Percentage */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Status
                </label>
                <select
                  value={milestone.status}
                  onChange={(e) =>
                    handleMilestoneChange(
                      milestone.sequence,
                      "status",
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  % Complete
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={milestone.percentComplete}
                  onChange={(e) =>
                    handleMilestoneChange(
                      milestone.sequence,
                      "percentComplete",
                      Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                    )
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Planned Start
                </label>
                <input
                  type="date"
                  value={milestone.plannedStartDate || ""}
                  onChange={(e) =>
                    handleMilestoneChange(
                      milestone.sequence,
                      "plannedStartDate",
                      e.target.value || undefined
                    )
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Planned End
                </label>
                <input
                  type="date"
                  value={milestone.plannedEndDate || ""}
                  onChange={(e) =>
                    handleMilestoneChange(
                      milestone.sequence,
                      "plannedEndDate",
                      e.target.value || undefined
                    )
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Description
              </label>
              <textarea
                value={milestone.description || ""}
                onChange={(e) =>
                  handleMilestoneChange(
                    milestone.sequence,
                    "description",
                    e.target.value
                  )
                }
                placeholder="What happens in this phase?"
                rows={2}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Info */}
      {milestones.length === 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Add at least one milestone to track project progress.
          </p>
        </div>
      )}
    </div>
  );
}
