import { Redis } from "ioredis";
import { prisma } from "@/lib/db";
import { env, isTest } from "@/lib/env";

/**
 * Fixed-window rate limiter with three interchangeable stores:
 *  - Redis (preferred in production, also used by BullMQ)
 *  - PostgreSQL (default when Redis is not configured)
 *  - In-memory (unit tests only)
 *
 * Keys are derived from HMAC digests, never from raw IPs or e-mail addresses.
 */
export interface RateLimitStore {
  increment(key: string, windowSeconds: number, now: Date): Promise<{ count: number; windowStart: Date }>;
  peek(key: string, windowSeconds: number, now: Date): Promise<number>;
  reset?(key: string): Promise<void>;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { windowStart: number; count: number }>();

  async increment(key: string, windowSeconds: number, now: Date): Promise<{ count: number; windowStart: Date }> {
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
    const existing = this.buckets.get(key);
    if (!existing || existing.windowStart !== windowStart) {
      this.buckets.set(key, { windowStart, count: 1 });
      return { count: 1, windowStart: new Date(windowStart) };
    }
    existing.count += 1;
    if (this.buckets.size > 10_000) this.prune(windowStart);
    return { count: existing.count, windowStart: new Date(windowStart) };
  }

  async peek(key: string, windowSeconds: number, now: Date): Promise<number> {
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
    const existing = this.buckets.get(key);
    return existing && existing.windowStart === windowStart ? existing.count : 0;
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  clear(): void {
    this.buckets.clear();
  }

  private prune(currentWindowStart: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.windowStart < currentWindowStart) this.buckets.delete(key);
    }
  }
}

export class PostgresRateLimitStore implements RateLimitStore {
  async increment(key: string, windowSeconds: number, now: Date): Promise<{ count: number; windowStart: Date }> {
    const windowMs = windowSeconds * 1000;
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const rows = await prisma.$queryRaw<Array<{ count: number; window_start: Date }>>`
      INSERT INTO "RateLimitCounter" ("key", "window_start", "count")
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitCounter"."window_start" < ${windowStart} THEN 1
          ELSE "RateLimitCounter"."count" + 1
        END,
        "window_start" = CASE
          WHEN "RateLimitCounter"."window_start" < ${windowStart} THEN ${windowStart}
          ELSE "RateLimitCounter"."window_start"
        END
      RETURNING "count", "window_start"
    `;
    const row = rows[0];
    if (!row) throw new Error("Rate limiter upsert returned no row");
    return { count: row.count, windowStart: row.window_start };
  }

