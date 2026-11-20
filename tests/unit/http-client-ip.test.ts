import { afterEach, describe, expect, it, vi } from "vitest";

const originalProxy = process.env.TRUSTED_PROXY;
const originalHops = process.env.TRUSTED_PROXY_HOPS;

/** env is read once per module graph, so each mode needs a fresh import. */
async function load(mode: "none" | "proxy" | "cloudflare", hops = 1) {
  process.env.TRUSTED_PROXY = mode;
  process.env.TRUSTED_PROXY_HOPS = String(hops);
  vi.resetModules();
  return (await import("@/lib/http")).getClientIpDetails;
}

function headers(init: Record<string, string>): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(init)) result.set(name, value);
  return result;
}

afterEach(() => {
  process.env.TRUSTED_PROXY = originalProxy;
  process.env.TRUSTED_PROXY_HOPS = originalHops;
  vi.resetModules();
});

describe("client IP resolution", () => {
  it("ignores forged headers when no proxy is configured", async () => {
    const getIp = await load("none");
    expect(getIp(headers({ "cf-connecting-ip": "203.0.113.9" })).ip).toBe("unknown");
    expect(getIp(headers({ "x-forwarded-for": "203.0.113.9" })).ip).toBe("unknown");
    expect(getIp(headers({ "x-real-ip": "203.0.113.9" })).ip).toBe("unknown");
  });

  it("trusts only CF-Connecting-IP in cloudflare mode", async () => {
    const getIp = await load("cloudflare");
    expect(getIp(headers({ "cf-connecting-ip": "203.0.113.9" })).ip).toBe("203.0.113.9");
    expect(getIp(headers({ "x-forwarded-for": "203.0.113.7" })).ip).toBe("unknown");
  });

  it("uses the hop counted from the right of X-Forwarded-For in proxy mode", async () => {
    const forwarded = headers({ "x-forwarded-for": "198.51.100.5, 203.0.113.9" });
    const oneHop = await load("proxy", 1);
    expect(oneHop(forwarded).ip).toBe("203.0.113.9");
    const twoHops = await load("proxy", 2);
    expect(twoHops(forwarded).ip).toBe("198.51.100.5");
  });

  it("falls back to X-Real-IP in proxy mode", async () => {
    const getIp = await load("proxy");
    expect(getIp(headers({ "x-real-ip": "203.0.113.9" })).ip).toBe("203.0.113.9");
  });
});
