import React from "react";

export type StatusTone = "info" | "success" | "warning" | "danger" | "neutral" | "primary";

type StatusPillProps = {
  status?: string | null;
  label?: string;
  tone?: StatusTone;
  className?: string;
};

const toneStyles: Record<StatusTone, string> = {
  info: "bg-info-bg text-info",
  success: "bg-success-bg text-success-strong",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  neutral: "bg-surface-muted text-muted",
  primary: "bg-primary text-white",
};

const normalizeStatus = (status?: string | null) => (status || "").toLowerCase().replace(/\s+/g, "_");

export const statusToneFromStatus = (status?: string | null): StatusTone => {
  const key = normalizeStatus(status);
  switch (key) {
    case "pending":
      return "warning";
    case "awaiting_confirmation":
      return "primary";
    case "paid":
    case "confirmed":
    case "completed":
      return "success";
    case "rejected":
    case "withdrawn":
      return "danger";
    case "info":
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
