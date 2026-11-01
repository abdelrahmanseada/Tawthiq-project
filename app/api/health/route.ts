import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe (also used by Docker healthcheck). */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new Response(JSON.stringify({ status: "ok", time: new Date().toISOString() }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(JSON.stringify({ status: "degraded" }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
