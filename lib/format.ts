import { intlLocale, type Locale } from "@/lib/locale";
import { DEFAULT_TIME_ZONE } from "@/lib/config";

export const TIME_ZONE = DEFAULT_TIME_ZONE;

function toDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/** Gregorian English date, Western digits: "1 Nov 2027". */
export function formatDate(value: Date | string, _locale: Locale = "en", timeZone = TIME_ZONE): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
}

/** "1 Nov 2027, 14:05" (24-hour). */
export function formatDateTime(value: Date | string, _locale: Locale = "en", timeZone = TIME_ZONE): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
  return `${day}, ${time}`;
}

export function formatTime(value: Date | string, _locale: Locale = "en", timeZone = TIME_ZONE): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}

export function formatNumber(value: number, _locale: Locale = "en"): string {
  return new Intl.NumberFormat("en-GB", { useGrouping: false }).format(value);
}

export function formatCompactNumber(value: number, _locale: Locale = "en"): string {
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatBytes(bytes: number, _locale: Locale = "en"): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(value)} ${units[unitIndex]}`;
}

export function parseIsoDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date, timeZone = TIME_ZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function offsetMs(date: Date, timeZone = TIME_ZONE): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

export function cairoDateString(value: Date = new Date(), timeZone = TIME_ZONE): string {
  const p = zonedParts(value, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function formatIsoDate(value: Date | string): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return cairoDateString(date);
}

/** End of the company-local calendar day for a YYYY-MM-DD input. */
export function cairoEndOfDay(value: string, timeZone = TIME_ZONE): Date | null {
  const date = parseIsoDateOnly(value);
  if (!date) return null;
  const p = zonedParts(date, "UTC");
  const desiredUtc = Date.UTC(p.year, p.month - 1, p.day, 23, 59, 59, 999);
  return new Date(desiredUtc - offsetMs(new Date(desiredUtc), timeZone));
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

export function startOfDay(value: Date = new Date(), timeZone = TIME_ZONE): Date {
  const p = zonedParts(value, timeZone);
  const desiredUtc = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0, 0);
  return new Date(desiredUtc - offsetMs(new Date(desiredUtc), timeZone));
}

export function cairoToday(value: Date = new Date()): Date {
  return startOfDay(value);
}

export function utcToday(value: Date = new Date()): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
