"use client";

interface CalendarEvent {
  date: string; // ISO date string
  label: string;
  type: "milestone" | "visit" | "deadline" | "start" | "inspection";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-HK", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function typeBadge(type: CalendarEvent["type"]) {
  switch (type) {
    case "milestone":
      return { bg: "bg-blue-100", dot: "bg-blue-500", label: "Milestone" };
    case "visit":
      return { bg: "bg-emerald-100", dot: "bg-emerald-500", label: "Site Visit" };
    case "start":
      return { bg: "bg-amber-100", dot: "bg-amber-500", label: "Start Date" };
    case "inspection":
      return { bg: "bg-purple-100", dot: "bg-purple-500", label: "Inspection" };
    case "deadline":
      return { bg: "bg-red-100", dot: "bg-red-500", label: "Deadline" };
  }
}

interface ProjectCalendarProps {
  events: CalendarEvent[];
}

export function ProjectCalendar({ events }: ProjectCalendarProps) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic py-4">
        No dates scheduled yet for this project.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {sorted.map((evt, i) => {
        const badge = typeBadge(evt.type);
        const isPast = new Date(evt.date) < new Date();
        return (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
              isPast ? "opacity-50" : badge.bg
            }`}
          >
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${badge.dot}`} />
            <span className="flex-1 text-sm font-medium text-slate-800">
              {evt.label}
            </span>
            <span className="text-xs text-slate-500">
              {formatDate(evt.date)}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              {badge.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
