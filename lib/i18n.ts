import en from "@/messages/en.json";
import type { Locale } from "@/lib/locale";

export type Messages = Record<string, unknown>;

const MESSAGES: Record<Locale, Messages> = { en };

function lookup(source: Messages, path: string): string | null {
  const parts = path.split(".");
  let current: unknown = source;
  for (let index = 0; index < parts.length; index += 1) {
    if (!current || typeof current !== "object") return null;
    const remainder = parts.slice(index).join(".");
    const record = current as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, remainder)) {
      const direct = record[remainder];
      if (typeof direct === "string") return direct;
    }
    current = record[parts[index]!];
  }
  return typeof current === "string" ? current : null;
}

/** Server-side translation for PDFs, Excel, audit labels and dormant workers. */
export function translate(
  _locale: Locale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  const template = lookup(MESSAGES.en, key) ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match,
  );
}

export function hasMessage(_locale: Locale, key: string): boolean {
  return lookup(MESSAGES.en, key) !== null;
}

export function messagesFor(_locale: Locale): Messages {
  return MESSAGES.en;
}
