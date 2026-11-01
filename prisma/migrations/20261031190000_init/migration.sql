-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ScanResult" AS ENUM ('VALID', 'INVALID', 'EXPIRED', 'REVOKED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "DuplicateStrategy" AS ENUM ('SKIP', 'UPDATE', 'FAIL');

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "name_ar" VARCHAR(200) NOT NULL,
    "name_en" VARCHAR(200) NOT NULL,
    "logo_url" VARCHAR(512),
    "primary_color" VARCHAR(7) NOT NULL DEFAULT '#0F766E',
    "secondary_color" VARCHAR(7) NOT NULL DEFAULT '#F59E0B',
    "contact_phone" VARCHAR(40) NOT NULL,
    "contact_email" VARCHAR(254) NOT NULL,
    "verify_domain" VARCHAR(253) NOT NULL,
    "default_locale" VARCHAR(5) NOT NULL DEFAULT 'ar',
    "default_card_validity_days" INTEGER NOT NULL DEFAULT 365,
    "scan_log_retention_days" INTEGER NOT NULL DEFAULT 365,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_code" VARCHAR(64) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "department" VARCHAR(120),
    "job_title" VARCHAR(120),
    "photo_path" VARCHAR(512),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "batch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "token_prefix" VARCHAR(6) NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" VARCHAR(200),
    "artifact_path" VARCHAR(512),
    "created_by" UUID,
    "import_batch_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanLog" (
    "id" UUID NOT NULL,
    "card_id" UUID,
    "token_prefix" VARCHAR(6) NOT NULL,
    "result" "ScanResult" NOT NULL,
    "ip_hash" VARCHAR(64) NOT NULL,
    "user_agent" VARCHAR(400),
    "reported" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "duplicate_strategy" "DuplicateStrategy" NOT NULL DEFAULT 'SKIP',
    "error_report_path" VARCHAR(512),
    "error_message" VARCHAR(500),
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "admin_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(80) NOT NULL,
    "entity_id" VARCHAR(128),
    "metadata" JSONB,
    "ip" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationReport" (
    "id" UUID NOT NULL,
    "card_id" UUID,
    "token_prefix" VARCHAR(6) NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "ip_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitCounter" (
    "key" VARCHAR(160) NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_company_id_idx" ON "AdminUser"("company_id");

-- CreateIndex
CREATE INDEX "AdminUser_role_idx" ON "AdminUser"("role");

-- CreateIndex
CREATE INDEX "Employee_company_id_deleted_at_idx" ON "Employee"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "Employee_company_id_status_idx" ON "Employee"("company_id", "status");

-- CreateIndex
CREATE INDEX "Employee_batch_id_idx" ON "Employee"("batch_id");

-- CreateIndex
CREATE INDEX "Employee_full_name_idx" ON "Employee"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_company_id_employee_code_key" ON "Employee"("company_id", "employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "Card_token_hash_key" ON "Card"("token_hash");

-- CreateIndex
CREATE INDEX "Card_employee_id_status_idx" ON "Card"("employee_id", "status");

-- CreateIndex
CREATE INDEX "Card_token_prefix_idx" ON "Card"("token_prefix");

-- CreateIndex
CREATE INDEX "Card_expires_at_idx" ON "Card"("expires_at");

-- CreateIndex
CREATE INDEX "Card_import_batch_id_idx" ON "Card"("import_batch_id");

-- CreateIndex
CREATE INDEX "ScanLog_created_at_idx" ON "ScanLog"("created_at");

-- CreateIndex
CREATE INDEX "ScanLog_result_created_at_idx" ON "ScanLog"("result", "created_at");

-- CreateIndex
CREATE INDEX "ScanLog_card_id_created_at_idx" ON "ScanLog"("card_id", "created_at");

-- CreateIndex
CREATE INDEX "ScanLog_token_prefix_idx" ON "ScanLog"("token_prefix");

-- CreateIndex
CREATE INDEX "ScanLog_ip_hash_created_at_idx" ON "ScanLog"("ip_hash", "created_at");

-- CreateIndex
CREATE INDEX "ImportBatch_admin_id_created_at_idx" ON "ImportBatch"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "ImportBatch_company_id_created_at_idx" ON "ImportBatch"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");

-- CreateIndex
CREATE INDEX "AuditLog_admin_id_created_at_idx" ON "AuditLog"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entity_id_idx" ON "AuditLog"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");

-- CreateIndex
CREATE INDEX "VerificationReport_created_at_idx" ON "VerificationReport"("created_at");

-- CreateIndex
CREATE INDEX "VerificationReport_token_prefix_idx" ON "VerificationReport"("token_prefix");

-- CreateIndex
CREATE INDEX "RateLimitCounter_window_start_idx" ON "RateLimitCounter"("window_start");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanLog" ADD CONSTRAINT "ScanLog_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

