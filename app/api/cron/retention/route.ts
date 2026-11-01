import { env } from "@/lib/env";
import { constantTimeEqual } from "@/lib/security/crypto";
import { errorToResponse, jsonResponse, ApiError } from "@/lib/http";
import { purgeExpiredData } from "@/lib/services/retention";

export const dynamic = "force-dynamic";

/**
 * Data-retention job endpoint. Call daily from cron:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/retention
 */
export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token || !constantTimeEqual(token, env.CRON_SECRET)) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid cron secret");
    }
    const result = await purgeExpiredData();
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    return errorToResponse(error);
  }
}
