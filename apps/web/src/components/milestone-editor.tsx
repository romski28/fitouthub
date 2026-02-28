"use client";

import React, { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown, AlertCircle, Check } from "lucide-react";
import { API_BASE_URL } from "@/config/api";

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
  startTimeSlot?: "AM" | "PM" | "ALL_DAY";
  endTimeSlot?: "AM" | "PM" | "ALL_DAY";
  estimatedHours?: number;
  siteAccessRequired?: boolean;
  siteAccessNotes?: string;
  description?: string;
}

interface MilestoneEditorProps {
  tradeId?: string;
  defaultMilestones?: MilestoneEditData[];
  onMilestonesChange: (milestones: MilestoneEditData[]) => void;
  showSavedList?: boolean;
}

export function MilestoneEditor({
  tradeId,
  defaultMilestones = [],
  onMilestonesChange,
  showSavedList = true,
}: MilestoneEditorProps) {
  // Saved milestones from defaults
  const [savedMilestones, setSavedMilestones] = useState<MilestoneEditData[]>(
    defaultMilestones
  );
  
  // Current form being edited
  const [currentMilestone, setCurrentMilestone] = useState<MilestoneEditData>({
    title: "",
    sequence: 0,
    status: "not_started",
    percentComplete: 0,
    siteAccessRequired: true,
    description: "",
  });

  const [templates, setTemplates] = useState<MilestoneTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateExpanded, setTemplateExpanded] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const deriveStatus = (percentComplete: number) => {
    if (percentComplete >= 100) return "completed" as const;
    if (percentComplete <= 0) return "not_started" as const;
    return "in_progress" as const;
  };

  // Load templates when tradeId changes
  useEffect(() => {
    if (!tradeId) return;

    const loadTemplates = async () => {
      try {
        setLoadingTemplates(true);
        const res = await fetch(
          `${API_BASE_URL}/milestones/templates/trade/${tradeId}`
        );
        if (res.ok) {
          const data = await res.json();
          setTemplates(data);
        }
      } catch (error) {
        console.error("Failed to load milestone templates:", error);
      } finally {
        setLoadingTemplates(false);
      }
    };

    loadTemplates();
  }, [tradeId]);

  // Pre-populate form when editing a single milestone directly
  useEffect(() => {
    if (defaultMilestones.length === 1) {
      setCurrentMilestone({
        ...defaultMilestones[0],
        status: deriveStatus(defaultMilestones[0].percentComplete),
      });
    }
  }, [defaultMilestones]);

  const formatHumanDate = (dateStr?: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Convert ISO date string to yyyy-MM-dd format for HTML date inputs
  const toDateInputFormat = (dateStr?: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().split("T")[0];
  };

  const handleSaveMilestone = () => {
    if (!currentMilestone.title.trim()) {
      alert("Please enter a milestone title");
      return;
    }

    const normalizedMilestone: MilestoneEditData = {
      ...currentMilestone,
      status: deriveStatus(currentMilestone.percentComplete),
    };

    let updated: MilestoneEditData[];
    if (editingIndex !== null) {
      // Update existing
      updated = savedMilestones.map((m, idx) => 
        idx === editingIndex ? normalizedMilestone : m
      );
      setEditingIndex(null);
    } else {
      // Add new
      updated = [...savedMilestones, normalizedMilestone];
    }

    setSavedMilestones(updated);
    onMilestonesChange(updated);

    // Reset form
    setCurrentMilestone({
      title: "",
      sequence: 0,
      status: "not_started",
      percentComplete: 0,
      description: "",
    });
  };

  const handleEditMilestone = (index: number) => {
    const milestone = savedMilestones[index];
    setCurrentMilestone({
      ...milestone,
      status: deriveStatus(milestone.percentComplete),
      plannedStartDate: toDateInputFormat(milestone.plannedStartDate),
      plannedEndDate: toDateInputFormat(milestone.plannedEndDate),
    });
    setEditingIndex(index);
  };

  const handleDeleteMilestone = (index: number) => {
    const updated = savedMilestones.filter((_, idx) => idx !== index);
    setSavedMilestones(updated);
    onMilestonesChange(updated);
    if (editingIndex === index) {
      setEditingIndex(null);
      setCurrentMilestone({
        title: "",
        sequence: updated.length + 1,
        status: "not_started",
        percentComplete: 0,
        description: "",
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setCurrentMilestone({
      title: "",
      sequence: 0,
      status: "not_started",
      percentComplete: 0,
      description: "",
    });
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

    setSavedMilestones(templateMilestones);
    onMilestonesChange(templateMilestones);
    setTemplateExpanded(false);
  };

  return (
    <div className="space-y-4">
      {/* Form Section */}
      <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
        <h4 className="text-sm font-semibold text-slate-900 mb-4">
          {editingIndex !== null ? "Edit Milestone" : "Add New Milestone"}
        </h4>

        <div className="space-y-3">
          {/* Milestone Title */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Milestone Title *
            </label>
            <input
              type="text"
              value={currentMilestone.title}
              onChange={(e) =>
                setCurrentMilestone(prev => ({
                  ...prev,
                  title: e.target.value
                }))
              }
              placeholder="e.g., Site Inspection, Rough-in Wiring"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Compact Line: %, Start Date, End Date */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                % Complete
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={currentMilestone.percentComplete}
                onChange={(e) => {
                  const nextValue = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                  setCurrentMilestone(prev => ({
                    ...prev,
                    percentComplete: nextValue,
                    status: deriveStatus(nextValue),
                  }));
                }}
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={toDateInputFormat(currentMilestone.plannedStartDate)}
                onChange={(e) =>
                  setCurrentMilestone(prev => ({
                    ...prev,
                    plannedStartDate: e.target.value || undefined,
                    plannedEndDate: e.target.value || undefined
                  }))
                }
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={toDateInputFormat(currentMilestone.plannedEndDate)}
                onChange={(e) =>
                  setCurrentMilestone(prev => ({
                    ...prev,
                    plannedEndDate: e.target.value || undefined,
                    startTimeSlot: prev.plannedStartDate && e.target.value && prev.plannedStartDate !== e.target.value
                      ? "ALL_DAY"
                      : prev.startTimeSlot,
                    endTimeSlot: prev.plannedStartDate && e.target.value && prev.plannedStartDate !== e.target.value
                      ? "ALL_DAY"
                      : prev.endTimeSlot,
                  }))
                }
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Time Slots & Site Access Row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Time
              </label>
              <select
                value={currentMilestone.startTimeSlot || ""}
                onChange={(e) =>
                  setCurrentMilestone(prev => ({
                    ...prev,
                    startTimeSlot: (e.target.value || undefined) as "AM" | "PM" | "ALL_DAY" | undefined,
                    endTimeSlot: (e.target.value || undefined) as "AM" | "PM" | "ALL_DAY" | undefined
                  }))
                }
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Any</option>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
                <option value="ALL_DAY">All Day</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Est. Hours
              </label>
              <input
                type="number"
                min="0"
                max="999"
                value={currentMilestone.estimatedHours || ""}
                onChange={(e) =>
                  setCurrentMilestone(prev => ({
                    ...prev,
                    estimatedHours: e.target.value ? parseInt(e.target.value) : undefined
                  }))
                }
                placeholder="Optional"
                className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={currentMilestone.siteAccessRequired ?? true}
                  onChange={(e) =>
                    setCurrentMilestone(prev => ({
                      ...prev,
                      siteAccessRequired: e.target.checked
                    }))
                  }
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                Site Access
              </label>
            </div>
          </div>

          {/* Site Access Notes (conditional) */}
          {currentMilestone.siteAccessRequired && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Site Access Notes
              </label>
              <input
                type="text"
                value={currentMilestone.siteAccessNotes || ""}
                onChange={(e) =>
                  setCurrentMilestone(prev => ({
                    ...prev,
                    siteAccessNotes: e.target.value || undefined
                  }))
                }
                placeholder="e.g., Need 2-hour window, parking required"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Milestone Notes
            </label>
            <textarea
              value={currentMilestone.description || ""}
              onChange={(e) =>
                setCurrentMilestone(prev => ({
                  ...prev,
                  description: e.target.value
                }))
              }
              placeholder="Notes, materials, or access details"
              rows={2}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Template Suggestion */}
          {templates.length > 0 && savedMilestones.length === 0 && (
            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs">
              <button
                onClick={() => setTemplateExpanded(!templateExpanded)}
                className="flex items-center justify-between w-full text-blue-700 font-medium"
              >
                <span>📋 Use predefined template?</span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${
                    templateExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>
              {templateExpanded && (
                <div className="mt-2 pt-2 border-t border-blue-200">
                  <button
                    onClick={handleApplyTemplate}
                    className="w-full px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors mt-1"
                  >
                    Apply Template ({templates.length} stages)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Form Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSaveMilestone}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
            >
              <Check className="w-4 h-4" />
              Save Milestone
            </button>
            {editingIndex !== null && (
              <button
                onClick={handleCancelEdit}
                className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-200 rounded hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Saved Milestones List */}
      {showSavedList && savedMilestones.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
            Added Milestones ({savedMilestones.length})
          </h4>
          <div className="space-y-2">
            {savedMilestones.map((milestone, idx) => (
              <div
                key={idx}
                className={`p-3 border rounded-lg ${
                  editingIndex === idx
                    ? "bg-blue-50 border-blue-300"
                    : "bg-white border-slate-200 hover:border-slate-300"
                } transition-colors`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        #{idx + 1}
                      </span>
                      <p className="font-medium text-sm text-slate-900 truncate">
                        {milestone.title}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                      <span>Status: <span className="font-medium text-slate-900">{deriveStatus(milestone.percentComplete).replace(/_/g, " ")}</span></span>
                      <span>% Complete: <span className="font-medium text-slate-900">{milestone.percentComplete}%</span></span>
                      {milestone.plannedStartDate && (
                        <span>Start: <span className="font-medium text-slate-900">{formatHumanDate(milestone.plannedStartDate)}</span></span>
                      )}
                      {milestone.plannedEndDate && (
                        <span>End: <span className="font-medium text-slate-900">{formatHumanDate(milestone.plannedEndDate)}</span></span>
                      )}
                    </div>
                    {milestone.description && (
                      <p className="text-xs text-slate-600 mt-1 line-clamp-1">
                        {milestone.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEditMilestone(idx)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteMilestone(idx)}
                      className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {savedMilestones.length === 0 && !currentMilestone.title && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Fill in the form above and click Save Milestone to add milestones to your project.
          </p>
        </div>
      )}
    </div>
  );
}
