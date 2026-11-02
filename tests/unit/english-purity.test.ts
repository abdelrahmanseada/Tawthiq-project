import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import { buildEmployeeTemplate } from "@/lib/excel/template";
import { renderCardPdf } from "@/lib/pdf/card";

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const ROOT = process.cwd();
const ACTIVE_DIRECTORIES = ["app", "components", "lib", "prisma", "scripts", "i18n", "workers"];
const DORMANT = [
  "lib/pdf/arabic.ts",
  "lib/pdf/text.ts",
  path.join("lib", "services", "recovery.ts"),
  path.join("messages", "ar.json"),
  path.join("assets", "dormant"),
];

async function activeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(path.join(ROOT, directory), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    const normalized = relative.replaceAll("\\", "/");
    if (DORMANT.some((prefix) => normalized.startsWith(prefix.replaceAll("\\", "/")))) continue;
    if (entry.isDirectory()) files.push(...(await activeFiles(relative)));
    else if (/\.(ts|tsx|json|mjs|cjs)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

function flatten(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  if (!value || typeof value !== "object") return {};
  const output: Record<string, string> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    Object.assign(output, flatten(nested, prefix ? `${prefix}.${key}` : key));
  }
  return output;
}

describe("English-only active build", () => {
  it("contains no Arabic script in active source or the English catalog", async () => {
    const offenders: string[] = [];
    for (const directory of ACTIVE_DIRECTORIES) {
      for (const file of await activeFiles(directory)) {
        const contents = (await readFile(path.join(ROOT, file), "utf8")).replace(/^\uFEFF/, "");
        if (ARABIC.test(contents)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
    for (const [key, value] of Object.entries(flatten(en))) {
      expect(ARABIC.test(value), key).toBe(false);
    }
  });

  it("contains no product or old company names in active source", async () => {
    const offenders: string[] = [];
    for (const directory of ACTIVE_DIRECTORIES) {
      for (const file of await activeFiles(directory)) {
        const contents = await readFile(path.join(ROOT, file), "utf8");
        if (/\b(Tawthiq|Facilities)\b/.test(contents)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("loads only the English catalog and only Inter font assets", async () => {
    const requestConfig = await readFile(path.join(ROOT, "i18n", "request.ts"), "utf8");
    expect(requestConfig).toContain('import en from "@/messages/en.json"');
    expect(requestConfig).not.toContain("ar.json");
    const fonts = await readdir(path.join(ROOT, "assets", "fonts"));
    expect(fonts.sort()).toEqual(["inter-400.ttf", "inter-500.ttf", "inter-600.ttf", "inter-700.ttf"]);
    const activeFonts = await readFile(path.join(ROOT, "lib", "fonts.ts"), "utf8");
    expect(activeFonts).not.toContain("arabic");
  });

  it("renders English-only card PDF text", async () => {
    const bytes = await renderCardPdf({
      company: {
        name: "Bremer",
        logo_path: null,
        logo_bg_dark: false,
        website: "bremer.example",
        tagline: "Established 1989",
        show_verify_host_on_card: false,
        primary_color: "#0F766E",
        secondary_color: "#F59E0B",
        contact_phone: "+20 100 000 0000",
        contact_email: "hr@example.com",
        verify_base_url: "https://verify.example.com",
        time_zone: "Africa/Cairo",
        status: "ACTIVE",
      },
      employee: {
        full_name: "Amelia Hart",
        job_title: "Maintenance Technician",
        department: "Operations",
        photo_path: null,
        employee_code: "NW-0001",
      },
      expiresAt: new Date("2027-11-01T00:00:00.000Z"),
      token: "Zx7Qp2Lm9Rt4Vw8Yb3Nc6Hd1Ks5Jf0Ga",
    });
    const mupdf = await import("mupdf");
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    for (let index = 0; index < doc.countPages(); index += 1) {
      const text = doc.loadPage(index).toStructuredText("preserve-whitespace").asText();
      expect(ARABIC.test(text)).toBe(false);
      expect(text).toContain(index === 0 ? "Amelia Hart" : "Scan to verify");
    }
  });

  it("renders an English-only import template", async () => {
    const template = await buildEmployeeTemplate("en");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template as unknown as ArrayBuffer);
    for (const sheet of workbook.worksheets) {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          expect(ARABIC.test(String(cell.value ?? "")), `${sheet.name}:${cell.address}`).toBe(false);
        });
      });
    }
  });
});
