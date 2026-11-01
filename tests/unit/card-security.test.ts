import { describe, expect, it } from "vitest";
import { checkCardPrintability, prepareCard, type PrintCheckInput } from "@/lib/services/cards";
import { decryptCardToken, encryptCardToken } from "@/lib/security/crypto";

function base(overrides: Partial<PrintCheckInput> = {}): PrintCheckInput {
  const input: PrintCheckInput = {
    employee: { status: "ACTIVE", photo_path: "photos/a.jpg", deleted_at: null },
    card: {
      status: "ACTIVE",
      expires_at: new Date(Date.now() + 86400000),
      token_enc: "v1.x.y.z",
    },
    company: { status: "ACTIVE", verify_base_url: "https://verify.example.com" },
    mode: "cr80",
  };
  return {
    ...input,
    ...overrides,
    employee: { ...input.employee, ...(overrides.employee ?? {}) },
    card: { ...input.card, ...(overrides.card ?? {}) },
    company: { ...input.company, ...(overrides.company ?? {}) },
  };
}

describe("card token storage", () => {
  it("encrypts the raw token and never returns it in the prepared record", () => {
    const prepared = prepareCard(new Date(Date.now() + 86400000));
    const serialized = JSON.stringify(prepared);
    const token = decryptCardToken(prepared.tokenEnc);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(serialized).not.toContain(token!);
    expect(token).not.toBe(prepared.tokenEnc);
    expect(prepared.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(encryptCardToken(token!)).not.toBe(prepared.tokenEnc);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptCardToken("A".repeat(32));
    expect(decryptCardToken(`${encrypted.slice(0, -2)}xx`)).toBeNull();
  });
});

describe("printing rules", () => {
  it("allows a complete, active, production-valid card", () => {
    expect(checkCardPrintability(base()).ok).toBe(true);
  });

  it("blocks a missing photo and an invalid verification domain", () => {
    expect(checkCardPrintability(base({ employee: { status: "ACTIVE", photo_path: null, deleted_at: null } })).errors).toContain("photo_missing");
    const invalid = checkCardPrintability(base({ company: { status: "ACTIVE", verify_base_url: "http://localhost:3000" } }));
    expect(invalid.ok).toBe(false);
    expect(invalid.errors).toContain("verify_domain_invalid");
  });

  it("allows an explicit test print without a photo but never for dead cards", () => {
    expect(checkCardPrintability(base({ mode: "test", employee: { status: "ACTIVE", photo_path: null, deleted_at: null }, company: { status: "ACTIVE", verify_base_url: "http://localhost:3000" } })).ok).toBe(true);
    expect(checkCardPrintability(base({ mode: "test", card: { status: "REVOKED", expires_at: new Date(Date.now() + 86400000), token_enc: "x" } })).ok).toBe(false);
    expect(checkCardPrintability(base({ mode: "test", card: { status: "ACTIVE", expires_at: new Date(Date.now() - 86400000), token_enc: "x" } })).ok).toBe(false);
  });

  it("requires a re-issue when the encrypted token is missing", () => {
    const check = checkCardPrintability(base({ card: { status: "ACTIVE", expires_at: new Date(Date.now() + 86400000), token_enc: null } }));
    expect(check.ok).toBe(false);
    expect(check.errors).toContain("card_needs_reissue");
  });
});
