import "dotenv/config";
import { createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import { expect, type Page } from "@playwright/test";

export const prisma = new PrismaClient();

export interface E2eAdmin {
  email: string;
  password: string;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function newCardToken(): string {
  return Buffer.from(crypto.randomUUID().replace(/-/g, "")).toString("base64url").slice(0, 32);
}

async function ensureCompany() {
  const existing = await prisma.company.findUnique({ where: { slug: "bremer" } });
  if (existing) {
    return prisma.company.update({
      where: { id: existing.id },
      data: {
        name: "Bremer",
        slug: "bremer",
        status: "ACTIVE",
        max_employees: 100,
        time_zone: "Africa/Cairo",
        verify_base_url: "http://localhost:3010",
        idle_timeout_minutes: 60,
        onboarding_completed_at: new Date(),
      },
    });
  }
  return prisma.company.create({
    data: {
      name: "Bremer",
      slug: "bremer",
      status: "ACTIVE",
      max_employees: 100,
      time_zone: "Africa/Cairo",
      contact_phone: "+20 100 000 0000",
      contact_email: "e2e@example.com",
      verify_base_url: "http://localhost:3010",
      onboarding_completed_at: new Date(),
      default_card_validity_days: 365,
      scan_log_retention_days: 365,
    },
  });
}

/** Idempotently provision an administrator with a known password. 2FA is disabled. */
export async function ensureE2eAdmin(): Promise<E2eAdmin> {
  const company = await ensureCompany();
  await prisma.rateLimitCounter.deleteMany({});
  const email = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@example.com";
  const password = process.env.E2E_ADMIN_PASSWORD ?? "E2e!Password2026";
  const passwordHash = await hash(password, {
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.adminUser.upsert({
    where: { email },
    create: {
      company_id: company.id,
      name: "Bremer Owner",
      email,
      password_hash: passwordHash,
      role: "SUPER_ADMIN",
      must_change_password: false,
      totp_enabled: false,
      totp_secret: null,
      failed_logins: 0,
      locked_until: null,
      is_active: true,
    },
    update: {
      company_id: company.id,
      password_hash: passwordHash,
      role: "SUPER_ADMIN",
      must_change_password: false,
      totp_enabled: false,
      totp_secret: null,
      failed_logins: 0,
      locked_until: null,
      is_active: true,
    },
  });

  return { email, password };
}

/** Sign in through the password form (no 2FA). */
export async function loginAsAdmin(page: Page, admin: E2eAdmin): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', admin.email);
  await page.fill('input[name="password"]', admin.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

export function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
