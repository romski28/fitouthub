"use client";

import React, { useEffect, useState } from "react";
import { Calendar, Clock, AlertCircle, ArrowLeft, List, Grid3x3, Plus } from "lucide-react";
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

  const getStatusPercent = (status: string, percentComplete: number) => {
    if (status === "completed") return 100;
    if (status === "not_started") return 0;
    return percentComplete;
  };

  const formatWeekday = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
    });
  };

  const formatDayMonth = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
    });
  };

  const isSameDate = (date1?: string | null, date2?: string | null) => {
    if (!date1 || !date2) return true;
    return date1.split("T")[0] === date2.split("T")[0];
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
                  {milestones.length} task{milestones.length !== 1 ? "s" : ""} across{" "}
                  {new Set(milestones.map(m => m.projectProfessional.project.id)).size} project
                  {new Set(milestones.map(m => m.projectProfessional.project.id)).size !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="flex gap-2 items-center">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-lg transition ${
                  viewMode === "list"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title="List View"
              >
                <List className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode("month")}
                className={`p-2 rounded-lg transition ${
                  viewMode === "month"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                disabled
                title="Month View (Coming Soon)"
              >
                <Grid3x3 className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-slate-200 mx-2" />
              <button
                onClick={() => {
                  // TODO: Open add task modal/form
                  alert("Add new task - feature coming soon");
                }}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                <span className="text-sm font-medium">Add Task</span>
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
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No scheduled tasks</h3>
            <p className="text-slate-600 mb-4">
              Tasks with planned dates will appear here
            </p>
            <button
              onClick={() => router.push("/professional-projects")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              View Projects
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedDates.map((date) =>
              groupedMilestones[date].map((milestone) => {
                const statusPercent = getStatusPercent(milestone.status, milestone.percentComplete);
                const statusLabel =
                  statusPercent === 100 ? "Complete" :
                  statusPercent === 0 ? "Not Started" :
                  `${statusPercent}% Complete`;
                const showProgressBar = statusPercent > 0 && statusPercent < 100;
                const sameDate = isSameDate(milestone.plannedStartDate, milestone.plannedEndDate);

                return (
                  <div
                    key={milestone.id}
                    className="bg-white rounded-xl border border-slate-200 hover:bg-slate-50 transition cursor-pointer overflow-hidden"
                    onClick={() =>
                      router.push(
                        `/professional-projects/${milestone.projectProfessional.id}`
                      )
                    }
                  >
                    <div className="flex items-stretch min-h-[80px]">
                      <div className="w-28 sm:w-32 bg-slate-900 text-white flex flex-col items-center justify-center px-2 py-3">
                        {sameDate ? (
                          <>
                            <div className="text-xs font-semibold uppercase tracking-wide">
                              {formatWeekday(date)}
                            </div>
                            <div className="text-sm font-semibold mt-1">
                              {formatDayMonth(date)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-[10px] font-semibold">
                              {formatDayMonth(milestone.plannedStartDate!)}
                            </div>
                            <div className="text-[9px] font-medium my-0.5">thru</div>
                            <div className="text-[10px] font-semibold">
                              {formatDayMonth(milestone.plannedEndDate!)}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex-1 p-3">
                        {/* Grid: Milestone Title, Key, Status */}
                        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-2 items-center mb-2">
                          <h3 className="text-base font-semibold text-slate-900 col-span-1">
                            {milestone.title}
                          </h3>
                          {milestone.siteAccessRequired && (
                            <div className="text-lg" title="Site access required">
                              🔑
                            </div>
                          )}
                          {showProgressBar ? (
                            <div className="w-32 sm:w-40">
                              <div className="relative h-4 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
                                <div
                                  className="absolute left-0 top-0 h-full bg-emerald-500"
                                  style={{ width: `${statusPercent}%` }}
                                />
                                <span className="relative z-10 block text-[10px] font-semibold text-slate-800 text-center leading-4">
                                  {statusPercent}%
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className={`text-xs font-semibold whitespace-nowrap ${
                              statusPercent === 100 ? "text-emerald-600" : "text-slate-600"
                            }`}>
                              {statusLabel}
                            </span>
                          )}
                        </div>

                        {/* Line 2: Project for Client */}
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-xs font-medium text-blue-600">
                            {milestone.projectProfessional.project.projectName}
                          </span>
                          <span className="text-xs text-slate-400">for</span>
                          <span className="text-xs text-slate-600">
                            {milestone.projectProfessional.project.clientName}
                          </span>
                        </div>

                        {/* Description - Body Text */}
                        {milestone.description && (
                          <p className="text-sm text-slate-600 mt-3 mb-3 leading-relaxed">
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
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
