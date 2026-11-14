/**
 * Global Feature Flags
 * Controlled via Vite environment variables or localStorage overrides.
 */

export interface FeatureFlags {
  /**
   * Toggles visibility of Studio Repositories, Content Types, and Contents on navigation and tools.
   * Default: false (hide to focus on Local DCC & File-first Pipelines).
   * Can be enabled via VITE_ENABLE_STUDIO_CATALOG=true in .env
   */
  enableStudioCatalog: boolean;
}

export const featureFlags: FeatureFlags = {
  enableStudioCatalog:
    import.meta.env.VITE_ENABLE_STUDIO_CATALOG === "true" ||
    (typeof window !== "undefined" && window.localStorage?.getItem("forgity_enable_studio_catalog") === "true"),
};

