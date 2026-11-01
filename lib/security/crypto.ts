import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual as nodeTimingSafeEqual,
} from "node:crypto";
import { env } from "@/lib/env";

/** Number of random bytes in a card token (24 bytes → exactly 32 base64url chars). */
export const CARD_TOKEN_BYTES = 24;
export const CARD_TOKEN_LENGTH = 32;
const CARD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

/** Cryptographically random, unguessable card token. Never derived from employee data. */
export function generateCardToken(): string {
  return randomBytes(CARD_TOKEN_BYTES).toString("base64url");
}

export function isValidCardTokenFormat(token: string): boolean {
  return CARD_TOKEN_PATTERN.test(token);
}

/** SHA-256 hex digest — the only representation of the token that is persisted. */
export function hashCardToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** First 6 characters of the token, stored for admin lookup/scan-log correlation. */
export function cardTokenPrefix(token: string): string {
  return token.slice(0, 6);
}

/** Prefix safe to persist for malformed input (never store arbitrary user input). */
export function safeTokenPrefix(token: string): string {
  const cleaned = token.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 6);
  return cleaned.length > 0 ? cleaned : "invalid";
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return nodeTimingSafeEqual(left, right);
}

// ─────────────────────────────────────────────────────────────────────────────
// AES-256-GCM encryption for secrets at rest (TOTP secrets, import staging files)
// ─────────────────────────────────────────────────────────────────────────────

const CIPHER_VERSION = "v1";

function encryptionKey(): Buffer {
  const key = Buffer.from(env.TOTP_ENCRYPTION_KEY, "base64url");
  if (key.length !== 32) {
    throw new Error("TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes (base64url)");
  }
  return key;
}

/** Formats: v1.<iv base64url>.<auth tag base64url>.<ciphertext base64url> */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [CIPHER_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== CIPHER_VERSION) {
    throw new Error("Unsupported or malformed ciphertext");
  }
  const iv = Buffer.from(parts[1]!, "base64url");
  const tag = Buffer.from(parts[2]!, "base64url");
  const ciphertext = Buffer.from(parts[3]!, "base64url");
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("Malformed ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// IP handling: raw IPs are never stored — only an HMAC-SHA256 digest.
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeIp(rawIp: string): string {
  let value = (rawIp || "").trim();
  if (value.includes(",")) value = value.split(",")[0]!.trim();
  value = value.replace(/^\[|\]$/g, "").split("%")[0]!;
  if (value.toLowerCase().startsWith("::ffff:")) value = value.slice(7);
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.split(":")[0]!;
  }
  return value.toLowerCase().slice(0, 64);
}

export function hashIp(rawIp: string): string {
  return createHmac("sha256", env.IP_HASH_SALT).update(normalizeIp(rawIp), "utf8").digest("hex");
}

/** Stable, salted hash for identifiers (e-mail addresses in rate-limit keys/logs). */
export function hashOpaque(value: string): string {
  return createHmac("sha256", env.IP_HASH_SALT).update(value.trim().toLowerCase(), "utf8").digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Short-lived, opaque photo URLs
// ─────────────────────────────────────────────────────────────────────────────

function photoKey(): Buffer {
  // Derive a dedicated AES key from the media secret (32 bytes).
  return createHash("sha256").update(env.MEDIA_SIGNING_SECRET, "utf8").digest();
}

/**
 * Encrypts the employee id and expiry into an opaque URL token. This keeps
 * internal UUIDs out of the public HTML/JSON while still allowing a bounded,
 * server-verifiable photo URL.
 */
export function createPhotoToken(
  employeeId: string,
  nowMs: number = Date.now(),
): { path: string; expiresAt: Date } {
  const expires = Math.floor(nowMs / 1000) + env.MEDIA_URL_TTL;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", photoKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(`${employeeId}:${expires}`, "utf8"),
    cipher.final(),
  ]);
  const token = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
  return { path: `/api/media/photo/${token}`, expiresAt: new Date(expires * 1000) };
}

export function parsePhotoToken(token: string, nowMs: number = Date.now()): { employeeId: string } | null {
  try {
    if (!token || token.length > 1024) return null;
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 12 + 16 + 3) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", photoKey(), iv);
    decipher.setAuthTag(tag);
    const payload = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const separator = payload.lastIndexOf(":");
    if (separator <= 0) return null;
    const employeeId = payload.slice(0, separator);
    const expires = Number(payload.slice(separator + 1));
    if (!Number.isSafeInteger(expires) || expires * 1000 < nowMs) return null;
    return { employeeId };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Encrypted card tokens (reproducible PDFs without storing plaintext)
// ─────────────────────────────────────────────────────────────────────────────

function cardTokenKey(): Buffer {
  return createHash("sha256").update(env.CARD_TOKEN_KEY, "utf8").digest();
}

function seal(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function unseal(payload: string, key: Buffer): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Unsupported ciphertext");
  const iv = Buffer.from(parts[1]!, "base64url");
  const tag = Buffer.from(parts[2]!, "base64url");
  const ciphertext = Buffer.from(parts[3]!, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Malformed ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** AES-256-GCM encrypted raw card token (CARD_TOKEN_KEY). Never logged or returned by APIs. */
export function encryptCardToken(token: string): string {
  if (!isValidCardTokenFormat(token)) throw new Error("Invalid card token");
  return seal(token, cardTokenKey());
}

export function decryptCardToken(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const token = unseal(payload, cardTokenKey());
    return isValidCardTokenFormat(token) ? token : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Short-lived login ticket (issued after password verification, consumed by the
// Auth.js credentials provider). 2FA is disabled, but the signed-ticket pattern
// keeps the password out of the provider request.
// ─────────────────────────────────────────────────────────────────────────────

function hmacUrl(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value, "utf8").digest("base64url");
}

export type MfaTicketPurpose = "totp" | "setup" | "password_only";

export interface MfaTicketPayload {
  sub: string;
  purpose: MfaTicketPurpose;
  exp: number;
  jti: string;
}

export function createMfaTicket(
  adminUserId: string,
  purpose: MfaTicketPurpose,
  ttlSeconds = 600,
  nowMs: number = Date.now(),
): string {
  const payload: MfaTicketPayload = {
    sub: adminUserId,
    purpose,
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
    jti: randomBytes(16).toString("base64url"),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = hmacUrl(env.AUTH_SECRET, `mfa:${body}`);
  return `${body}.${signature}`;
}

export function verifyMfaTicket(ticket: string | undefined | null, nowMs: number = Date.now()): MfaTicketPayload | null {
  if (!ticket || ticket.length > 1024) return null;
  try {
    const [body, signature] = ticket.split(".");
    if (!body || !signature) return null;
    const expected = hmacUrl(env.AUTH_SECRET, `mfa:${body}`);
    if (!constantTimeEqual(expected, signature)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MfaTicketPayload;
    if (payload.purpose !== "totp" && payload.purpose !== "setup" && payload.purpose !== "password_only") return null;
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    if (!Number.isSafeInteger(payload.exp) || payload.exp * 1000 < nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newId(): string {
  return randomUUID();
}
