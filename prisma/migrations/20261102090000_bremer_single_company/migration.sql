-- Consolidate the abandoned multi-company build to the single Bremer company.
-- Existing tenant rows, employees and cards are preserved.

DROP TABLE IF EXISTS "PlatformAuditLog";
DROP INDEX IF EXISTS "Company_custom_domain_key";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "custom_domain";

ALTER TABLE "Company"
  ADD COLUMN IF NOT EXISTS "tagline" VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "website" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "logo_bg_dark" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "show_verify_host_on_card" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Company" ALTER COLUMN "primary_color" SET DEFAULT '#000000';
ALTER TABLE "Company" ALTER COLUMN "secondary_color" SET DEFAULT '#8F0015';

ALTER TABLE "AdminUser" DROP COLUMN IF EXISTS "theme";

-- Platform operators have no place in a single-company deployment.
DELETE FROM "AdminUser" WHERE "company_id" IS NULL OR "role"::text = 'PLATFORM_ADMIN';

ALTER TYPE "AdminRole" RENAME TO "AdminRole_old";
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'VIEWER');
ALTER TABLE "AdminUser" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "AdminUser"
  ALTER COLUMN "role" TYPE "AdminRole"
  USING ("role"::text::"AdminRole");
ALTER TABLE "AdminUser" ALTER COLUMN "role" SET DEFAULT 'ADMIN';
DROP TYPE "AdminRole_old";

DO $$ BEGIN
  CREATE TYPE "ScanReason" AS ENUM (
    'NOT_FOUND', 'REVOKED', 'EXPIRED', 'EMPLOYEE_SUSPENDED',
    'EMPLOYEE_TERMINATED', 'EMPLOYEE_DELETED', 'COMPANY_SUSPENDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ScanLog" ADD COLUMN IF NOT EXISTS "reason" "ScanReason";

UPDATE "Company" SET "name" = 'Bremer', "slug" = 'bremer'
WHERE "id" = (SELECT "id" FROM "Company" ORDER BY ("slug" = 'bremer') DESC, "created_at" ASC LIMIT 1);
