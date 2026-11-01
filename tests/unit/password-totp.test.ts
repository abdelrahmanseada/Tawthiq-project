import { authenticator } from "otplib";
import { describe, expect, it } from "vitest";
import {
  checkPasswordPolicy,
  hashPassword,
  verifyPassword,
  PASSWORD_MIN_LENGTH,
} from "@/lib/security/password";
import {
  buildTotpKeyUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  verifyTotpCode,
} from "@/lib/auth/totp";

describe("password policy and argon2id hashing", () => {
  it("enforces length, letters, numbers and common-password rules", () => {
    expect(checkPasswordPolicy("short1")).toBe("too_short");
    expect(checkPasswordPolicy("allletterslong")).toBe("missing_number");
    expect(checkPasswordPolicy("1234567890123")).toBe("missing_letter");
    expect(checkPasswordPolicy("password1234")).toBe("too_common");
    expect(checkPasswordPolicy("x".repeat(129))).toBe("too_long");
    expect(checkPasswordPolicy("A-very-long-password-2026")).toBeNull();
  });

  it("hashes with a salted argon2id string and verifies correctly", async () => {
    const hash = await hashPassword("A-very-long-password-2026");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("A-very-long-password-2026");
    expect(await verifyPassword(hash, "A-very-long-password-2026")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password-2026")).toBe(false);
    expect(await verifyPassword("not-a-hash", "A-very-long-password-2026")).toBe(false);
  });

  it("uses a policy minimum of at least 12 characters", () => {
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(12);
  });
});

describe("TOTP", () => {
  it("encrypts the TOTP secret at rest and verifies generated codes", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);

    const code = authenticator.generate(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code)).toBe(true);
    const wrongCode = `${(Number(code[0]) + 1) % 10}${code.slice(1)}`;
    expect(verifyTotpCode(secret, wrongCode)).toBe(false);
    expect(verifyTotpCode(secret, "12345")).toBe(false);
  });

  it("builds an otpauth URI containing the e-mail and issuer", () => {
    const secret = generateTotpSecret();
    const uri = buildTotpKeyUri(secret, "admin@example.com");
    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(decodeURIComponent(uri)).toContain("admin@example.com");
    expect(decodeURIComponent(uri)).toContain("Employee Verification System");
  });
});
