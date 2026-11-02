import { describe, expect, it } from "vitest";
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR, normalizeHexColor } from "@/lib/colors";
import { isValidTimeZone, normalizeTimeZone, supportedTimeZones } from "@/lib/timezone";
import { companySettingsSchema } from "@/lib/validation/schemas";

const base = {
  name: "Bremer",
  tagline: "Established 1989",
  website: "https://bremer.example",
  show_verify_host_on_card: "0",
  primary_color: "#0F766E",
  secondary_color: "#F59E0B",
  contact_phone: "+20 100 000 0000",
  contact_email: "hr@example.com",
  verify_base_url: "https://verify.example.com",
  time_zone: "Africa/Cairo",
  idle_timeout_minutes: 60,
  default_card_validity_days: 365,
  scan_log_retention_days: 365,
};

describe("time zone validation", () => {
  it.each(["Africa/Cairo", "UTC", "Europe/London"])("accepts %s", (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
    expect(normalizeTimeZone(zone)).toBe(zone);
    expect(companySettingsSchema.safeParse({ ...base, time_zone: zone }).success).toBe(true);
  });

  it("trims before validating", () => {
    expect(normalizeTimeZone("  Europe/London  ")).toBe("Europe/London");
    expect(companySettingsSchema.safeParse({ ...base, time_zone: " Africa/Cairo " }).success).toBe(true);
  });

  it.each(["", "   ", "Mars/Olympus", "Africa/Cairo;rm", "UTC+2", "__proto__"])("rejects junk value %s", (zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
    expect(companySettingsSchema.safeParse({ ...base, time_zone: zone }).success).toBe(false);
  });

  it("falls back to the default for an invalid zone", () => {
    expect(normalizeTimeZone("not/a-zone")).toBe("Africa/Cairo");
  });

  it("builds a searchable list containing Cairo and UTC", () => {
    const zones = supportedTimeZones();
    expect(zones).toContain("Africa/Cairo");
    expect(zones).toContain("UTC");
    expect(zones.length).toBeGreaterThan(20);
  });
});

describe("card colour fallback", () => {
  it("falls back for empty or malformed primary/secondary values", () => {
    expect(normalizeHexColor("", DEFAULT_PRIMARY_COLOR)).toBe(DEFAULT_PRIMARY_COLOR);
    expect(normalizeHexColor("#GGGGGG", DEFAULT_SECONDARY_COLOR)).toBe(DEFAULT_SECONDARY_COLOR);
    expect(normalizeHexColor("not-a-colour", DEFAULT_PRIMARY_COLOR)).toBe(DEFAULT_PRIMARY_COLOR);
  });

  it("keeps a valid colour", () => {
    expect(normalizeHexColor("#4338ca", DEFAULT_PRIMARY_COLOR)).toBe("#4338ca");
  });
});
