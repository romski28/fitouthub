"use client";

import React, { useState } from "react";
import { ChevronRight, AlertCircle } from "lucide-react";
import { ImageLightbox } from "./image-lightbox";

interface Milestone {
  id: string;
  title: string;
  sequence: number;
  status: "not_started" | "in_progress" | "completed";
  percentComplete: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualEndDate?: string;
  description?: string;
  photoUrls: string[];
}

interface MilestoneTimelineProps {
  milestones: Milestone[];
  title?: string;
  showPhotos?: boolean;
  editable?: boolean;
  onStatusChange?: (milestoneId: string, newStatus: string) => void;
  onPhotoUpload?: (milestoneId: string, files: File[]) => void;
}

const statusConfig = {
  not_started: {
    label: "Not Started",
    color: "bg-slate-100",
    textColor: "text-slate-600",
    borderColor: "border-slate-200",
    dotColor: "bg-slate-400",
    progressColor: "bg-slate-200",
  },
  in_progress: {
    label: "In Progress",
    color: "bg-blue-50",
    textColor: "text-blue-700",
    borderColor: "border-blue-200",
    dotColor: "bg-blue-500",
    progressColor: "bg-blue-400",
  },
  completed: {
    label: "Completed",
    color: "bg-emerald-50",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-200",
    dotColor: "bg-emerald-500",
    progressColor: "bg-emerald-500",
  },
};

export function MilestoneTimeline({
  milestones,
  title = "Project Timeline",
  showPhotos = true,
  editable = false,
  onStatusChange,
  onPhotoUpload,
}: MilestoneTimelineProps) {
  const [expandedMilestone, setExpandedMilestone] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxStartIndex, setLightboxStartIndex] = useState(0);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);

  if (!milestones || milestones.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 px-4 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertCircle className="w-5 h-5 text-amber-600 mr-2" />
        <p className="text-sm text-amber-700">No milestones added yet</p>
      </div>
    );
  }

  const completedCount = milestones.filter(
    (m) => m.status === "completed"
  ).length;
  const overallProgress = Math.round(
    (completedCount / milestones.length) * 100
  );

  const handlePhotoClick = (milestone: Milestone, index: number) => {
    setLightboxImages(milestone.photoUrls);
    setLightboxStartIndex(index);
    setLightboxOpen(true);
  };

  const sortedMilestones = [...milestones].sort(
    (a, b) => a.sequence - b.sequence
  );

  return (
    <div className="space-y-4">
      {/* Header with Progress */}
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-2">{title}</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all duration-300"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
            {completedCount}/{milestones.length}
          </span>
        </div>
      </div>

      {/* Timeline Container */}
      <div className="space-y-3">
        {sortedMilestones.map((milestone, idx) => {
          const config = statusConfig[milestone.status];
          const isExpanded = expandedMilestone === milestone.id;

          return (
            <div key={milestone.id}>
              {/* Timeline Item */}
              <button
                onClick={() =>
                  setExpandedMilestone(
                    isExpanded ? null : milestone.id
                  )
                }
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${config.color} ${config.borderColor} hover:shadow-sm`}
              >
                <div className="flex items-start gap-3">
                  {/* Timeline Dot & Connector */}
                  <div className="flex flex-col items-center mt-1">
                    <div
                      className={`w-3 h-3 rounded-full ${config.dotColor} flex-shrink-0`}
                    />
                    {idx < sortedMilestones.length - 1 && (
                      <div className="w-0.5 h-6 bg-slate-200 my-1" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className={`font-medium text-sm ${config.textColor}`}>
                          {milestone.title}
                        </p>
                        {milestone.status === "completed" && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Completed{" "}
                            {milestone.actualEndDate
                              ? new Date(
                                  milestone.actualEndDate
                                ).toLocaleDateString()
                              : ""}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-auto">
                        {/* Percentage Badge */}
                        {milestone.status !== "not_started" && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${config.color} ${config.textColor} border ${config.borderColor}`}
                          >
                            {milestone.percentComplete}%
                          </span>
                        )}

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${config.color} ${config.textColor} border ${config.borderColor}`}
                        >
                          {config.label}
                        </span>

                        {/* Expand Icon */}
                        <ChevronRight
                          className={`w-4 h-4 ${config.textColor} transition-transform flex-shrink-0 ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="ml-8 mt-2 mb-3 border-l-2 border-slate-300 pl-4 space-y-3">
                  {/* Description */}
                  {milestone.description && (
                    <p className="text-sm text-slate-600">
                      {milestone.description}
                    </p>
                  )}

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {milestone.plannedStartDate && (
                      <div>
                        <p className="font-semibold text-slate-600">
                          Planned Start
                        </p>
                        <p className="text-slate-500">
                          {new Date(
                            milestone.plannedStartDate
                          ).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {milestone.plannedEndDate && (
                      <div>
                        <p className="font-semibold text-slate-600">
                          Planned End
                        </p>
                        <p className="text-slate-500">
                          {new Date(milestone.plannedEndDate).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Photos */}
                  {showPhotos && milestone.photoUrls && milestone.photoUrls.length > 0 && (
                    <div>
                      <p className="font-semibold text-slate-600 text-xs mb-2">
                        Progress Photos
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {milestone.photoUrls.map((url, idx) => (
                          <button
                            key={idx}
                            onClick={() => handlePhotoClick(milestone, idx)}
                            className="relative aspect-square rounded overflow-hidden border border-slate-200 hover:border-slate-400 transition-colors"
                          >
                            <img
                              src={url}
                              alt={`${milestone.title} - Photo ${idx + 1}`}
                              className="w-full h-full object-cover hover:scale-105 transition-transform"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Status Controls (if editable) */}
                  {editable && (
                    <div className="pt-2 border-t border-slate-200 space-y-3">
                      <div>
                        <p className="font-semibold text-slate-600 text-xs mb-2">
                          Update Progress
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={milestone.percentComplete}
                            onChange={(e) => {
                              onStatusChange?.(milestone.id, `progress:${e.target.value}`);
                            }}
                            className="flex-1"
                          />
                          <span className="text-xs font-semibold text-slate-600 min-w-fit">
                            {milestone.percentComplete}%
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="font-semibold text-slate-600 text-xs mb-2">
                          Update Status
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {Object.entries(statusConfig).map(([status, cfg]) => (
                            <button
                              key={status}
                              onClick={() => {
                                onStatusChange?.(milestone.id, status);
                              }}
                              className={`px-2 py-1 text-xs font-medium rounded border transition-all ${
                                milestone.status === status
                                  ? `${cfg.color} ${cfg.borderColor} border-2`
                                  : "bg-white border-slate-300 text-slate-600 hover:border-slate-400"
                              }`}
                            >
                              {cfg.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox Modal */}
      {lightboxOpen && (
        <ImageLightbox
          images={lightboxImages}
          startIndex={lightboxStartIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}
