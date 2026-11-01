-- Brand / single-language consolidation, verify base URL, encrypted card tokens,
-- recovery codes and server-side session registry.

ALTER TABLE "Company"
  ADD COLUMN "name" VARCHAR(200),
  ADD COLUMN "locale" VARCHAR(2) NOT NULL DEFAULT 'ar',
  ADD COLUMN "verify_base_url" VARCHAR(500),
  ADD COLUMN "idle_timeout_minutes" INTEGER NOT NULL DEFAULT 60;

UPDATE "Company"
SET
  "name" = CASE WHEN lower("default_locale") = 'en' THEN "name_en" ELSE "name_ar" END,
  "locale" = CASE WHEN lower("default_locale") = 'en' THEN 'en' ELSE 'ar' END,
  "verify_base_url" = CASE
    WHEN "verify_domain" ~* '^https?://' THEN rtrim("verify_domain", '/')
    ELSE 'https://' || rtrim("verify_domain", '/')
  END;

ALTER TABLE "Company" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "Company" ALTER COLUMN "verify_base_url" SET NOT NULL;

ALTER TABLE "Company"
  DROP COLUMN "name_ar",
  DROP COLUMN "name_en",
  DROP COLUMN "verify_domain",
  DROP COLUMN "default_locale";

ALTER TABLE "AdminUser" ADD COLUMN "theme" VARCHAR(10) NOT NULL DEFAULT 'system';

ALTER TABLE "Card" ADD COLUMN "token_enc" TEXT;
ALTER TABLE "Card" DROP COLUMN "artifact_path";

CREATE TABLE "RecoveryCode" (
  "id" UUID NOT NULL,
  "admin_id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecoveryCode_admin_id_used_at_idx" ON "RecoveryCode"("admin_id", "used_at");

ALTER TABLE "RecoveryCode"
  ADD CONSTRAINT "RecoveryCode_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserSession" (
  "id" UUID NOT NULL,
  "admin_id" UUID NOT NULL,
  "jti" VARCHAR(64) NOT NULL,
  "user_agent" VARCHAR(400),
  "ip_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSession_jti_key" ON "UserSession"("jti");
CREATE INDEX "UserSession_admin_id_revoked_at_idx" ON "UserSession"("admin_id", "revoked_at");
CREATE INDEX "UserSession_expires_at_idx" ON "UserSession"("expires_at");

ALTER TABLE "UserSession"
  ADD CONSTRAINT "UserSession_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
