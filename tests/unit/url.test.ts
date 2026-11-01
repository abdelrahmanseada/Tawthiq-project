import { describe, expect, it } from "vitest";
import { buildVerifyUrl, displayVerifyDomain, validateVerifyBaseUrl } from "@/lib/qr";

describe("verification base URL validation", () => {
  it("accepts a public HTTPS URL on 443", () => {
    const check = validateVerifyBaseUrl("https://verify.example.com", true);
    expect(check.ok).toBe(true);
    expect(check.productionValid).toBe(true);
    expect(check.normalized).toBe("https://verify.example.com");
  });

  it("rejects localhost, LAN, private IPs and .local in production", () => {
    for (const url of [
      "http://localhost:3000",
      "https://localhost:3000",
      "https://127.0.0.1",
      "https://192.168.1.10",
      "https://10.0.0.5",
      "https://172.20.0.5",
      "https://verify.local",
      "http://verify.example.com",
      "https://verify.example.com:8443",
    ]) {
      const check = validateVerifyBaseUrl(url, true);
      expect(check.productionValid, url).toBe(false);
    }
  });

  it("allows local development URLs without marking them production-valid", () => {
    for (const url of ["http://localhost:3000", "http://192.168.1.20:3000", "http://10.0.0.2:3000"]) {
      const check = validateVerifyBaseUrl(url, false);
      expect(check.ok, url).toBe(true);
      expect(check.productionValid, url).toBe(false);
    }
  });

  it("rejects paths, credentials and malformed URLs", () => {
    for (const url of ["https://verify.example.com/path", "https://user:pass@verify.example.com", "not a url"]) {
      expect(validateVerifyBaseUrl(url, false).ok, url).toBe(false);
    }
  });

  it("builds and displays only the verification endpoint", () => {
    const token = "Zx7Qp2Lm9Rt4Vw8Yb3Nc6Hd1Ks5Jf0Ga";
    expect(buildVerifyUrl("https://verify.example.com/", token)).toBe(`https://verify.example.com/v/${token}`);
    expect(displayVerifyDomain("https://verify.example.com/")).toBe("verify.example.com");
  });
});
