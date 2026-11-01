import { env } from "@/lib/env";
import { isValidCardTokenFormat } from "@/lib/security/crypto";

/** Error correction level Q is used for printed cards. */
export const QR_ERROR_CORRECTION_LEVEL = "Q" as const;

export interface VerifyUrlCheck {
  ok: boolean;
  productionValid: boolean;
  normalized?: string;
  errors: string[];
}

const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
];

const PRIVATE_IPV6 = [/^::1$/i, /^fc/i, /^fd/i, /^fe80:/i];

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::" || host === "::1") return true;
  if (PRIVATE_IPV4.some((pattern) => pattern.test(host))) return true;
  if (PRIVATE_IPV6.some((pattern) => pattern.test(host))) return true;
  return false;
}

/**
 * Validate a full verification base URL (scheme required, no path/query).
 * Production rejects non-HTTPS, localhost, private/LAN IPs, `.local` hosts and non-443 ports.
 * Development allows HTTP/LAN/tunnel URLs so a phone can really scan a test QR.
 */
export function validateVerifyBaseUrl(
  input: string,
  production: boolean = env.NODE_ENV === "production",
): VerifyUrlCheck {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, productionValid: false, errors: ["required"] };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, productionValid: false, errors: ["invalid_url"] };
  }

  const errors: string[] = [];
  if (url.protocol !== "https:" && url.protocol !== "http:") errors.push("invalid_scheme");
  if (url.username || url.password) errors.push("credentials_not_allowed");
  if (url.pathname !== "/" || url.search || url.hash) errors.push("path_not_allowed");

  const productionErrors: string[] = [];
  if (url.protocol !== "https:") productionErrors.push("https_required");
  if (isPrivateOrLocalHost(url.hostname)) productionErrors.push("local_address_not_allowed");
  if (url.hostname.endsWith(".local")) productionErrors.push("local_domain_not_allowed");
  if (url.port && url.port !== "443") productionErrors.push("invalid_port");

  const normalized = `${url.protocol}//${url.host}`;
  return {
    ok: errors.length === 0,
    productionValid: errors.length === 0 && productionErrors.length === 0,
    normalized: errors.length === 0 ? normalized : undefined,
    errors: production ? [...errors, ...productionErrors] : errors,
  };
}

/** Validated, normalised base URL; throws when unusable. */
export function normalizeVerifyBaseUrl(input: string): string {
  const check = validateVerifyBaseUrl(input, false);
  if (!check.ok || !check.normalized) {
    throw new Error(`Invalid verification base URL: ${check.errors.join(", ")}`);
  }
  return check.normalized;
}

/** The only content a card QR ever encodes. */
export function buildVerifyUrl(baseUrl: string, token: string): string {
  if (!isValidCardTokenFormat(token)) throw new Error("Invalid card token");
  return `${normalizeVerifyBaseUrl(baseUrl)}/v/${token}`;
}

/** Clean host shown on printed cards: no scheme, no path, no token. */
export function displayVerifyDomain(baseUrl: string): string {
  try {
    return new URL(normalizeVerifyBaseUrl(baseUrl)).host;
  } catch {
    return "invalid-domain";
  }
}

export interface QrModules {
  size: number;
  modules: boolean[][];
}

/** QR matrix for vector drawing (PDF) — no raster images. */
export async function qrModules(text: string): Promise<QrModules> {
  const QRCode = (await import("qrcode")).default;
  const qr = QRCode.create(text, { errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const modules: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const line: boolean[] = [];
    for (let column = 0; column < size; column += 1) {
      line.push(Boolean(data[row * size + column]));
    }
    modules.push(line);
  }
  return { size, modules };
}

interface QrOptions {
  width?: number;
  margin?: number;
}

export async function renderQrSvg(text: string, options: QrOptions = {}): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    margin: options.margin ?? 1,
    width: options.width ?? 240,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

export async function renderQrPng(text: string, options: QrOptions = {}): Promise<Buffer> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toBuffer(text, {
    type: "png",
    errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    margin: options.margin ?? 4,
    width: options.width ?? 700,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

export async function renderQrDataUrl(text: string): Promise<string> {
  const svg = await renderQrSvg(text);
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
