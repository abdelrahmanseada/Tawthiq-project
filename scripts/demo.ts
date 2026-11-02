import "dotenv/config";
import sharp from "sharp";
import { prisma } from "../lib/db";
import { env } from "../lib/env";
import { issueCardForEmployee } from "../lib/services/cards";
import { addDays } from "../lib/format";
import { newId } from "../lib/security/crypto";
import { storageKey, writeStorageFile } from "../lib/storage";

if (env.NODE_ENV === "production") {
  throw new Error("db:demo refuses to run in production");
}

const EMPLOYEES = [
  ["Amelia Hart", "Operations", "Maintenance Technician", "ACTIVE", true, true],
  ["Noah Williams", "Human Resources", "Talent Partner", "ACTIVE", true, false],
  ["Sofia Ramirez", "Information Technology", "Network Engineer", "ACTIVE", true, false],
  ["Ethan Brooks", "Finance", "Senior Accountant", "ACTIVE", true, false],
  ["Ava Thompson", "Operations", "Shift Supervisor", "ACTIVE", true, true],
  ["Liam Chen", "Marketing", "Brand Coordinator", "ACTIVE", true, false],
  ["Isabella Rossi", "Sales", "Account Executive", "ACTIVE", true, false],
  ["Mateo Garcia", "Customer Support", "Support Specialist", "ACTIVE", true, false],
  ["Oliver Schmidt", "Operations", "Electrical Technician", "ACTIVE", true, true],
  ["Priya Nair", "Human Resources", "People Operations Lead", "ACTIVE", true, false],
  ["Lucas Martin", "Information Technology", "Software Engineer", "ACTIVE", true, false],
  ["Emma Johansson", "Finance", "Payroll Accountant", "ACTIVE", true, false],
  ["Daniel Okafor", "Operations", "HVAC Technician", "SUSPENDED", true, false],
  ["Grace Kim", "Finance", "Internal Auditor", "TERMINATED", true, false],
  ["Tomas Silva", "Information Technology", "IT Support Analyst", "ACTIVE", false, false],
  ["Chloe Dubois", "Marketing", "Visual Designer", "ACTIVE", true, false],
] as const;

const PALETTES = [
  ["#111111", "#8F0015"],
  ["#1F2937", "#6B7280"],
  ["#3F1D24", "#8F0015"],
  ["#0F172A", "#334155"],
];

async function photo(index: number): Promise<string> {
  const [background, accent] = PALETTES[index % PALETTES.length]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750">
    <rect width="600" height="750" fill="${background}"/>
    <circle cx="300" cy="270" r="118" fill="${accent}"/>
    <path d="M110 700c0-132 86-214 190-214s190 82 190 214z" fill="${accent}"/>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const key = storageKey("photos", `${newId()}.jpg`);
  await writeStorageFile(key, buffer);
  return key;
}

async function main() {
  const company = await prisma.company.findFirstOrThrow({ orderBy: { created_at: "asc" } });
  const owner = await prisma.adminUser.findFirstOrThrow({ where: { company_id: company.id, role: "SUPER_ADMIN" } });
  let cards = 0;
  for (let index = 0; index < EMPLOYEES.length; index += 1) {
    const [fullName, department, jobTitle, status, hasPhoto, expiring] = EMPLOYEES[index]!;
    const code = `DEMO-${String(index + 1).padStart(3, "0")}`;
    const photoPath = hasPhoto ? await photo(index) : null;
    const employee = await prisma.employee.upsert({
      where: { company_id_employee_code: { company_id: company.id, employee_code: code } },
      create: {
        company_id: company.id,
        employee_code: code,
        full_name: fullName,
        department,
        job_title: jobTitle,
        status,
        photo_path: photoPath,
      },
      update: {
        full_name: fullName,
        department,
        job_title: jobTitle,
        status,
        photo_path: photoPath ?? undefined,
        deleted_at: null,
      },
    });
    const existing = await prisma.card.findFirst({ where: { employee_id: employee.id, status: "ACTIVE" } });
    if (!existing) {
      await issueCardForEmployee(employee, company, owner.id, {
        expiresAt: expiring ? addDays(new Date(), 20) : addDays(new Date(), 365),
      });
      cards += 1;
    }
  }
  console.log(`[demo] ${EMPLOYEES.length} demo employees ready, ${cards} cards issued`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