  async peek(key: string, windowSeconds: number, now: Date): Promise<number> {
    const windowMs = windowSeconds * 1000;
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT "count" FROM "RateLimitCounter"
      WHERE "key" = ${key} AND "window_start" = ${windowStart}
    `;
    return rows[0]?.count ?? 0;
  }

  async reset(key: string): Promise<void> {
    await prisma.rateLimitCounter.deleteMany({ where: { key } });
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  private readonly client: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    this.client.on("error", (error: Error) => {
      // Never log connection strings or credentials.
      console.error("rate_limit_redis_error", error.message);
    });
  }

  private bucketKey(key: string, windowSeconds: number, now: Date): { redisKey: string; windowStart: Date } {
    const windowMs = windowSeconds * 1000;
    const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
    return { redisKey: `ratelimit:${windowSeconds}:${windowStart}:${key}`, windowStart: new Date(windowStart) };
  }

  async increment(key: string, windowSeconds: number, now: Date): Promise<{ count: number; windowStart: Date }> {
    const { redisKey, windowStart } = this.bucketKey(key, windowSeconds, now);
    const count = await this.client.incr(redisKey);
    if (count === 1) await this.client.expire(redisKey, windowSeconds + 5);
    return { count, windowStart };
  }

  async peek(key: string, windowSeconds: number, now: Date): Promise<number> {
    const { redisKey } = this.bucketKey(key, windowSeconds, now);
    const value = await this.client.get(redisKey);
    return value ? Number(value) : 0;
  }
}

let overrideStore: RateLimitStore | null = null;
let defaultStore: RateLimitStore | null = null;

/** Test hook: force a specific store (pass null to restore the default). */
export function setRateLimitStoreForTests(store: RateLimitStore | null): void {
  overrideStore = store;
}

export function getRateLimitStore(): RateLimitStore {
  if (overrideStore) return overrideStore;
  if (isTest) {
    defaultStore ??= new MemoryRateLimitStore();
    return defaultStore;
  }
  if (!defaultStore) {
    defaultStore = env.REDIS_URL ? new RedisRateLimitStore(env.REDIS_URL) : new PostgresRateLimitStore();
  }
  return defaultStore;
}

export async function checkRateLimit(options: {
  key: string;
  limit: number;
  windowSeconds: number;
  now?: Date;
}): Promise<RateLimitDecision> {
  const now = options.now ?? new Date();
  const store = getRateLimitStore();
  let count: number;
  let windowStart: Date;
  try {
    const result = await store.increment(options.key, options.windowSeconds, now);
    count = result.count;
    windowStart = result.windowStart;
  } catch (error) {
    if (store instanceof PostgresRateLimitStore || isTest) throw error;
    // Redis unavailable: fail over to the database limiter rather than failing open.
    console.error("rate_limit_fallback_postgres", error instanceof Error ? error.message : "unknown");
    const fallback = new PostgresRateLimitStore();
    const result = await fallback.increment(options.key, options.windowSeconds, now);
    count = result.count;
    windowStart = result.windowStart;
  }
  const resetAt = new Date(windowStart.getTime() + options.windowSeconds * 1000);
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));
  return {
    allowed: count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - count),
    resetAt,
    retryAfterSeconds,
  };
}

/** Read the current counter without incrementing it (used for progressive backoff). */
export async function peekRateLimit(options: {
  key: string;
  windowSeconds: number;
  now?: Date;
}): Promise<number> {
  const now = options.now ?? new Date();
  const store = getRateLimitStore();
  try {
    return await store.peek(options.key, options.windowSeconds, now);
  } catch (error) {
    if (store instanceof PostgresRateLimitStore || isTest) throw error;
    console.error("rate_limit_peek_fallback", error instanceof Error ? error.message : "unknown");
    return 0;
  }
}

/** Increment a named counter (used to penalise repeated invalid verify attempts). */
export async function bumpCounter(key: string, windowSeconds: number, now: Date = new Date()): Promise<number> {
  const store = getRateLimitStore();
  try {
    const result = await store.increment(key, windowSeconds, now);
    return result.count;
  } catch (error) {
    if (store instanceof PostgresRateLimitStore || isTest) throw error;
    console.error("rate_limit_bump_fallback", error instanceof Error ? error.message : "unknown");
    return 0;
  }
}

export async function resetRateLimit(key: string): Promise<void> {
  await getRateLimitStore().reset?.(key);
}

// ─────────────────────────────────────────────────────────────────────────────
// Verify-page policy
// ─────────────────────────────────────────────────────────────────────────────

export const VERIFY_GLOBAL_LIMIT = 30;
export const VERIFY_GLOBAL_WINDOW_SECONDS = 60;
export const VERIFY_INVALID_THRESHOLD = 5;
export const VERIFY_INVALID_WINDOW_SECONDS = 15 * 60;

export interface VerifyRateDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  reason: "ok" | "rate_limited" | "invalid_backoff";
}

/**
 * Public verification policy:
 *  1. Hard cap of 30 requests/minute per IP.
 *  2. After 5 INVALID scans in 15 minutes, progressively back off
 *     (30s per extra invalid attempt, capped at 15 minutes).
 */
export async function checkVerifyRateLimit(ipHash: string, now: Date = new Date()): Promise<VerifyRateDecision> {
  const global = await checkRateLimit({
    key: `verify:global:${ipHash}`,
    limit: VERIFY_GLOBAL_LIMIT,
    windowSeconds: VERIFY_GLOBAL_WINDOW_SECONDS,
    now,
  });
  if (!global.allowed) {
    return { allowed: false, retryAfterSeconds: global.retryAfterSeconds, reason: "rate_limited" };
  }
  const invalidCount = await peekRateLimit({
    key: `verify:invalid:${ipHash}`,
    windowSeconds: VERIFY_INVALID_WINDOW_SECONDS,
    now,
  });
  if (invalidCount >= VERIFY_INVALID_THRESHOLD) {
    const extra = invalidCount - VERIFY_INVALID_THRESHOLD + 1;
    const retryAfter = Math.min(VERIFY_INVALID_WINDOW_SECONDS, 30 * extra);
    return { allowed: false, retryAfterSeconds: retryAfter, reason: "invalid_backoff" };
  }
  return { allowed: true, retryAfterSeconds: 0, reason: "ok" };
}

export async function recordInvalidVerifyAttempt(ipHash: string, now: Date = new Date()): Promise<void> {
  await bumpCounter(`verify:invalid:${ipHash}`, VERIFY_INVALID_WINDOW_SECONDS, now);
}

// ─────────────────────────────────────────────────────────────────────────────
// Login / import policy constants
// ─────────────────────────────────────────────────────────────────────────────

const relaxedTestLimits = isTest || process.env.E2E_MODE === "1";

export const LOGIN_IP_LIMIT = relaxedTestLimits ? 1_000 : 20;
export const LOGIN_IP_WINDOW_SECONDS = 10 * 60;
export const LOGIN_EMAIL_LIMIT = relaxedTestLimits ? 1_000 : 10;
export const LOGIN_EMAIL_WINDOW_SECONDS = 15 * 60;
export const LOGIN_TOTP_LIMIT = relaxedTestLimits ? 1_000 : 8;
export const LOGIN_TOTP_WINDOW_SECONDS = 10 * 60;
export const IMPORT_PREVIEW_LIMIT = relaxedTestLimits ? 1_000 : 10;
export const IMPORT_PREVIEW_WINDOW_SECONDS = 60 * 60;
export const IMPORT_CONFIRM_LIMIT = 20;
export const IMPORT_CONFIRM_WINDOW_SECONDS = 60 * 60;
