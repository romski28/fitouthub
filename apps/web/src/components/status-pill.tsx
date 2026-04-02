import React from "react";

export type StatusTone = "info" | "success" | "warning" | "danger" | "neutral" | "primary";

type StatusPillProps = {
  status?: string | null;
  label?: string;
  tone?: StatusTone;
  className?: string;
};

const toneStyles: Record<StatusTone, string> = {
  info:    "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30",
  success: "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30",
  warning: "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30",
  danger:  "bg-red-500/20 text-red-400 ring-1 ring-red-500/30",
  neutral: "bg-slate-500/20 text-slate-400 ring-1 ring-slate-500/30",
  primary: "bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/40",
};

const normalizeStatus = (status?: string | null) => (status || "").toLowerCase().replace(/\s+/g, "_");

export const statusToneFromStatus = (status?: string | null): StatusTone => {
  const key = normalizeStatus(status);
  switch (key) {
    // Green — positive / resolved
    case "paid":
    case "confirmed":
    case "completed":
    case "approved":
    case "released":
      return "success";
    // Red — action required / problem
    case "pending":
    case "action_required":
    case "rejected":
    case "withdrawn":
    case "declined":
      return "danger";
    // Blue — informational / passive wait
    case "awaiting_confirmation":
    case "awaiting":
    case "info":
    case "processing":
      return "info";
    default:
      return "neutral";
  }
};

export function StatusPill({ status, label, tone, className }: StatusPillProps) {
  const resolvedTone = tone || statusToneFromStatus(status);
  const classes = [
    "inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold capitalize",
    toneStyles[resolvedTone],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classes}>{label || status || "—"}</span>;
}

export default StatusPill;
