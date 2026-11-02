import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";

const options = {
  appUrl: "http://localhost:3000",
  authUrl: "http://localhost:3000",
  allowedOrigins: "",
  trustHost: true,
  production: true,
};

function request(origin: string | null, init: { method?: string; host?: string; proto?: string } = {}) {
  const headers = new Headers({ host: init.host ?? "localhost:3000" });
  if (origin) headers.set("origin", origin);
  headers.set("x-forwarded-host", init.host ?? "localhost:3000");
  headers.set("x-forwarded-proto", init.proto ?? "http");
  return new Request("http://localhost:3000/api/admin/cards/pdf", {
    method: init.method ?? "POST",
    headers,
  });
}

describe("route-handler origin policy", () => {
  it("passes a same-origin POST", async () => {
    const { assertSameOrigin } = await import("@/lib/http");
    expect(() => assertSameOrigin(request("http://localhost:3000"), options)).not.toThrow();
  });

  it("rejects a cross-origin POST", async () => {
    const { assertSameOrigin } = await import("@/lib/http");
    try {
      assertSameOrigin(request("https://evil.example"), options);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("CSRF_INVALID_ORIGIN");
    }
  });

  it("rejects a tunnel origin unless explicitly listed", async () => {
    const { assertSameOrigin } = await import("@/lib/http");
    expect(() => assertSameOrigin(request("https://random-name.trycloudflare.com"), options)).toThrow(ApiError);
    expect(() =>
      assertSameOrigin(request("https://random-name.trycloudflare.com", { host: "random-name.trycloudflare.com", proto: "https" }), {
        ...options,
        allowedOrigins: "https://random-name.trycloudflare.com",
      }),
    ).not.toThrow();
  });

  it("never trusts the company verification URL", async () => {
    const { assertSameOrigin } = await import("@/lib/http");
    expect(() => assertSameOrigin(request("https://verify.example.com"), options)).toThrow(ApiError);
  });

  it("rejects POST without an Origin and allows same-site GET navigation", async () => {
    const { evaluateOrigin } = await import("@/lib/http");
    expect(evaluateOrigin(request(null), options).allowed).toBe(false);
    expect(evaluateOrigin(request(null, { method: "GET" }), options).allowed).toBe(true);
  });

  it("allows localhost development origins only outside production", async () => {
    const { evaluateOrigin } = await import("@/lib/http");
    const local = request("http://127.0.0.1:3000", { host: "127.0.0.1:3000" });
    expect(evaluateOrigin(local, { ...options, appUrl: "https://app.example", production: false, trustHost: false }).allowed).toBe(true);
    expect(evaluateOrigin(local, { ...options, appUrl: "https://app.example", production: true, trustHost: false }).allowed).toBe(false);
  });

  it("allows a tunnel only when it is explicitly in ALLOWED_ORIGINS", async () => {
    const { evaluateOrigin } = await import("@/lib/http");
    const tunnelRequest = request("https://tunnel.example", { host: "tunnel.example", proto: "https" });
    expect(evaluateOrigin(tunnelRequest, { ...options, trustHost: true }).allowed).toBe(false);
    expect(evaluateOrigin(tunnelRequest, { ...options, allowedOrigins: "https://tunnel.example" }).allowed).toBe(true);
  });
});
