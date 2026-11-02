import { env } from "@/lib/env";
import { DEFAULT_LOCALE, type EnabledLocale } from "@/lib/config";

/** Locale is fixed at build time; no database or cookie lookup exists. */
export function getSystemLanguage(): EnabledLocale {
  return DEFAULT_LOCALE;
}

export function supportUrl(): string {
  return env.SUPPORT_URL ?? "https://bremer.example/support";
}
