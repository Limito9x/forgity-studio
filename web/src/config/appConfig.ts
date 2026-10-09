/**
 * Public Application Configuration & Branding
 * Single source of truth for display names, branding, and links.
 * Edit here to update product name across the web app without touching code files.
 */
export const appConfig = {
  name: "Automation Studio",
  shortName: "Automation",
  tagline: "Next-Gen 3D & VFX Pipeline Automation Platform",
  version: "1.0.0",
  company: "Limito Studio",
  links: {
    docs: "/docs",
    support: "support@example.com",
    github: "https://github.com/Limito9x/automation-studio",
  },
} as const;

export type AppConfig = typeof appConfig;
