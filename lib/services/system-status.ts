import { stat, statfs, readdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { env, initialVerifyBaseUrl } from "@/lib/env";
import { getClientIpDetails } from "@/lib/http";
import { getStorageRoot } from "@/lib/storage";
import { validateVerifyBaseUrl } from "@/lib/qr";

export type CheckState = "ok" | "warn" | "error";

export interface StatusCheck {
  id: string;
  state: CheckState;
  detail: string;
}

export interface SystemStatus {
  checks: StatusCheck[];
  ip: string;
  ipSource: string;
  forwardedChain: string[];
  trustedHops: number;
  protocol: string;
  host: string;
  appVersion: string;
  verifyUrl: string;
}

async function checkDatabase(): Promise<StatusCheck> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - started;
    return { id: "database", state: latency < 500 ? "ok" : "warn", detail: `${latency} ms` };
  } catch {
    return { id: "database", state: "error", detail: "unreachable" };
  }
}

async function checkRedis(): Promise<StatusCheck> {
  if (!env.REDIS_URL) {
    return {
      id: "redis",
      state: "warn",
      detail: "not configured — in-process import processing and Postgres rate limiting",
    };
  }
  try {
    const { Redis } = await import("ioredis");
    const client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
    });
    const started = Date.now();
    await client.connect();
    await client.ping();
    await client.quit();
    return { id: "redis", state: "ok", detail: `${Date.now() - started} ms` };
  } catch {
    return { id: "redis", state: "error", detail: "unreachable" };
  }
}

async function checkStorage(): Promise<StatusCheck> {
  try {
    const root = getStorageRoot();
    const info = await stat(root);
    if (!info.isDirectory()) return { id: "storage", state: "error", detail: "not a directory" };
    const free = await statfs(root);
    const availableBytes = Number(free.bavail) * Number(free.bsize);
    const gb = availableBytes / 1024 ** 3;
    return {
      id: "storage",
      state: gb > 1 ? "ok" : "warn",
      detail: `${gb.toFixed(1)} GB free`,
    };
  } catch {
    return { id: "storage", state: "error", detail: "storage directory unavailable" };
  }
}

async function checkVerifyUrl(baseUrl: string): Promise<StatusCheck> {
  const check = validateVerifyBaseUrl(baseUrl, env.NODE_ENV === "production");
  if (!check.ok) return { id: "verifyUrl", state: "error", detail: check.errors.join(", ") };
  if (!check.productionValid) {
    return { id: "verifyUrl", state: "warn", detail: "not production-valid (HTTPS public host required)" };
  }
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const body = (await response.json().catch(() => null)) as { status?: string } | null;
    if (response.ok && body?.status === "ok") return { id: "verifyUrl", state: "ok", detail: baseUrl };
    return { id: "verifyUrl", state: "error", detail: `HTTP ${response.status}` };
  } catch {
    return { id: "verifyUrl", state: "error", detail: "request failed" };
  }
}

async function checkHttps(headers: Headers): Promise<StatusCheck> {
  const proto = headers.get("x-forwarded-proto") ?? (headers.get("x-forwarded-ssl") === "on" ? "https" : "");
  const appHttps = env.APP_URL.startsWith("https://");
  if (proto === "https" || appHttps) return { id: "https", state: "ok", detail: proto || "APP_URL https" };
  return { id: "https", state: "warn", detail: "request is not HTTPS (fine locally, not in production)" };
}

async function checkBackup(): Promise<StatusCheck> {
  try {
    const directory = path.resolve(process.cwd(), env.BACKUP_DIR);
    const files = (await readdir(directory)).filter((file) => file.endsWith(".evsbak"));
    if (files.length === 0) return { id: "backup", state: "warn", detail: "no backup found" };
    const times = await Promise.all(files.map(async (file) => (await stat(path.join(directory, file))).mtimeMs));
    const latest = Math.max(...times);
    const days = (Date.now() - latest) / 86_400_000;
    return {
      id: "backup",
      state: days <= 7 ? "ok" : "warn",
      detail: `${files.length} archive(s), latest ${days.toFixed(1)} days ago`,
    };
  } catch {
    return { id: "backup", state: "warn", detail: "no backup directory" };
  }
}

export async function getSystemStatus(headers: Headers, company: { verify_base_url: string }): Promise<SystemStatus> {
  const details = getClientIpDetails(headers);
  const [database, redis, storage, verifyUrl, https, backup] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkStorage(),
    checkVerifyUrl(company.verify_base_url || initialVerifyBaseUrl),
    checkHttps(headers),
    checkBackup(),
  ]);

  const protocol = headers.get("x-forwarded-proto") ?? (env.APP_URL.startsWith("https") ? "https" : "http");
  return {
    checks: [database, redis, storage, verifyUrl, https, backup],
    ip: details.ip,
    ipSource: details.source,
    forwardedChain: details.chain,
    trustedHops: env.TRUSTED_PROXY_HOPS,
    protocol,
    host: headers.get("x-forwarded-host") ?? headers.get("host") ?? "unknown",
    appVersion: process.env.npm_package_version ?? "1.0.0",
    verifyUrl: company.verify_base_url,
  };
}
