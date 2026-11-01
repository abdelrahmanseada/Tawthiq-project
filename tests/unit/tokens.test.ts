import { describe, expect, it } from "vitest";
import {
  cardTokenPrefix,
  constantTimeEqual,
  createMfaTicket,
  createPhotoToken,
  decryptSecret,
  encryptSecret,
  generateCardToken,
  hashCardToken,
  hashIp,
  isValidCardTokenFormat,
  normalizeIp,
  parsePhotoToken,
  verifyMfaTicket,
} from "@/lib/security/crypto";
import { buildVerifyUrl, displayVerifyDomain, QR_ERROR_CORRECTION_LEVEL, validateVerifyBaseUrl } from "@/lib/qr";

describe("card tokens", () => {
  it("generates 32-character base64url tokens", () => {
    const token = generateCardToken();
    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(isValidCardTokenFormat(token)).toBe(true);
  });

  it("generates unique, non-sequential tokens", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateCardToken()));
    expect(tokens.size).toBe(500);
  });

  it("rejects malformed token formats", () => {
    expect(isValidCardTokenFormat("short")).toBe(false);
    expect(isValidCardTokenFormat("x".repeat(31))).toBe(false);
    expect(isValidCardTokenFormat("x".repeat(33))).toBe(false);
    expect(isValidCardTokenFormat(`${"A".repeat(31)}+`)).toBe(false);
  });

  it("hashes tokens with SHA-256 and never stores the raw value", () => {
    const token = generateCardToken();
    const hash = hashCardToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashCardToken(token));
    expect(hash).not.toContain(token);
    expect(hashCardToken(generateCardToken())).not.toBe(hash);
    expect(cardTokenPrefix(token)).toBe(token.slice(0, 6));
  });
});

describe("secret encryption (AES-256-GCM)", () => {
  it("round-trips TOTP secrets", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it("uses a fresh IV each time", () => {
    const a = encryptSecret("same-secret");
    const b = encryptSecret("same-secret");
    expect(a).not.toBe(b);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("secret-value");
    const parts = encrypted.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]!.slice(0, -4)}AAAA`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("IP hashing", () => {
  it("normalises forwarded lists, ports and IPv4-mapped addresses", () => {
    expect(normalizeIp("203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
    expect(normalizeIp("203.0.113.7:443")).toBe("203.0.113.7");
    expect(normalizeIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp("[2001:db8::1]")).toBe("2001:db8::1");
  });

  it("produces a stable salted digest and never the raw IP", () => {
    const hash = hashIp("203.0.113.7");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashIp("203.0.113.7:8080"));
    expect(hash).not.toContain("203.0.113.7");
    expect(hashIp("203.0.113.8")).not.toBe(hash);
  });
});

describe("opaque photo URLs", () => {
  it("encrypts the employee id and expiry so no internal id leaks", () => {
    const employeeId = "6f0a34a4-0000-4000-8000-000000000001";
    const { path, expiresAt } = createPhotoToken(employeeId);
    expect(path).not.toContain(employeeId);
    expect(path.startsWith("/api/media/photo/")).toBe(true);
    const token = path.split("/").pop()!;
    const parsed = parsePhotoToken(token);
    expect(parsed?.employeeId).toBe(employeeId);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects expired, tampered and malformed tokens", () => {
    const employeeId = "6f0a34a4-0000-4000-8000-000000000001";
    const { path, expiresAt } = createPhotoToken(employeeId);
    const token = path.split("/").pop()!;
    expect(parsePhotoToken(token, expiresAt.getTime() + 1000)).toBeNull();
    expect(parsePhotoToken(`${token.slice(0, -2)}AA`)).toBeNull();
    expect(parsePhotoToken("not-a-token")).toBeNull();
    expect(parsePhotoToken("")).toBeNull();
  });
});

describe("MFA tickets", () => {
  it("round-trips a valid ticket", () => {
    const ticket = createMfaTicket("admin-id", "totp");
    const payload = verifyMfaTicket(ticket);
    expect(payload?.sub).toBe("admin-id");
    expect(payload?.purpose).toBe("totp");
  });

  it("rejects expired and tampered tickets", () => {
    const expired = createMfaTicket("admin-id", "setup", -10);
    expect(verifyMfaTicket(expired)).toBeNull();
    const ticket = createMfaTicket("admin-id", "setup");
    expect(verifyMfaTicket(`${ticket.slice(0, -2)}xx`)).toBeNull();
    expect(verifyMfaTicket(undefined)).toBeNull();
  });
});

describe("verify URL and QR policy", () => {
  it("builds only HTTPS verification URLs with the token", () => {
    const token = generateCardToken();
    expect(buildVerifyUrl("https://verify.example.com", token)).toBe(`https://verify.example.com/v/${token}`);
    expect(buildVerifyUrl("https://Verify.Example.com/", token)).toBe(`https://verify.example.com/v/${token}`);
  });

  it("rejects invalid tokens in URLs", () => {
    expect(() => buildVerifyUrl("https://verify.example.com", "not-a-token")).toThrow();
  });

  it("validates verification base URLs and uses error correction M or higher", () => {
    const check = validateVerifyBaseUrl("https://verify.example.com/", true);
    expect(check.ok).toBe(true);
    expect(check.productionValid).toBe(true);
    expect(check.normalized).toBe("https://verify.example.com");
    expect(displayVerifyDomain("https://verify.example.com")).toBe("verify.example.com");
    expect(validateVerifyBaseUrl("bad domain", false).ok).toBe(false);
    expect(["M", "Q", "H"]).toContain(QR_ERROR_CORRECTION_LEVEL);
  });
});

describe("constant time comparison", () => {
  it("compares equal strings safely", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});
