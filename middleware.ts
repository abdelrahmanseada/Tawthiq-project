import { NextResponse, type NextRequest } from "next/server";

const ADMIN_PATH_PREFIXES = [
  "/dashboard",
  "/employees",
  "/cards",
  "/imports",
  "/logs",
  "/audit",
  "/analytics",
  "/settings",
  "/admins",
  "/status",
  "/account",
  "/change-password",
];

function isSecureRequest(request: NextRequest): boolean {
  return (
    request.nextUrl.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https" ||
    (process.env.APP_URL ?? "").startsWith("https://")
  );
}

function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  const scriptSources = [`'self'`, `'nonce-${nonce}'`, `'strict-dynamic'`];
  if (isDev) scriptSources.push(`'unsafe-eval'`);
  return [
    `default-src 'self'`,
    `script-src ${scriptSources.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'none'`,
    `object-src 'none'`,
    `worker-src 'self' blob:`,
    isDev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");
}

function applySecurityHeaders(response: NextResponse, csp: string, secure: boolean): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  if (secure) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
}

/**
 * Edge middleware: nonce CSP and hardened headers, a cheap admin session gate
 * (real RBAC happens server-side), and no-store/noindex on public verification.
 * The deployment language is fixed by Company.locale; there is no locale switcher.
 */
export function middleware(request: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, isDev);
  const secure = isSecureRequest(request);
  const pathname = request.nextUrl.pathname;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, csp, secure);

  if (pathname.startsWith("/v/") || pathname.startsWith("/api/verify/")) {
    response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  const isAdminPath = ADMIN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isAdminPath) {
    const hasSession =
      (request.cookies.has("authjs.session-token") ||
        request.cookies.has("__Secure-authjs.session-token")) &&
      request.cookies.has("evs_sid");
    if (!hasSession) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      applySecurityHeaders(redirectResponse, csp, secure);
      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
