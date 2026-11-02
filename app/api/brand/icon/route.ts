import { NextResponse } from "next/server";
import sharp from "sharp";

export const dynamic = "force-dynamic";

function mark(size: number): Buffer {
  const radius = Math.round(size * 0.22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="${(radius / size) * 64}" fill="#0F766E"/>
    <path d="M32 7 51 14v15c0 12.5-8.1 22.2-19 27C21.1 51.2 13 41.5 13 29V14L32 7Z" fill="#115E59"/>
    <path d="M23 32.5 30 39.5 42 25.5" fill="none" stroke="#ffffff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="43" y="12" width="7" height="7" fill="#F59E0B"/>
  </svg>`;
  return Buffer.from(svg);
}

export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("size") ?? "64");
  const size = [32, 48, 180, 192, 512].includes(requested) ? requested : 64;
  const image = await sharp(mark(size)).resize(size, size).png().toBuffer();
  return new NextResponse(new Uint8Array(image), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300, must-revalidate" },
  });
}
