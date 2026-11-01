import "dotenv/config";

/**
 * Deterministic test environment. Runs before any application module is imported.
 * Unit tests never connect to a database; the URL is only a placeholder.
 */
Object.assign(process.env, { NODE_ENV: "test" });
process.env.STORAGE_DIR = "./storage/test";
process.env.DATABASE_URL ??= "postgresql://evs:evs@127.0.0.1:5432/evs?schema=public";
process.env.AUTH_SECRET = "test-auth-secret-value-32-characters-minimum";
process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
process.env.IP_HASH_SALT = "test-ip-hash-salt-value-32-chars";
process.env.MEDIA_SIGNING_SECRET = "test-media-signing-secret-value";
process.env.MEDIA_URL_TTL = "300";
process.env.CRON_SECRET = "test-cron-secret-value";
process.env.APP_URL = "http://localhost:3000";
process.env.SYSTEM_LANGUAGE = "ar";
process.env.PUBLIC_VERIFY_URL = "https://verify.example.com";
process.env.CARD_TOKEN_KEY = "test-card-token-key-value-at-least-32-characters";
process.env.BACKUP_PASSPHRASE = "test-backup-passphrase-value";
process.env.TRUSTED_PROXY_HOPS = "1";
process.env.MAX_SPREADSHEET_BYTES = "10485760";
process.env.MAX_ZIP_BYTES = "209715200";
process.env.MAX_IMAGE_BYTES = "5242880";
process.env.MAX_IMPORT_ROWS = "5000";

// Integration tests run against a dedicated database when provided.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
