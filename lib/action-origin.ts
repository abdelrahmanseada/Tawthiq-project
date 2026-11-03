import { headers } from "next/headers";
import { evaluateOrigin, ApiError } from "@/lib/http";

/**
 * Server Actions are also protected by the browser origin header check. Next
 * checks this too, but account/security actions assert it explicitly so they
 * fail closed if a future refactor bypasses the framework guard.
 */
export async function assertActionOrigin(): Promise<void> {
  const requestHeaders = await headers();
  if (!requestHeaders.get("origin")) {
    throw new ApiError(403, "FORBIDDEN", "The request origin could not be verified.");
  }
  const request = new Request("http://action.invalid/", {
    method: "POST",
    headers: requestHeaders,
  });
  if (!evaluateOrigin(request).allowed) {
    throw new ApiError(403, "FORBIDDEN", "The request origin is not allowed.");
  }
}
