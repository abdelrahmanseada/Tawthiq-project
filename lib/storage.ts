import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";

/**
 * Private file storage (photos, logos, rendered card PDFs, import staging files).
 *
 * Files live OUTSIDE the public web root and are only reachable through
 * authenticated route handlers or short-lived signed URLs. Swapping this module
 * for an S3-compatible client is the intended production upgrade path.
 */
export const STORAGE_KINDS = ["photos", "logos", "cards", "imports", "reports"] as const;
export type StorageKind = (typeof STORAGE_KINDS)[number];

const STORAGE_ROOT = path.resolve(process.cwd(), env.STORAGE_DIR);
const KEY_PATTERN = new RegExp(`^(${STORAGE_KINDS.join("|")})/[A-Za-z0-9._/-]+$`);

export class StorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key: ${key.slice(0, 100)}`);
    this.name = "StorageKeyError";
  }
}

export function getStorageRoot(): string {
  return STORAGE_ROOT;
}

function assertSafeKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes("..") || key.includes("\\") || key.startsWith("/")) {
    throw new StorageKeyError(key);
  }
}

/** Absolute path for a validated storage key, guaranteed to stay inside the root. */
export function resolveStoragePath(key: string): string {
  assertSafeKey(key);
  const absolute = path.resolve(STORAGE_ROOT, key);
  if (!absolute.startsWith(STORAGE_ROOT + path.sep)) throw new StorageKeyError(key);
  return absolute;
}

/** Sanitise a single path segment and build a storage key. */
export function storageKey(kind: StorageKind, ...segments: string[]): string {
  const cleaned = segments.map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, "_"));
  return [kind, ...cleaned].join("/");
}

export async function ensureStorage(): Promise<void> {
  await Promise.all(STORAGE_KINDS.map((kind) => mkdir(path.join(STORAGE_ROOT, kind), { recursive: true })));
}

export async function writeStorageFile(key: string, data: Buffer | Uint8Array | string): Promise<void> {
  const absolute = resolveStoragePath(key);
  await mkdir(path.dirname(absolute), { recursive: true });
  const tempPath = `${absolute}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, data);
  await rename(tempPath, absolute);
}

export async function readStorageFile(key: string): Promise<Buffer> {
  return readFile(resolveStoragePath(key));
}

export async function storageFileExists(key: string): Promise<boolean> {
  try {
    await access(resolveStoragePath(key), fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function storageFileSize(key: string): Promise<number> {
  const info = await stat(resolveStoragePath(key));
  return info.size;
}

export async function removeStorageFile(key: string): Promise<void> {
  try {
    await rm(resolveStoragePath(key), { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("storage_remove_failed", error instanceof Error ? error.message : "unknown");
    }
  }
}

/** Encrypted JSON at rest (import previews contain employee personal data). */
export async function writeEncryptedJson(key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);
  await writeStorageFile(key, encryptSecret(serialized));
}

export async function readEncryptedJson<T>(key: string): Promise<T> {
  const payload = await readStorageFile(key);
  return JSON.parse(decryptSecret(payload.toString("utf8"))) as T;
}

export function contentTypeForStorageKey(key: string): string {
  const extension = path.extname(key).toLowerCase();
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".pdf":
      return "application/pdf";
    case ".zip":
      return "application/zip";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return "application/octet-stream";
  }
}
