import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  MemoryRateLimitStore,
  VERIFY_INVALID_THRESHOLD,
  checkRateLimit,
  checkVerifyRateLimit,
  peekRateLimit,
  recordInvalidVerifyAttempt,
  resetRateLimit,
  setRateLimitStoreForTests,
} from "@/lib/security/rate-limit";

const now = new Date("2026-06-15T12:00:10.000Z");

let store: MemoryRateLimitStore;

beforeEach(() => {
  store = new MemoryRateLimitStore();
  setRateLimitStoreForTests(store);
});

afterAll(() => {
  setRateLimitStoreForTests(null);
});

describe("fixed-window rate limiter", () => {
  it("allows requests up to the limit and blocks the rest", async () => {
    const key = "test:limit";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const decision = await checkRateLimit({ key, limit: 3, windowSeconds: 60, now });
      expect(decision.allowed).toBe(true);
      expect(decision.remaining).toBe(3 - attempt);
    }
    const blocked = await checkRateLimit({ key, limit: 3, windowSeconds: 60, now });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets after the window and supports explicit reset", async () => {
    const key = "test:window";
    await checkRateLimit({ key, limit: 1, windowSeconds: 60, now });
    const later = new Date(now.getTime() + 61_000);
    const afterWindow = await checkRateLimit({ key, limit: 1, windowSeconds: 60, now: later });
    expect(afterWindow.allowed).toBe(true);

    await checkRateLimit({ key, limit: 1, windowSeconds: 60, now: later });
    await resetRateLimit(key);
    expect(await peekRateLimit({ key, windowSeconds: 60, now: later })).toBe(0);
  });
});

describe("public verify rate limiting", () => {
  it("enforces 30 requests per minute per IP", async () => {
    const ipHash = "ip-hash-1";
    for (let request = 0; request < 30; request += 1) {
      const decision = await checkVerifyRateLimit(ipHash, now);
      expect(decision.allowed).toBe(true);
    }
    const blocked = await checkVerifyRateLimit(ipHash, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("rate_limited");
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("applies progressive backoff after repeated INVALID results", async () => {
    const ipHash = "ip-hash-2";
    for (let attempt = 0; attempt < VERIFY_INVALID_THRESHOLD; attempt += 1) {
      await recordInvalidVerifyAttempt(ipHash, now);
    }
    const blocked = await checkVerifyRateLimit(ipHash, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("invalid_backoff");
    expect(blocked.retryAfterSeconds).toBe(30);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await recordInvalidVerifyAttempt(ipHash, now);
    }
    const longer = await checkVerifyRateLimit(ipHash, now);
    expect(longer.allowed).toBe(false);
    expect(longer.retryAfterSeconds).toBeGreaterThan(30);
  });

  it("does not penalise a different IP", async () => {
    const first = "ip-hash-3";
    for (let attempt = 0; attempt < VERIFY_INVALID_THRESHOLD; attempt += 1) {
      await recordInvalidVerifyAttempt(first, now);
    }
    expect((await checkVerifyRateLimit(first, now)).allowed).toBe(false);
    expect((await checkVerifyRateLimit("ip-hash-4", now)).allowed).toBe(true);
  });
});
