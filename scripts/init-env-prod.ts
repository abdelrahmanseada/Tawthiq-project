import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function secret(bytes = 48): string {
  return randomBytes(bytes).toString("base64url");
}

function password(): string {
  return `Br3mer-${randomBytes(9).toString("base64url")}`;
}

async function main() {
  if (existsSync(".env") && !process.argv.includes("--force")) {
    throw new Error(".env already exists. Re-run with --force only if you intend to replace it.");
  }
  const rl = createInterface({ input, output });
  let appUrl = "";
  try {
    appUrl = (await rl.question("Public HTTPS URL (for example https://app.yourdomain.com): ")).trim().replace(/\/+$/, "");
  } finally {
    rl.close();
  }
  let parsed: URL;
  try {
    parsed = new URL(appUrl);
  } catch {
    throw new Error("Enter a full URL, including https://");
  }
  if (parsed.protocol !== "https:") throw new Error("Production APP_URL must use https://");

  const postgresPassword = secret(24);
  const ownerPassword = password();
  const values: Record<string, string> = {
    NODE_ENV: "production",
    PORT: "3000",
    APP_URL: appUrl,
    AUTH_URL: appUrl,
    PUBLIC_BASE_URL: appUrl,
    AUTH_SECRET: secret(),
    AUTH_TRUST_HOST: "true",
    TRUSTED_PROXY: "cloudflare",
    TRUSTED_PROXY_HOPS: "1",
    DATABASE_URL: `postgresql://evs:${postgresPassword}@postgres:5432/evs?schema=public`,
    POSTGRES_PASSWORD: postgresPassword,
    TOTP_ENCRYPTION_KEY: secret(32),
    CARD_TOKEN_KEY: secret(48),
    IP_HASH_SALT: secret(24),
    MEDIA_SIGNING_SECRET: secret(32),
    MEDIA_URL_TTL: "300",
    CRON_SECRET: secret(32),
    STORAGE_DIR: "/app/storage",
    MAX_SPREADSHEET_BYTES: "10485760",
    MAX_ZIP_BYTES: "94371840",
    MAX_IMAGE_BYTES: "5242880",
    MAX_IMPORT_ROWS: "5000",
    REDIS_URL: "redis://redis:6379",
    BULLMQ_ENABLED: "true",
    REQUIRE_2FA: "true",
    ALLOW_NO_2FA: "false",
    COPYRIGHT_TEXT: "© {year} Bremer",
    SEED_COMPANY_PHONE: "+20 100 000 0000",
    SEED_COMPANY_EMAIL: "hr@bremer.example",
    SEED_SUPERADMIN_EMAIL: "owner@bremer.example",
    SEED_SUPERADMIN_PASSWORD: ownerPassword,
    BACKUP_PASSPHRASE: secret(32),
    BACKUP_DIR: "./backups",
    PG_DUMP_PATH: "pg_dump",
    PG_RESTORE_PATH: "pg_restore",
    TUNNEL_TOKEN: "",
  };
  const body = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  writeFileSync(".env", `${body}\n`, { mode: 0o600 });
  console.log(".env written with fresh secrets.");
  console.log(`Owner: ${values.SEED_SUPERADMIN_EMAIL}`);
  console.log(`Temporary owner password: ${ownerPassword}`);
  console.log("Store that password now; it is not printed again. Add TUNNEL_TOKEN after creating the Cloudflare tunnel.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
