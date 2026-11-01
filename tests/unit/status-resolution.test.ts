import { describe, expect, it } from "vitest";
import { resolveVerificationOutcome } from "@/lib/services/verification";

const now = new Date("2026-06-15T12:00:00.000Z");
const future = new Date("2026-12-31T23:59:59.999Z");
const past = new Date("2026-01-01T00:00:00.000Z");

function card(overrides: {
  status?: "ACTIVE" | "REVOKED";
  expires?: Date;
  employeeStatus?: "ACTIVE" | "SUSPENDED" | "TERMINATED";
  deletedAt?: Date | null;
} = {}) {
  return {
    status: overrides.status ?? "ACTIVE",
    expires_at: overrides.expires ?? future,
    employee: {
      status: overrides.employeeStatus ?? "ACTIVE",
      deleted_at: overrides.deletedAt ?? null,
    },
  } as const;
}

describe("verification status resolution", () => {
  it("returns INVALID when the card does not exist", () => {
    expect(resolveVerificationOutcome(null, now)).toEqual({ state: "invalid", result: "INVALID" });
  });

  it("returns VALID for an active card on an active employee before expiry", () => {
    expect(resolveVerificationOutcome(card(), now)).toEqual({ state: "valid", result: "VALID" });
  });

  it("returns EXPIRED after the expiry date", () => {
    expect(resolveVerificationOutcome(card({ expires: past }), now)).toEqual({
      state: "expired",
      result: "EXPIRED",
    });
  });

  it("returns a cancelled state for revoked cards", () => {
    expect(resolveVerificationOutcome(card({ status: "REVOKED" }), now)).toEqual({
      state: "cancelled",
      result: "REVOKED",
    });
  });

  it("returns a cancelled state for suspended employees", () => {
    expect(resolveVerificationOutcome(card({ employeeStatus: "SUSPENDED" }), now)).toEqual({
      state: "cancelled",
      result: "SUSPENDED",
    });
  });

  it("returns a cancelled state for terminated employees", () => {
    expect(resolveVerificationOutcome(card({ employeeStatus: "TERMINATED" }), now)).toEqual({
      state: "cancelled",
      result: "REVOKED",
    });
  });

  it("returns a cancelled state for soft-deleted employees", () => {
    expect(resolveVerificationOutcome(card({ deletedAt: past }), now)).toEqual({
      state: "cancelled",
      result: "REVOKED",
    });
  });

  it("prefers cancelled over expired so no reason or identity leaks", () => {
    expect(
      resolveVerificationOutcome(card({ status: "REVOKED", expires: past }), now),
    ).toEqual({ state: "cancelled", result: "REVOKED" });
  });

  it("treats expiry exactly at the current instant as expired", () => {
    expect(resolveVerificationOutcome(card({ expires: now }), now)).toEqual({
      state: "expired",
      result: "EXPIRED",
    });
  });
});
