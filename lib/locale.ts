import { DEFAULT_LOCALE, ENABLED_LOCALES, type EnabledLocale } from "@/lib/config";

/**
 * Active locale. Only English is enabled; the type intentionally has no `"ar"`
 * variant so an accidental Arabic import fails at compile time.
 */
export const LOCALES = ENABLED_LOCALES;
export type Locale = EnabledLocale;

export const DEFAULT_LOCALE_VALUE: Locale = DEFAULT_LOCALE;

export function isLocale(value: unknown): value is Locale {
  return value === "en";
}

export function normalizeLocale(value: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  return isLocale(value) ? value : fallback;
}

export function dirFor(_locale: Locale = DEFAULT_LOCALE): "ltr" {
  return "ltr";
}

/** English (UK) gives "1 Nov 2027" while keeping Western digits. */
export function intlLocale(_locale: Locale = DEFAULT_LOCALE): string {
  return "en-GB";
}
