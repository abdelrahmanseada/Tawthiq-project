import { hashIp, normalizeIp } from "@/lib/security/crypto";
import { env } from "@/lib/env";

/** Expected, client-facing failures (mapped to HTTP status + JSON error). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends ApiError {
  readonly issues: Array<{ path: string; message: string }>;

  constructor(issues: Array<{ path: string; message: string }>, message = "Validation failed") {
    super(422, "VALIDATION_ERROR", message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export interface ClientIpDetails {
  ip: string;
  chain: string[];
  source: "x-forwarded-for" | "x-real-ip" | "cf-connecting-ip" | "unknown";
}

/**
 * Resolve the client IP from proxy headers using TRUSTED_PROXY_HOPS.
 * A value of 1 (default) means one trusted reverse proxy appends the real client
 * address to X-Forwarded-For; the entry `hops` positions from the right is used.
 * Raw addresses are only hashed downstream and never stored/logged.
 */
export function getClientIpDetails(headers: Headers): ClientIpDetails {
  if (env.TRUSTED_PROXY === "cloudflare") {
    const cf = headers.get("cf-connecting-ip");
    if (cf) return { ip: normalizeIp(cf), chain: [normalizeIp(cf)], source: "cf-connecting-ip" };
  }
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded
      .split(",")
      .map((item) => normalizeIp(item))
      .filter((item) => item.length > 0);
    if (chain.length > 0) {
      const hops = Math.max(1, env.TRUSTED_PROXY_HOPS);
      const index = Math.max(0, chain.length - hops);
      return { ip: chain[index]!, chain, source: "x-forwarded-for" };
    }
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return { ip: normalizeIp(realIp), chain: [normalizeIp(realIp)], source: "x-real-ip" };
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return { ip: normalizeIp(cfIp), chain: [normalizeIp(cfIp)], source: "cf-connecting-ip" };
  return { ip: "unknown", chain: [], source: "unknown" };
}

export function getClientIp(headers: Headers): string {
  return getClientIpDetails(headers).ip;
}

export function getIpHash(headers: Headers): string {
  return hashIp(getClientIp(headers));
}

export function sanitizeUserAgent(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const cleaned = userAgent.replace(/[\p{Cc}]/gu, "").trim().slice(0, 400);
  return cleaned.length > 0 ? cleaned : null;
}

export interface OriginPolicyOptions {
  appUrl?: string;
  authUrl?: string;
  allowedOrigins?: string;
  trustHost?: boolean;
  production?: boolean;
}

export interface OriginPolicyResult {
  allowed: boolean;
  origin: string | null;
  expected: string[];
}

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (!url.protocol || !url.host) return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

function splitOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .filter((entry): entry is string => Boolean(entry));
}

/**
 * Build the origin allow-list from the app URL, auth URL, optional ALLOWED_ORIGINS
 * and — only when AUTH_TRUST_HOST=true — the request's own forwarded host/proto.
 *
 * The company verification URL is deliberately never part of this list.
 */
export function originAllowList(request: Request, options: OriginPolicyOptions = {}): string[] {
  const expected = new Set<string>();
  const appOrigin = normalizeOrigin(options.appUrl ?? env.APP_URL);
  if (appOrigin) expected.add(appOrigin);
  const authOrigin = normalizeOrigin(options.authUrl ?? env.AUTH_URL);
  if (authOrigin) expected.add(authOrigin);
  for (const allowed of splitOrigins(options.allowedOrigins ?? env.ALLOWED_ORIGINS)) expected.add(allowed);

  const production = options.production ?? env.NODE_ENV === "production";
  if (!production) {
    expected.add("http://localhost:3000");
    expected.add("http://127.0.0.1:3000");
  }

  return [...expected].sort();
}

export function evaluateOrigin(request: Request, options: OriginPolicyOptions = {}): OriginPolicyResult {
  const received = request.headers.get("origin");
  const expected = originAllowList(request, options);

  // A missing Origin is tolerated only for same-site GET navigation and never
  // for state-changing requests. All current callers are POST, so this rejects.
  if (!received) {
    const fetchSite = request.headers.get("sec-fetch-site");
    const sameSiteGet = request.method === "GET" && (!fetchSite || fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none");
    return { allowed: sameSiteGet, origin: null, expected };
  }

  const normalized = normalizeOrigin(received);
  if (!normalized) return { allowed: false, origin: received.slice(0, 200), expected };
  const effectiveHost =
    (env.AUTH_TRUST_HOST ? request.headers.get("x-forwarded-host") : null) ?? request.headers.get("host") ?? "";
  let originHost = "";
  try {
    originHost = new URL(normalized).host.toLowerCase();
  } catch {
    originHost = "";
  }
  const hostMatches = Boolean(originHost) && Boolean(effectiveHost) && originHost === effectiveHost.toLowerCase();
  return { allowed: expected.includes(normalized) && hostMatches, origin: normalized, expected };
}

/** Only configured application origins are accepted for mutations. */
export function assertSameOrigin(request: Request, options: OriginPolicyOptions = {}): void {
  const result = evaluateOrigin(request, options);
  if (!result.allowed) {
    console.warn("origin_check_failed", {
      method: request.method,
      receivedOrigin: result.origin,
      expectedOrigins: result.expected,
    });
    if (!result.origin) {
      throw new ApiError(403, "CSRF_MISSING_ORIGIN", "An Origin header is required for this request.");
    }
    throw new ApiError(
      403,
      "CSRF_INVALID_ORIGIN",
      "This request origin is not allowed. Use the configured application URL.",
    );
  }
}

/** Only internal, single-slash paths are allowed as post-login redirects. */
export function safeRedirectPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (value.includes("\n") || value.includes("\r")) return fallback;
  return value;
}

export function jsonResponse(
  data: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...init.headers,
    },
  });
}

export function errorToResponse(error: unknown): Response {
  if (error instanceof ValidationError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message, issues: error.issues } },
      { status: error.status },
    );
  }
  if (error instanceof ApiError) {
    return jsonResponse({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  // Unexpected errors: log the type/message only, never request bodies or tokens.
  console.error("unhandled_api_error", error instanceof Error ? error.message : "unknown");
  return jsonResponse(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    { status: 500 },
  );
}

/** Parse a JSON request body with a size guard. */
export async function readJsonBody<T>(request: Request, maxBytes = 64 * 1024): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maxBytes) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}
