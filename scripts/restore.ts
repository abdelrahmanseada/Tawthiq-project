import "dotenv/config";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { scryptSync, createDecipheriv } from "node:crypto";
import AdmZip from "adm-zip";
import { env } from "../lib/env";
import { getStorageRoot } from "../lib/storage";

/**
 * Restore an encrypted .evsbak archive. Requires RESTORE_CONFIRM=YES because it
 * replaces the current database content and storage files.
 *   npm run restore -- backups/evs-....evsbak
 */
async function main() {
  const archive = process.argv[2];
  if (!archive) throw new Error("Usage: npm run restore -- <backup.evsbak>");
  if (process.env.RESTORE_CONFIRM !== "YES") {
    throw new Error("Set RESTORE_CONFIRM=YES to confirm replacing the current data");
  }
  if (!env.BACKUP_PASSPHRASE || env.BACKUP_PASSPHRASE.length < 12) {
    throw new Error("BACKUP_PASSPHRASE is required");
  }

  const payload = await readFile(path.resolve(process.cwd(), archive));
  if (payload.subarray(0, 6).toString("utf8") !== "EVSBK1") throw new Error("Not a Bremer backup archive");
  const salt = payload.subarray(6, 22);
  const iv = payload.subarray(22, 34);
  const tag = payload.subarray(34, 50);
  const ciphertext = payload.subarray(50);
  const key = scryptSync(env.BACKUP_PASSPHRASE, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let plaintext: Buffer;
  try {
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("Wrong passphrase or corrupted archive");
  }

  const work = await mkdtemp(path.join(tmpdir(), "evs-restore-"));
  try {
    const zip = new AdmZip(plaintext);
    zip.extractAllTo(work, true);
    const dumpPath = path.join(work, "database.dump");
    await readFile(dumpPath);

    const pgRestore = env.PG_RESTORE_PATH || "pg_restore";
    const restore = spawnSync(
      pgRestore,
      ["--clean", "--if-exists", "--no-owner", "--dbname", env.DATABASE_URL, dumpPath],
      { stdio: "inherit", env: process.env },
    );
    if (restore.status !== 0) throw new Error(`pg_restore failed (${restore.status ?? "unknown"})`);

    const storageSource = path.join(work, "storage");
    const storageTarget = getStorageRoot();
    const copy = spawnSync(
      process.platform === "win32" ? "cmd" : "cp",
      process.platform === "win32"
        ? ["/c", "xcopy", storageSource, storageTarget, "/E", "/I", "/Y"]
        : ["-R", `${storageSource}/.`, storageTarget],
      { stdio: "inherit" },
    );
    if (copy.status !== 0) throw new Error("Storage restore failed");

    console.log("[restore] database and storage restored. Restart the app.");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[restore] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
