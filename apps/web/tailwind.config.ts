import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Map to CSS variables defined in globals.css for consistency
        surface: "var(--color-surface)",
        "surface-muted": "var(--color-surface-muted)",
        border: "var(--color-border)",
        primary: "var(--color-primary)",
        "primary-muted": "var(--color-primary-muted)",
        action: "var(--color-action)",
        "action-hover": "var(--color-action-hover)",
        success: "var(--color-success)",
        "success-bg": "var(--color-success-bg)",
        "success-strong": "var(--color-success-strong)",
        warning: "var(--color-warning)",
        "warning-bg": "var(--color-warning-bg)",
        danger: "var(--color-danger)",
        "danger-bg": "var(--color-danger-bg)",
        info: "var(--color-info)",
        "info-bg": "var(--color-info-bg)",
        muted: "var(--color-muted-text)",
        strong: "var(--color-strong-text)",
      },
    },
  },
  plugins: [],
};

export default config;
