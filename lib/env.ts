import { z } from "zod";

/**
 * Environment configuration. All secrets come from the environment; the process
 * fails fast on missing/malformed values. The UI is English-only; PUBLIC_VERIFY_URL is
 * only the initial default because each company stores its own verification URL.
 */
const booleanish = z
  .string()
  .optional()
  .transform((value) => value === "1" || value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  APP_URL: z.string().url(),
  PUBLIC_BASE_URL: z.string().url().optional(),
  PUBLIC_VERIFY_URL: z.string().url().optional(),
  ALLOWED_ORIGINS: z.string().optional().default(""),
  SUPPORT_URL: z.string().url().optional(),
  DEFAULT_TIME_ZONE: z.string().min(1).default("Africa/Cairo"),
  ALLOWED_SCRIPTS: z.literal("latin").default("latin"),
  COPYRIGHT_TEXT: z.string().optional(),
  REQUIRE_2FA: z.string().optional().default("true").transform((value) => value !== "0" && value !== "false"),
  ALLOW_NO_2FA: booleanish,

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url().optional(),
  AUTH_TRUST_HOST: booleanish,
  SESSION_MAX_AGE: z.coerce.number().int().positive().default(60 * 60 * 8),
  IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),

  TOTP_ENCRYPTION_KEY: z.string().min(16),
  CARD_TOKEN_KEY: z.string().min(32, "CARD_TOKEN_KEY must be at least 32 characters"),
  IP_HASH_SALT: z.string().min(16, "IP_HASH_SALT must be at least 16 characters"),
  MEDIA_SIGNING_SECRET: z.string().min(16, "MEDIA_SIGNING_SECRET must be at least 16 characters"),
  MEDIA_URL_TTL: z.coerce.number().int().positive().default(300),

  STORAGE_DIR: z.string().min(1).default("./storage"),
  MAX_SPREADSHEET_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  MAX_ZIP_BYTES: z.coerce.number().int().positive().max(100 * 1024 * 1024).default(90 * 1024 * 1024),
  MAX_IMAGE_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  MAX_IMPORT_ROWS: z.coerce.number().int().positive().max(50_000).default(5_000),

  REDIS_URL: z.string().optional().default(""),
  BULLMQ_ENABLED: booleanish,
  CRON_SECRET: z.string().min(16),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  TRUSTED_PROXY: z.enum(["none", "cloudflare"]).default("none"),
  TUNNEL_TOKEN: z.string().optional(),

  BACKUP_PASSPHRASE: z.string().min(12).optional(),
  BACKUP_DIR: z.string().optional().default("./backups"),
  PG_DUMP_PATH: z.string().optional().default("pg_dump"),
  PG_RESTORE_PATH: z.string().optional().default("pg_restore"),

  SEED_COMPANY_PHONE: z.string().optional().default("+20 100 000 0000"),
  SEED_COMPANY_EMAIL: z.string().optional().default("hr@example.com"),
  SEED_SUPERADMIN_EMAIL: z.string().optional().default("admin@example.com"),
  SEED_SUPERADMIN_PASSWORD: z.string().optional().default("ChangeMe!2026"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // Next.js loads .env files itself; vitest/tsx load them in their setup files.
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();

/** True when bulk imports should be dispatched to BullMQ. */
export function isBullMqEnabled(): boolean {
  return Boolean(env.REDIS_URL) || env.BULLMQ_ENABLED;
}

/** Initial public verification base URL; company settings override it afterwards. */
export const initialVerifyBaseUrl: string = (env.PUBLIC_BASE_URL ?? env.PUBLIC_VERIFY_URL ?? env.APP_URL).replace(/\/+$/, "");

/** 2FA is required by default; turning it off is allowed only outside production or explicitly. */
export const twoFactorRequired: boolean =
  env.REQUIRE_2FA || (env.NODE_ENV === "production" && !env.ALLOW_NO_2FA);

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
