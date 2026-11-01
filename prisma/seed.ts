import "dotenv/config";
import { rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Company, EmployeeStatus } from "@prisma/client";
import { prisma } from "../lib/db";
import { hashPassword, checkPasswordPolicy } from "../lib/security/password";
import { issueCardForEmployee } from "../lib/services/cards";
import { env, initialVerifyBaseUrl } from "../lib/env";
import { getStorageRoot, storageKey, writeStorageFile } from "../lib/storage";
import { newId } from "../lib/security/crypto";
import { addDays } from "../lib/format";

interface DemoEmployee {
  full_name: string;
  department: string;
  job_title: string;
  status: EmployeeStatus;
  photo: boolean;
  expiringSoon?: boolean;
}

interface DemoCompany {
  name: string;
  slug: string;
  primary: string;
  secondary: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  employees: DemoEmployee[];
}

const NORTHWIND_EMPLOYEES: DemoEmployee[] = [
  { full_name: "Amelia Hart", department: "Operations", job_title: "Maintenance Technician", status: "ACTIVE", photo: true, expiringSoon: true },
  { full_name: "Noah Williams", department: "Human Resources", job_title: "Talent Partner", status: "ACTIVE", photo: true },
  { full_name: "Sofia Ramirez", department: "Information Technology", job_title: "Network Engineer", status: "ACTIVE", photo: true },
  { full_name: "Ethan Brooks", department: "Finance", job_title: "Senior Accountant", status: "ACTIVE", photo: true },
  { full_name: "Ava Thompson", department: "Operations", job_title: "Shift Supervisor", status: "ACTIVE", photo: true, expiringSoon: true },
  { full_name: "Liam Chen", department: "Marketing", job_title: "Brand Coordinator", status: "ACTIVE", photo: true },
  { full_name: "Isabella Rossi", department: "Sales", job_title: "Account Executive", status: "ACTIVE", photo: true },
  { full_name: "Mateo Garcia", department: "Customer Support", job_title: "Support Specialist", status: "ACTIVE", photo: true },
  { full_name: "Oliver Schmidt", department: "Operations", job_title: "Electrical Technician", status: "ACTIVE", photo: true, expiringSoon: true },
  { full_name: "Priya Nair", department: "Human Resources", job_title: "People Operations Lead", status: "ACTIVE", photo: true },
  { full_name: "Lucas Martin", department: "Information Technology", job_title: "Software Engineer", status: "ACTIVE", photo: true },
  { full_name: "Emma Johansson", department: "Finance", job_title: "Payroll Accountant", status: "ACTIVE", photo: true },
  { full_name: "Daniel Okafor", department: "Operations", job_title: "HVAC Technician", status: "ACTIVE", photo: true },
  { full_name: "Chloe Dubois", department: "Marketing", job_title: "Visual Designer", status: "ACTIVE", photo: true },
  { full_name: "Henry Walker", department: "Sales", job_title: "Regional Sales Manager", status: "ACTIVE", photo: true },
  { full_name: "Aisha Rahman", department: "Customer Support", job_title: "Support Team Lead", status: "ACTIVE", photo: true },
  { full_name: "Arjun Patel", department: "Operations", job_title: "Plumbing Technician", status: "SUSPENDED", photo: true },
  { full_name: "Elena Petrova", department: "Human Resources", job_title: "Learning Specialist", status: "ACTIVE", photo: true },
  { full_name: "Tomas Silva", department: "Information Technology", job_title: "IT Support Analyst", status: "ACTIVE", photo: false },
  { full_name: "Grace Kim", department: "Finance", job_title: "Internal Auditor", status: "TERMINATED", photo: true },
];

const CONTOSO_EMPLOYEES: DemoEmployee[] = [
  { full_name: "Owen Bennett", department: "Facilities", job_title: "Building Manager", status: "ACTIVE", photo: true },
  { full_name: "Mia Torres", department: "Operations", job_title: "Logistics Coordinator", status: "ACTIVE", photo: true },
  { full_name: "Felix Weber", department: "Engineering", job_title: "Quality Engineer", status: "ACTIVE", photo: true },
  { full_name: "Nadia Haddad", department: "Finance", job_title: "Financial Analyst", status: "ACTIVE", photo: true },
  { full_name: "Samuel Reed", department: "Security", job_title: "Site Security Lead", status: "ACTIVE", photo: true },
];

