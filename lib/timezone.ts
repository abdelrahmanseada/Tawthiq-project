import { DEFAULT_TIME_ZONE } from "@/lib/config";

/** Trim and validate an IANA time zone without assuming a particular locale. */
export function isValidTimeZone(value: string | null | undefined): boolean {
  const candidate = (value ?? "").trim();
  if (!candidate) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: candidate }).format();
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(value: string | null | undefined, fallback = DEFAULT_TIME_ZONE): string {
  const candidate = (value ?? "").trim();
  return isValidTimeZone(candidate) ? candidate : fallback;
}

/** Searchable list for the settings combobox, with UTC/Cairo guaranteed. */
export function supportedTimeZones(): string[] {
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const values = new Set<string>([DEFAULT_TIME_ZONE, "UTC", ...supported]);
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}
