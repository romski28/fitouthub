"use client";

import React, { useEffect, useState } from "react";
import { Calendar, Clock, MapPin, AlertCircle, ArrowLeft } from "lucide-react";
import { API_BASE_URL } from "@/config/api";
import { useRouter } from "next/navigation";

interface CalendarMilestone {
  id: string;
  title: string;
  sequence: number;
  status: "not_started" | "in_progress" | "completed";
  percentComplete: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  startTimeSlot?: string | null;
  endTimeSlot?: string | null;
  estimatedHours?: number | null;
  siteAccessRequired: boolean;
  siteAccessNotes?: string | null;
  description?: string | null;
  projectProfessional: {
    id: string;
    project: {
      id: string;
      projectName: string;
      clientName: string;
      status: string;
      region: string;
    };
  };
}

interface GroupedMilestones {
  [date: string]: CalendarMilestone[];
}

export default function ProfessionalCalendarPage() {
  const router = useRouter();
  const [milestones, setMilestones] = useState<CalendarMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "month">("list");

  useEffect(() => {
    loadCalendar();
  }, []);

  const loadCalendar = async () => {
    try {
      setLoading(true);
      setError(null);

      const accessToken = localStorage.getItem("professionalAccessToken");
      const professionalIdStr = localStorage.getItem("professionalId");

      if (!accessToken || !professionalIdStr) {
        setError("Please log in to view your calendar");
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/milestones/calendar/${professionalIdStr}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to load calendar");
      }

      const data = await response.json();
      setMilestones(data);
    } catch (err) {
      console.error("Error loading calendar:", err);
      setError(err instanceof Error ? err.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  };

  const groupByDate = (milestones: CalendarMilestone[]): GroupedMilestones => {
    const grouped: GroupedMilestones = {};
    
    milestones.forEach((milestone) => {
      if (milestone.plannedStartDate) {
        const date = new Date(milestone.plannedStartDate).toISOString().split("T")[0];
        if (!grouped[date]) {
          grouped[date] = [];
        }
        grouped[date].push(milestone);
      }
    });

    return grouped;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-300";
      case "in_progress":
        return "bg-blue-100 text-blue-800 border-blue-300";
      default:
        return "bg-slate-100 text-slate-800 border-slate-300";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "in_progress":
        return "In Progress";
      default:
        return "Not Started";
    }
  };

  const getTimeSlotLabel = (slot?: string | null) => {
    if (!slot) return "Flexible";
    switch (slot) {
      case "AM":
        return "Morning";
      case "PM":
        return "Afternoon";
      case "ALL_DAY":
        return "All Day";
      default:
        return slot;
    }
  };

  const groupedMilestones = groupByDate(milestones);
  const sortedDates = Object.keys(groupedMilestones).sort();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Calendar className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-pulse" />
              <p className="text-slate-600">Loading your schedule...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-slate-100 rounded-lg transition"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-7 h-7 text-blue-600" />
                  My Schedule
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  {milestones.length} milestone{milestones.length !== 1 ? "s" : ""} across{" "}
                  {new Set(milestones.map(m => m.projectProfessional.project.id)).size} project
                  {new Set(milestones.map(m => m.projectProfessional.project.id)).size !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setViewMode("list")}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                  viewMode === "list"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                List View
              </button>
              <button
                onClick={() => setViewMode("month")}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                  viewMode === "month"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
                disabled
              >
                Month View (Soon)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-900">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {milestones.length === 0 && !error ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No scheduled milestones</h3>
            <p className="text-slate-600 mb-4">
              Milestones with planned dates will appear here
            </p>
            <button
              onClick={() => router.push("/professional-projects")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              View Projects
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedDates.map((date) => (
              <div key={date} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Date Header */}
                <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900">{formatDate(date)}</h2>
                </div>

                {/* Milestones for this date */}
                <div className="divide-y divide-slate-100">
                  {groupedMilestones[date].map((milestone) => (
                    <div
                      key={milestone.id}
                      className="p-6 hover:bg-slate-50 transition cursor-pointer"
                      onClick={() =>
                        router.push(
                          `/professional-projects/${milestone.projectProfessional.project.id}`
                        )
                      }
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          {/* Project Name */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                              {milestone.projectProfessional.project.projectName}
                            </span>
                            <span className="text-xs text-slate-500">
                              {milestone.projectProfessional.project.clientName}
                            </span>
                          </div>

                          {/* Milestone Title */}
                          <h3 className="text-base font-semibold text-slate-900 mb-2">
                            {milestone.sequence}. {milestone.title}
                          </h3>

                          {/* Description */}
                          {milestone.description && (
                            <p className="text-sm text-slate-600 mb-3">{milestone.description}</p>
                          )}

                          {/* Meta Info */}
                          <div className="flex flex-wrap items-center gap-4 text-sm">
                            {/* Time Slot */}
                            {milestone.startTimeSlot && (
                              <div className="flex items-center gap-1.5 text-slate-600">
                                <Clock className="w-4 h-4" />
                                <span>{getTimeSlotLabel(milestone.startTimeSlot)}</span>
                              </div>
                            )}

                            {/* Estimated Hours */}
                            {milestone.estimatedHours && (
                              <div className="flex items-center gap-1.5 text-slate-600">
                                <Clock className="w-4 h-4" />
                                <span>{milestone.estimatedHours}h estimated</span>
                              </div>
                            )}

                            {/* Site Access */}
                            {milestone.siteAccessRequired && (
                              <div className="flex items-center gap-1.5 text-amber-600">
                                <MapPin className="w-4 h-4" />
                                <span>Site access required</span>
                              </div>
                            )}

                            {/* Status Badge */}
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded border ${getStatusColor(
                                milestone.status
                              )}`}
                            >
                              {getStatusLabel(milestone.status)} ({milestone.percentComplete}%)
                            </span>
                          </div>

                          {/* Site Access Notes */}
                          {milestone.siteAccessNotes && (
                            <div className="mt-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded border border-amber-200">
                              <strong>Access Notes:</strong> {milestone.siteAccessNotes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
