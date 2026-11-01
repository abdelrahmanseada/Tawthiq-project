/** Colour helpers shared by the web UI (CSS variables) and the PDF renderer. */

export const DEFAULT_PRIMARY_COLOR = "#0F766E";
export const DEFAULT_SECONDARY_COLOR = "#F59E0B";

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  if (typeof value === "string" && HEX_PATTERN.test(value.trim())) return value.trim().toLowerCase();
  return fallback;
}

export function hexToRgbTuple(hex: string): [number, number, number] {
  const normalized = normalizeHexColor(hex, "#000000").slice(1);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgbTuple(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(colorA: string, colorB: string): number {
  const a = relativeLuminance(colorA);
  const b = relativeLuminance(colorB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pick black or white text to guarantee the best possible contrast on a background. */
export function readableTextOn(backgroundHex: string): "#000000" | "#ffffff" {
  return contrastRatio(backgroundHex, "#ffffff") >= contrastRatio(backgroundHex, "#000000")
    ? "#ffffff"
    : "#000000";
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgbTuple(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mixHex(baseHex: string, mixHexColor: string, mixRatio: number): string {
  const ratio = Math.min(1, Math.max(0, mixRatio));
  const [r1, g1, b1] = hexToRgbTuple(baseHex);
  const [r2, g2, b2] = hexToRgbTuple(mixHexColor);
  const toHex = (value: number) => Math.round(value).toString(16).padStart(2, "0");
  return `#${toHex(r1 * (1 - ratio) + r2 * ratio)}${toHex(g1 * (1 - ratio) + g2 * ratio)}${toHex(b1 * (1 - ratio) + b2 * ratio)}`;
}
