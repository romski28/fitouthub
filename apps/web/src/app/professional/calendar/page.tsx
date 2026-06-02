"use client";

import React, { useEffect, useState } from "react";
import { Calendar, Clock, AlertCircle, ArrowLeft, List, Grid3x3, Settings } from "lucide-react";
import Link from "next/link";
import { API_BASE_URL } from "@/config/api";
import { useRouter } from "next/navigation";
import { useProfessionalAuth } from "@/context/professional-auth-context";
import { fetchWithRetry } from "@/lib/http";

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

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function TodayView({ grouped, sortedDates, router }: {
  grouped: GroupedMilestones;
  sortedDates: string[];
  router: ReturnType<typeof useRouter>;
}) {
  const today = new Date();
  const todayKey = today.toISOString().split("T")[0];
  const todayMilestones = grouped[todayKey] || [];
  const dayLabel = `${DAYS[today.getDay()]}, ${today.getDate()} ${MONTHS[today.getMonth()]} ${today.getFullYear()}`;

  const nextIndex = sortedDates.findIndex((d) => d > todayKey);
  const nextDate = nextIndex >= 0 ? sortedDates[nextIndex] : null;
  const nextMilestones = nextDate ? grouped[nextDate] : [];

  const formatSlot = (slot?: string | null) => {
    if (!slot) return null;
    if (slot === "ALL_DAY") return "All day";
    if (slot === "AM") return "Morning";
    if (slot === "PM") return "Afternoon";
    return slot;
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-lg font-bold text-slate-900">{dayLabel}</h2>
      </div>

      {todayMilestones.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">Nothing scheduled today.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {todayMilestones.map((m) => {
            const slot = formatSlot(m.startTimeSlot);
            return (
              <div
                key={m.id}
                onClick={() => router.push(`/professional-projects/${m.projectProfessional.id}`)}
                className="bg-white rounded-xl border border-slate-200 hover:bg-slate-50 transition cursor-pointer p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">{m.title}</h3>
                      {m.siteAccessRequired && <span title="Site access required">🔑</span>}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {m.projectProfessional.project.projectName} · {m.projectProfessional.project.clientName}
                    </p>
                  </div>
                  {slot && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                      {slot}
                    </span>
                  )}
                </div>
                {m.description && (
                  <p className="text-sm text-slate-600 mt-2">{m.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {nextDate && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Next</p>
          {nextMilestones.slice(0, 2).map((m) => {
            const nextDay = new Date(nextDate);
            const nextDayLabel = `${DAYS[nextDay.getDay()]}, ${nextDay.getDate()} ${MONTHS[nextDay.getMonth()]}`;
            const slot = formatSlot(m.startTimeSlot);
            return (
              <div key={m.id} className="flex items-center justify-between py-1">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{m.title}</p>
                  <p className="text-xs text-slate-500">{nextDayLabel}{slot ? ` · ${slot}` : ''}</p>
                </div>
                <span className="text-xs text-slate-400">{m.projectProfessional.project.projectName}</span>
              </div>
            );
          })}
          {nextMilestones.length > 2 && (
            <p className="text-xs text-slate-400 mt-1">+{nextMilestones.length - 2} more on {DAYS[new Date(nextDate).getDay()]}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProfessionalCalendarPage() {
  const router = useRouter();
  const { professional, accessToken: contextToken, isLoggedIn } = useProfessionalAuth();
  const [milestones, setMilestones] = useState<CalendarMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"today" | "week" | "list">("today");

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

      const response = await fetchWithRetry(
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
                onClick={() => setViewMode("today")}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  viewMode === "today"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setViewMode("week")}
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
                onClick={() => setViewMode("week")}
                className={`p-2 rounded-lg transition ${
                  viewMode === "week"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title="Week View"
              >
                <Grid3x3 className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-slate-200 mx-2" />
              <Link
                href="/professional/profile"
                className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition flex items-center gap-2 text-sm font-medium"
              >
                <Settings className="w-4 h-4" />
                Availability
              </Link>
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
        ) : viewMode === "today" ? (
          <TodayView
            grouped={groupedMilestones}
            sortedDates={sortedDates}
            router={router}
          />
        ) : viewMode === "week" ? (
          <div className="grid grid-cols-7 gap-2">
            {(() => {
              const today = new Date();
              const dayOfWeek = today.getDay();
              const startOfWeek = new Date(today);
              startOfWeek.setDate(today.getDate() - dayOfWeek);
              const weekDays = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(startOfWeek);
                d.setDate(startOfWeek.getDate() + i);
                return d;
              });
              return weekDays.map((day) => {
                const dateKey = day.toISOString().split("T")[0];
                const dayMilestones = groupedMilestones[dateKey] || [];
                const isToday = dateKey === today.toISOString().split("T")[0];
                return (
                  <div
                    key={dateKey}
                    className={`rounded-lg border p-2 min-h-[120px] ${
                      isToday ? "border-blue-400 bg-blue-50/60" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className={`text-xs font-semibold mb-1.5 ${isToday ? "text-blue-700" : "text-slate-500"}`}>
                      {day.toLocaleDateString("en-US", { weekday: "short" })}
                      <span className="ml-1 font-normal">{day.getDate()}</span>
                    </div>
                    <div className="space-y-1">
                      {dayMilestones.length === 0 ? (
                        <p className="text-[10px] text-slate-400">Open</p>
                      ) : (
                        dayMilestones.slice(0, 4).map((m) => (
                          <div
                            key={m.id}
                            onClick={() => router.push(`/professional-projects/${m.projectProfessional.id}`)}
                            className="cursor-pointer rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 truncate hover:bg-blue-200"
                            title={m.title}
                          >
                            {m.title}
                          </div>
                        ))
                      )}
                      {dayMilestones.length > 4 && (
                        <p className="text-[10px] text-slate-400">+{dayMilestones.length - 4} more</p>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
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
