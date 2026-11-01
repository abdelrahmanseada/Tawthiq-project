import { errorToResponse, getIpHash, jsonResponse, sanitizeUserAgent } from "@/lib/http";
import { checkVerifyRateLimit } from "@/lib/security/rate-limit";
import { toPublicVerificationJson, verifyPublicToken } from "@/lib/services/verification";

export const dynamic = "force-dynamic";

/**
 * Public JSON verification API. Returns only minimal, non-personal fields and the
 * same response shape for unknown tokens (no enumeration signal).
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const ipHash = getIpHash(request.headers);
    const userAgent = sanitizeUserAgent(request.headers.get("user-agent"));

    const rate = await checkVerifyRateLimit(ipHash);
    if (!rate.allowed) {
      return jsonResponse(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        {
          status: 429,
          headers: {
            "Retry-After": String(rate.retryAfterSeconds),
            "X-Robots-Tag": "noindex, nofollow",
          },
        },
      );
    }

    const view = await verifyPublicToken(token, { ipHash, userAgent, host: request.headers.get("x-forwarded-host") ?? request.headers.get("host") });
    return jsonResponse(toPublicVerificationJson(view), {
      headers: { "X-Robots-Tag": "noindex, nofollow, noarchive" },
    });
  } catch (error) {
    return errorToResponse(error);
  }
}
