// Centralized design tokens for the web app.
// Prefer importing these constants instead of hardcoding Tailwind color names in components.
// Example usage:
//   import { colors, radii, shadows } from "@/styles/theme";
//   <div className={shadows.card + " " + radii.lg} style={{ backgroundColor: colors.surface }} />

export const colors = {
  // Base
  background: "#ffffff",
  foreground: "#0f172a", // slate-900

  // Surfaces
  surface: "#ffffff",
  surfaceMuted: "#f8fafc", // slate-50
  border: "#e2e8f0", // slate-200

  // Primary / Accent
  primary: "#0f172a", // slate-900
  primaryMuted: "#1e293b", // slate-800
  action: "#2563eb", // blue-600
  actionHover: "#1d4ed8", // blue-700

  // Success / Warning / Danger
  successBg: "#ecfdf3", // emerald-50
  success: "#059669", // emerald-600
  successStrong: "#047857", // emerald-700

  warningBg: "#fef9c3", // yellow-100
  warning: "#d97706", // amber-600

  dangerBg: "#fef2f2", // red-50
  danger: "#dc2626", // red-600

  infoBg: "#eff6ff", // blue-50
  info: "#2563eb", // blue-600

  mutedText: "#64748b", // slate-500
  strongText: "#0f172a", // slate-900
};

export const radii = {
  sm: "rounded-md",
  md: "rounded-lg",
  lg: "rounded-xl",
  full: "rounded-full",
};

export const shadows = {
  subtle: "shadow-sm",
  card: "shadow-md",
  pop: "shadow-lg",
};

export const spacing = {
  gutter: "px-4 sm:px-6 lg:px-8",
  sectionY: "py-6",
  stack: "space-y-5",
};

export const typography = {
  h1: "text-3xl font-bold text-slate-900",
  h2: "text-2xl font-bold text-slate-900",
  h3: "text-xl font-semibold text-slate-900",
  body: "text-sm text-slate-700",
  muted: "text-sm text-slate-500",
};

export const badges = {
  status: {
    info: "bg-blue-100 text-blue-800",
    success: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-800",
    neutral: "bg-slate-100 text-slate-700",
  },
};
