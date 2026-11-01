export const THEME_COOKIE = "evs_theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

export function normalizeTheme(value: unknown): Theme {
  return isTheme(value) ? value : "system";
}
