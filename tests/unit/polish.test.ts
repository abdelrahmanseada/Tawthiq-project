import { describe, expect, it } from "vitest";
import { kpiDelta } from "@/lib/kpi";
import { maskEmail } from "@/lib/mask";
import { profileSchema } from "@/lib/validation/schemas";
import { friendlyUserAgent } from "@/lib/user-agent";
import { roleLabel } from "@/lib/auth/rbac";

describe("kpiDelta", () => {
  it("never renders a delta when both windows are zero", () => {
    expect(kpiDelta(0, 0)).toEqual({ kind: "none" });
  });
  it("uses New when the previous value is zero", () => {
    expect(kpiDelta(1, 0)).toEqual({ kind: "new" });
    expect(kpiDelta(9, 0)).toEqual({ kind: "new" });
  });
  it("uses absolute change below ten previous events", () => {
    expect(kpiDelta(7, 5)).toEqual({ kind: "absolute", change: 2 });
    expect(kpiDelta(2, 5)).toEqual({ kind: "absolute", change: -3 });
  });
  it("uses percentages for stable baselines", () => {
    expect(kpiDelta(20, 10)).toEqual({ kind: "percent", change: 100 });
    expect(kpiDelta(5, 10)).toEqual({ kind: "percent", change: -50 });
  });
});

describe("profile fields", () => {
  it("trims a valid Latin name and lowercases e-mail", () => {
    const parsed = profileSchema.parse({ name: "  Alex Morgan  ", email: " ALEX@Example.COM " });
    expect(parsed.name).toBe("Alex Morgan");
    expect(parsed.email).toBe("alex@example.com");
  });
  it("rejects short names and non-Latin names", () => {
    expect(profileSchema.safeParse({ name: "A", email: "a@example.com" }).success).toBe(false);
    expect(profileSchema.safeParse({ name: "أحمد", email: "a@example.com" }).success).toBe(false);
  });
  it("rejects malformed e-mail", () => {
    expect(profileSchema.safeParse({ name: "Alex Morgan", email: "not-an-email" }).success).toBe(false);
  });
});

describe("maskEmail", () => {
  it("keeps only the first local character and domain", () => {
    expect(maskEmail("Abdelrahman@Gmail.com")).toBe("a***@gmail.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
    expect(maskEmail("invalid")).toBe("***");
  });
});

describe("friendlyUserAgent", () => {
  it("returns readable browser and OS labels", () => {
    expect(friendlyUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(friendlyUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Firefox/120.0")).toBe("Firefox on macOS");
    expect(friendlyUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile Safari/604.1")).toBe("Safari on iOS");
    expect(friendlyUserAgent(null)).toBe("Unknown browser");
  });
});

describe("roleLabel", () => {
  it("uses the three display labels consistently", () => {
    expect(roleLabel("SUPER_ADMIN")).toBe("Owner");
    expect(roleLabel("ADMIN")).toBe("Admin");
    expect(roleLabel("VIEWER")).toBe("Viewer");
  });
});
