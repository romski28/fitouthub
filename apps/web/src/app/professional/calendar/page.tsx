"use client";

import React, { useEffect, useState } from "react";
import { Calendar, Clock, AlertCircle, ArrowLeft } from "lucide-react";
import { API_BASE_URL } from "@/config/api";
import { useRouter } from "next/navigation";
import { useProfessionalAuth } from "@/context/professional-auth-context";

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
  const { professional, accessToken: contextToken, isLoggedIn } = useProfessionalAuth();
  const [milestones, setMilestones] = useState<CalendarMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "month">("list");

  useEffect(() => {
    loadCalendar();
  }, [professional?.id, contextToken, isLoggedIn]);

  const loadCalendar = async () => {
    try {
      setLoading(true);
      setError(null);

      const accessToken = contextToken || localStorage.getItem("professionalAccessToken");
      const storedProfessional = localStorage.getItem("professional");
      let storedProfessionalId: string | undefined;
      if (storedProfessional) {
        try {
          storedProfessionalId = (JSON.parse(storedProfessional) as { id?: string }).id;
        } catch {
          storedProfessionalId = undefined;
        }
      }
      const professionalIdStr = professional?.id || storedProfessionalId;

      if (!accessToken || !professionalIdStr) {
        setError(isLoggedIn === false ? "Please log in to view your calendar" : "Loading your account...");
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

  const getStatusPercent = (status: string, percentComplete: number) => {
    if (status === "completed") return 100;
    if (status === "not_started") return 0;
    return percentComplete;
  };

  const formatDateShort = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
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
                  {groupedMilestones[date].map((milestone) => {
                    const statusPercent = getStatusPercent(milestone.status, milestone.percentComplete);
                    const statusLabel =
                      statusPercent === 100 ? "Complete" :
                      statusPercent === 0 ? "Not Started" :
                      `${statusPercent}% Complete`;

                    return (
                      <div
                        key={milestone.id}
                        className="p-6 hover:bg-slate-50 transition cursor-pointer border-l-4 border-l-blue-500"
                        onClick={() =>
                          router.push(
                            `/professional-projects/${milestone.projectProfessional.id}`
                          )
                        }
                      >
                        {/* Top Line: Date (left) - Milestone Title (right) - Site Access Key (far right) */}
                        <div className="flex items-center justify-between gap-4 mb-3">
                          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                            {formatDateShort(date)}
                          </span>
                          <h3 className="text-base font-semibold text-slate-900 flex-1 text-center">
                            {milestone.sequence}. {milestone.title}
                          </h3>
                          {milestone.siteAccessRequired && (
                            <div className="flex-shrink-0 text-lg" title="Site access required">
                              🔑
                            </div>
                          )}
                        </div>

                        {/* Next Line: Project - Client - Status */}
                        <div className="flex items-center justify-between gap-4 mb-4">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-xs font-medium text-blue-600 truncate">
                              {milestone.projectProfessional.project.projectName}
                            </span>
                            <span className="text-xs text-slate-500 truncate">
                              • {milestone.projectProfessional.project.clientName}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-slate-600 whitespace-nowrap flex-shrink-0">
                            {statusLabel}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-4 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all rounded-full ${
                              statusPercent === 100 ? "bg-green-500" :
                              statusPercent === 0 ? "bg-slate-300" :
                              "bg-blue-500"
                            }`}
                            style={{ width: `${statusPercent}%` }}
                          />
                        </div>

                        {/* Description - Body Text */}
                        {milestone.description && (
                          <p className="text-sm text-slate-600 mb-3 leading-relaxed">
                            {milestone.description}
                          </p>
                        )}

                        {/* Meta Info - Two columns */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {/* Time Slot */}
                          {milestone.startTimeSlot && (
                            <div className="flex items-center gap-1.5 text-slate-600">
                              <Clock className="w-4 h-4 flex-shrink-0" />
                              <span className="text-xs">
                                {milestone.startTimeSlot === "AM" ? "Morning" :
                                 milestone.startTimeSlot === "PM" ? "Afternoon" :
                                 milestone.startTimeSlot === "ALL_DAY" ? "All Day" :
                                 milestone.startTimeSlot}
                              </span>
                            </div>
                          )}

                          {/* Estimated Hours */}
                          {milestone.estimatedHours && (
                            <div className="flex items-center gap-1.5 text-slate-600">
                              <Clock className="w-4 h-4 flex-shrink-0" />
                              <span className="text-xs">{milestone.estimatedHours}h estimated</span>
                            </div>
                          )}
                        </div>

                        {/* Site Access Notes - if applicable */}
                        {milestone.siteAccessNotes && (
                          <div className="mt-3 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded border border-amber-200">
                            <strong>Access Notes:</strong> {milestone.siteAccessNotes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
