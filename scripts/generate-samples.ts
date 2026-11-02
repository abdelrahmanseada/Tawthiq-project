import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import sharp from "sharp";
import { buildEmployeeTemplate } from "../lib/excel/template";

const SAMPLES_DIR = path.join(process.cwd(), "samples");

function portraitSvg(background: string, accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${background}"/>
        <stop offset="1" stop-color="${accent}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="1000" fill="url(#bg)"/>
    <circle cx="400" cy="360" r="150" fill="#ffffff" fill-opacity="0.92"/>
    <path d="M150 940c0-190 115-300 250-300s250 110 250 300z" fill="#ffffff" fill-opacity="0.92"/>
  </svg>`;
}

const PHOTOS = [
  { filename: "amelia.jpg", background: "#0f766e", accent: "#14b8a6" },
  { filename: "noah.jpg", background: "#9d174d", accent: "#f472b6" },
  { filename: "sofia.jpg", background: "#1e40af", accent: "#60a5fa" },
];

const README = "Sample employee photos for the Bremer import demo.\nUse these file names in the \"Photo file name\" column of the import template.\nImages are re-encoded, stripped of metadata and resized on import.\n";

async function main() {
  await mkdir(SAMPLES_DIR, { recursive: true });

  for (const locale of ["en"] as const) {
    const template = await buildEmployeeTemplate(locale);
    await writeFile(path.join(SAMPLES_DIR, `employee-import-template-${locale}.xlsx`), template);
    console.log(`wrote samples/employee-import-template-${locale}.xlsx`);

    const zip = new AdmZip();
    for (const photo of PHOTOS) {
      const svg = Buffer.from(portraitSvg(photo.background, photo.accent), "utf8");
      const jpeg = await sharp(svg).resize(600, 750).jpeg({ quality: 88 }).toBuffer();
      zip.addFile(photo.filename, jpeg);
    }
    zip.addFile("README.txt", Buffer.from(README, "utf8"));
    await writeFile(path.join(SAMPLES_DIR, `sample-photos-${locale}.zip`), zip.toBuffer());
    console.log(`wrote samples/sample-photos-${locale}.zip`);
  }
}

main().catch((error) => {
  console.error("[samples] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
