-- Multi-tenant platform + English-only schema.
-- Safe on both the current dev database and an empty database.

CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN';

ALTER TABLE "Company"
  ADD COLUMN "slug" VARCHAR(80),
  ADD COLUMN "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "max_employees" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "time_zone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Cairo',
  ADD COLUMN "custom_domain" VARCHAR(255),
  ADD COLUMN "onboarding_completed_at" TIMESTAMP(3),
  ADD COLUMN "onboarding_test_print_at" TIMESTAMP(3);

UPDATE "Company"
SET "slug" = 'company-' || substr(replace("id"::text, '-', ''), 1, 10)
WHERE "slug" IS NULL;

ALTER TABLE "Company" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");
CREATE UNIQUE INDEX "Company_custom_domain_key" ON "Company"("custom_domain");

ALTER TABLE "Company" DROP COLUMN "locale";

ALTER TABLE "AdminUser" ALTER COLUMN "company_id" DROP NOT NULL;

ALTER TABLE "ScanLog" ADD COLUMN "company_id" UUID;
ALTER TABLE "AuditLog" ADD COLUMN "company_id" UUID;
ALTER TABLE "VerificationReport" ADD COLUMN "company_id" UUID;

UPDATE "ScanLog" s
SET "company_id" = e."company_id"
FROM "Card" c
JOIN "Employee" e ON e."id" = c."employee_id"
WHERE s."card_id" = c."id" AND s."company_id" IS NULL;

UPDATE "VerificationReport" r
SET "company_id" = e."company_id"
FROM "Card" c
JOIN "Employee" e ON e."id" = c."employee_id"
WHERE r."card_id" = c."id" AND r."company_id" IS NULL;

UPDATE "AuditLog" a
SET "company_id" = u."company_id"
FROM "AdminUser" u
WHERE a."admin_id" = u."id" AND a."company_id" IS NULL;

CREATE INDEX "ScanLog_company_id_created_at_idx" ON "ScanLog"("company_id", "created_at");
CREATE INDEX "AuditLog_company_id_created_at_idx" ON "AuditLog"("company_id", "created_at");
CREATE INDEX "VerificationReport_company_id_created_at_idx" ON "VerificationReport"("company_id", "created_at");

CREATE TABLE "PlatformAuditLog" (
  "id" UUID NOT NULL,
  "actor_id" UUID,
  "action" VARCHAR(80) NOT NULL,
  "entity" VARCHAR(80) NOT NULL,
  "entity_id" VARCHAR(128),
  "company_id" UUID,
  "metadata" JSONB,
  "ip_hash" VARCHAR(64),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformAuditLog_created_at_idx" ON "PlatformAuditLog"("created_at");
CREATE INDEX "PlatformAuditLog_actor_id_created_at_idx" ON "PlatformAuditLog"("actor_id", "created_at");
CREATE INDEX "PlatformAuditLog_entity_entity_id_idx" ON "PlatformAuditLog"("entity", "entity_id");
