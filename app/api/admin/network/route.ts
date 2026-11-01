import { networkInterfaces } from "node:os";
import { NextResponse } from "next/server";
import { requireActionAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Authenticated helper for the "Use my LAN address" button. */
export async function GET() {
  await requireActionAdmin();
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const net of entries ?? []) {
      if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254.")) {
        return NextResponse.json({ ip: net.address, url: `http://${net.address}:3000` });
      }
    }
  }
  return NextResponse.json({ error: "No LAN IPv4 address found" }, { status: 404 });
}
