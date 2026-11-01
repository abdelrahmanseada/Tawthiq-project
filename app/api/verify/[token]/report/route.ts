import { errorToResponse, getIpHash, assertSameOrigin, ApiError } from "@/lib/http";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { verificationReportSchema } from "@/lib/validation/schemas";
import { reportVerificationProblem } from "@/lib/services/verification";

export const dynamic = "force-dynamic";

function redirectTo(request: Request, path: string, status = 303): Response {
  return new Response(null, {
    status,
    headers: {
      Location: new URL(path, request.url).toString(),
      "Cache-Control": "no-store",
    },
  });
}

/** Public "Report a problem" form endpoint (HTML form POST, no JavaScript). */
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const reportPath = `/v/${encodeURIComponent(token)}/report`;

    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    if (origin) {
      assertSameOrigin(request);
    } else if (fetchSite && fetchSite !== "same-origin") {
      throw new ApiError(403, "CSRF_ORIGIN_MISMATCH", "Cross-origin request blocked");
    }

    const ipHash = getIpHash(request.headers);
    const rate = await checkRateLimit({
      key: `report:ip:${ipHash}`,
      limit: 5,
      windowSeconds: 10 * 60,
    });
    if (!rate.allowed) return redirectTo(request, `${reportPath}?error=rate`);

    const formData = await request.formData();
    const note = typeof formData.get("note") === "string" ? String(formData.get("note")) : "";
    const parsed = verificationReportSchema.safeParse({ note });
    if (!parsed.success) return redirectTo(request, `${reportPath}?error=validation`);

    await reportVerificationProblem(token, parsed.data.note, ipHash);
    return redirectTo(request, `${reportPath}?ok=1`);
  } catch (error) {
    return errorToResponse(error);
  }
}
