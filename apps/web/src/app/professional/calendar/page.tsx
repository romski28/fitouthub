"use client";

import React, { useEffect, useRef, useState } from "react";
import { Calendar, AlertCircle, ArrowLeft, List, Grid3x3, Settings } from "lucide-react";
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
                    <p className="text-sm font-medium text-slate-700">
                      {m.projectProfessional.project.projectName}
                    </p>
                    <h3 className="text-base font-semibold text-slate-900 mt-0.5">
                      {m.title}
                      {m.siteAccessRequired && <span className="ml-1.5" title="Site access required">🔑</span>}
                    </h3>
                  </div>
                  {slot && (
                    <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                      {slot}
                    </span>
                  )}
                </div>
                {m.description && (
                  <p className="text-sm text-slate-500 mt-2">{m.description}</p>
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
              <div key={m.id} className="py-1.5">
                <p className="text-xs text-slate-500">{nextDayLabel}{slot ? ` · ${slot}` : ''}</p>
                <p className="text-sm font-medium text-slate-700">{m.projectProfessional.project.projectName}</p>
                <p className="text-sm text-slate-900">{m.title}</p>
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
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) return;
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
      hasLoadedRef.current = true;
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

  const groupedMilestones = groupByDate(milestones);
  const sortedDates = Object.keys(groupedMilestones).sort();

  // Auto-scroll to today (or next milestone) when list view loads
  useEffect(() => {
    if (viewMode !== "list" || loading || sortedDates.length === 0) return;
    const today = new Date().toISOString().split("T")[0];
    const scrollToDate = sortedDates.find((d) => d >= today) || sortedDates[0];
    setTimeout(() => {
      const el = document.getElementById(`list-date-${scrollToDate}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [viewMode, loading, sortedDates]);

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
                onClick={() => setViewMode("week")}
                className={`p-2 rounded-lg transition ${
                  viewMode === "week"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                title="2-Week View"
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
          <div className="space-y-6">
            {(() => {
              const today = new Date();
              const dayOfWeek = today.getDay();
              const startOfWeek = new Date(today);
              startOfWeek.setDate(today.getDate() - dayOfWeek);

              const weeks = [0, 1].map((weekOffset) => {
                const weekStart = new Date(startOfWeek);
                weekStart.setDate(startOfWeek.getDate() + weekOffset * 7);
                const weekDays = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(weekStart);
                  d.setDate(weekStart.getDate() + i);
                  return d;
                });
                return { weekStart, weekDays };
              });

              return weeks.map(({ weekStart, weekDays }, wi) => (
                <div key={wi}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Week of {MONTHS[weekStart.getMonth()]} {weekStart.getDate()}
                  </p>
                  <div className="grid grid-cols-7 gap-2">
                    {weekDays.map((day) => {
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
                                  className="cursor-pointer rounded bg-blue-100 px-1.5 py-0.5 text-[10px] leading-tight text-blue-800 truncate hover:bg-blue-200"
                                  title={`${m.projectProfessional.project.projectName}: ${m.title}`}
                                >
                                  <span className="font-semibold">{m.projectProfessional.project.projectName}</span>
                                  <span className="text-blue-600"> · {m.title}</span>
                                </div>
                              ))
                            )}
                            {dayMilestones.length > 4 && (
                              <p className="text-[10px] text-slate-400">+{dayMilestones.length - 4} more</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        ) : (
          <div className="space-y-3">
            {sortedDates.map((date) => {
              const dateObj = new Date(date);
              const dateLabel = `${DAYS[dateObj.getDay()]}, ${dateObj.getDate()} ${MONTHS[dateObj.getMonth()]}`;
              const isToday = date === new Date().toISOString().split("T")[0];
              return (
                <div key={date} id={`list-date-${date}`}>
                  <div className={`text-xs font-semibold mb-1.5 ${isToday ? 'text-amber-700' : 'text-[rgba(120,53,15,0.6)]'}`}>
                    {dateLabel}
                    {isToday && <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">Today</span>}
                  </div>
                  <div className="space-y-1.5">
                    {groupedMilestones[date].map((milestone) => {
                      const slot = milestone.startTimeSlot === 'AM' ? 'Morning' : milestone.startTimeSlot === 'PM' ? 'Afternoon' : milestone.startTimeSlot === 'ALL_DAY' ? 'All day' : null;
                      return (
                        <div
                          key={milestone.id}
                          onClick={() => router.push(`/professional-projects/${milestone.projectProfessional.id}`)}
                          className="bg-[rgba(255,251,242,0.9)] rounded-lg border border-[rgba(120,53,15,0.1)] hover:bg-[rgba(255,246,230,0.95)] transition cursor-pointer px-3 py-2.5 flex items-center gap-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-[rgba(120,53,15,0.9)] truncate">
                                {milestone.projectProfessional.project.projectName}
                              </span>
                              <span className="text-[10px] text-[rgba(120,53,15,0.4)]">·</span>
                              <span className="text-xs text-[rgba(120,53,15,0.75)] truncate">
                                {milestone.title}
                              </span>
                              {milestone.siteAccessRequired && <span className="text-[10px]" title="Site access required">🔑</span>}
                            </div>
                            {slot && (
                              <p className="text-[11px] text-[rgba(120,53,15,0.5)] mt-0.5">{slot}</p>
                            )}
                          </div>
                          {milestone.status === 'completed' ? (
                            <span className="shrink-0 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Done</span>
                          ) : milestone.status === 'in_progress' ? (
                            <span className="shrink-0 text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{milestone.percentComplete}%</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