const PHOTO_PALETTES = [
  ["#0F766E", "#14B8A6"],
  ["#1D4ED8", "#60A5FA"],
  ["#9D174D", "#F472B6"],
  ["#B45309", "#FBBF24"],
  ["#334155", "#94A3B8"],
  ["#6D28D9", "#A78BFA"],
  ["#0E7490", "#67E8F9"],
  ["#166534", "#86EFAC"],
];

function portraitSvg(background: string, accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${background}"/><stop offset="1" stop-color="${accent}"/>
    </linearGradient></defs>
    <rect width="600" height="750" fill="url(#bg)"/>
    <circle cx="300" cy="270" r="120" fill="#ffffff" fill-opacity="0.9"/>
    <path d="M110 690c0-130 85-210 190-210s190 80 190 210z" fill="#ffffff" fill-opacity="0.9"/>
  </svg>`;
}

async function createPhoto(index: number): Promise<string> {
  const palette = PHOTO_PALETTES[index % PHOTO_PALETTES.length]!;
  const buffer = await sharp(Buffer.from(portraitSvg(palette[0]!, palette[1]!)))
    .resize(600, 750)
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
  const key = storageKey("photos", `${newId()}.jpg`);
  await writeStorageFile(key, buffer);
  return key;
}

async function createCompanyLogo(companyId: string, primary: string, secondary: string): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
    <rect width="400" height="400" rx="88" fill="${primary}"/>
    <path d="M200 62 326 110v92c0 74-50 130-126 158-76-28-126-84-126-158v-92L200 62Z" fill="#ffffff" fill-opacity="0.16"/>
    <path d="M132 208 180 256 282 144" fill="none" stroke="#ffffff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="284" y="70" width="56" height="56" rx="10" fill="none" stroke="${secondary}" stroke-width="12"/>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const key = storageKey("logos", `${companyId}.png`);
  await writeStorageFile(key, buffer);
  return key;
}

async function resetStorageDemo(): Promise<void> {
  const root = getStorageRoot();
  await Promise.all(
    ["photos", "logos", "imports", "reports", "cards"].map((kind) =>
      rm(path.join(root, kind), { recursive: true, force: true }),
    ),
  );
}

async function seedCompany(input: DemoCompany, reset: boolean): Promise<{ company: Company; owners: number; cards: number }> {
  const existing = await prisma.company.findUnique({ where: { slug: input.slug } });
  const company = existing
    ? await prisma.company.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          status: "ACTIVE",
          max_employees: Math.max(100, input.employees.length),
          time_zone: env.DEFAULT_TIME_ZONE,
          verify_base_url: initialVerifyBaseUrl,
          contact_phone: env.SEED_COMPANY_PHONE,
          contact_email: env.SEED_COMPANY_EMAIL,
          primary_color: input.primary,
          secondary_color: input.secondary,
          onboarding_completed_at: new Date(),
          onboarding_test_print_at: new Date(),
        },
      })
    : await prisma.company.create({
        data: {
          name: input.name,
          slug: input.slug,
          status: "ACTIVE",
          max_employees: Math.max(100, input.employees.length),
          time_zone: env.DEFAULT_TIME_ZONE,
          verify_base_url: initialVerifyBaseUrl,
          contact_phone: env.SEED_COMPANY_PHONE,
          contact_email: env.SEED_COMPANY_EMAIL,
          primary_color: input.primary,
          secondary_color: input.secondary,
          onboarding_completed_at: new Date(),
          onboarding_test_print_at: new Date(),
        },
      });

  const logoPath = await createCompanyLogo(company.id, company.primary_color, company.secondary_color);
  const branded = await prisma.company.update({ where: { id: company.id }, data: { logo_url: logoPath } });

  const ownerPassword = input.ownerPassword;
  const policyError = checkPasswordPolicy(ownerPassword);
  if (policyError) throw new Error(`${input.ownerEmail}: ${policyError}`);
  const passwordHash = await hashPassword(ownerPassword);
  const owner = await prisma.adminUser.upsert({
    where: { email: input.ownerEmail.toLowerCase() },
    create: {
      company_id: branded.id,
      name: input.ownerName,
      email: input.ownerEmail.toLowerCase(),
      password_hash: passwordHash,
      role: "SUPER_ADMIN",
      must_change_password: true,
      totp_enabled: false,
    },
    update: {
      company_id: branded.id,
      name: input.ownerName,
      password_hash: passwordHash,
      role: "SUPER_ADMIN",
      must_change_password: true,
      totp_enabled: false,
      totp_secret: null,
      is_active: true,
      failed_logins: 0,
      locked_until: null,
    },
  });
  await prisma.recoveryCode.deleteMany({ where: { admin_id: owner.id } });
  await prisma.userSession.deleteMany({ where: { admin_id: owner.id } });

  const existingEmployees = await prisma.employee.count({ where: { company_id: branded.id } });
  if (!reset && existingEmployees > 0) {
    return { company: branded, owners: 1, cards: 0 };
  }
  if (reset) {
    await prisma.card.deleteMany({ where: { employee: { company_id: branded.id } } });
    await prisma.employee.deleteMany({ where: { company_id: branded.id } });
  }

  let cards = 0;
  for (let index = 0; index < input.employees.length; index += 1) {
    const sample = input.employees[index]!;
    const prefix = input.slug === "northwind-demo" ? "NW" : "CT";
    const photoPath = sample.photo ? await createPhoto(index) : null;
    const employee = await prisma.employee.create({
      data: {
        company_id: branded.id,
        employee_code: `${prefix}-${String(index + 1).padStart(4, "0")}`,
        full_name: sample.full_name,
        department: sample.department,
        job_title: sample.job_title,
        photo_path: photoPath,
        status: sample.status,
      },
    });
    try {
      await issueCardForEmployee(employee, branded, owner.id, {
        expiresAt: sample.expiringSoon ? addDays(new Date(), 20) : undefined,
      });
      cards += 1;
    } catch (error) {
      console.error(`[seed] card failed for ${employee.employee_code}:`, error instanceof Error ? error.message : error);
    }
  }
  return { company: branded, owners: 1, cards };
}

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset && env.NODE_ENV === "production") {
    throw new Error("db:reset-demo refuses to run with NODE_ENV=production");
  }
  if (!env.SEED_SUPERADMIN_PASSWORD) throw new Error("SEED_SUPERADMIN_PASSWORD is required");
  const platformEmail = env.PLATFORM_ADMIN_EMAIL.toLowerCase();
  if (reset) {
    await prisma.scanLog.deleteMany({});
    await prisma.verificationReport.deleteMany({});
    await prisma.card.deleteMany({});
    await prisma.employee.deleteMany({});
    await prisma.importBatch.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.platformAuditLog.deleteMany({});
    await prisma.userSession.deleteMany({});
    await prisma.recoveryCode.deleteMany({});
    await prisma.adminUser.deleteMany({});
    await prisma.company.deleteMany({});
    await resetStorageDemo();
    console.log("[seed] demo data wiped");
  }

  const northwind = await seedCompany(
    {
      name: "Northwind Demo",
      slug: "northwind-demo",
      primary: "#0F766E",
      secondary: "#F59E0B",
      ownerName: "Jordan Ellis",
      ownerEmail: env.SEED_SUPERADMIN_EMAIL,
      ownerPassword: env.SEED_SUPERADMIN_PASSWORD,
      employees: NORTHWIND_EMPLOYEES,
    },
    reset,
  );

  const contoso = await seedCompany(
    {
      name: "Contoso Demo",
      slug: "contoso-demo",
      primary: "#4338CA",
      secondary: "#22D3EE",
      ownerName: "Morgan Lee",
      ownerEmail: "owner@contoso.example",
      ownerPassword: "Contoso!Demo2026",
      employees: CONTOSO_EMPLOYEES,
    },
    reset,
  );

  const platformPassword = env.PLATFORM_ADMIN_PASSWORD;
  const platformPolicyError = checkPasswordPolicy(platformPassword);
  if (platformPolicyError) throw new Error(`PLATFORM_ADMIN_PASSWORD violates the policy: ${platformPolicyError}`);
  await prisma.adminUser.upsert({
    where: { email: platformEmail },
    create: {
      company_id: null,
      name: env.PLATFORM_ADMIN_NAME,
      email: platformEmail,
      password_hash: await hashPassword(platformPassword),
      role: "PLATFORM_ADMIN",
      must_change_password: false,
      totp_enabled: false,
    },
    update: {
      company_id: null,
      name: env.PLATFORM_ADMIN_NAME,
      password_hash: await hashPassword(platformPassword),
      role: "PLATFORM_ADMIN",
      must_change_password: false,
      totp_enabled: false,
      totp_secret: null,
      is_active: true,
      failed_logins: 0,
      locked_until: null,
    },
  });

  console.log(`[seed] platform admin ready: ${platformEmail}`);
  console.log(`[seed] ${northwind.company.name}: ${NORTHWIND_EMPLOYEES.length} employees, ${northwind.cards} cards`);
  console.log(`[seed] ${contoso.company.name}: ${CONTOSO_EMPLOYEES.length} employees, ${contoso.cards} cards`);
  console.log("[seed] demo only — never run db:reset-demo in production.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
