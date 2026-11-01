import "dotenv/config";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes, scryptSync, createCipheriv } from "node:crypto";
import AdmZip from "adm-zip";
import { env } from "../lib/env";
import { getStorageRoot } from "../lib/storage";

/**
 * Encrypted, portable backup:
 *   pg_dump (custom format) + storage files + manifest, zipped, then AES-256-GCM
 *   with a scrypt-derived key. Requires BACKUP_PASSPHRASE and pg_dump on PATH or
 *   PG_DUMP_PATH. Works on Windows and Linux.
 */
async function main() {
  if (!env.BACKUP_PASSPHRASE || env.BACKUP_PASSPHRASE.length < 12) {
    throw new Error("BACKUP_PASSPHRASE must be at least 12 characters");
  }
  const work = await mkdtemp(path.join(tmpdir(), "evs-backup-"));
  const dumpPath = path.join(work, "database.dump");
  const zipPath = path.join(work, "backup.zip");
  try {
    const pgDump = env.PG_DUMP_PATH || "pg_dump";
    const dump = spawnSync(pgDump, ["--format=custom", "--no-owner", "--file", dumpPath, env.DATABASE_URL], {
      stdio: "inherit",
      env: process.env,
    });
    if (dump.status !== 0) throw new Error(`pg_dump failed (${dump.status ?? "unknown"})`);

    const zip = new AdmZip();
    zip.addLocalFile(dumpPath, "", "database.dump");
    const storage = getStorageRoot();
    try {
      zip.addLocalFolder(storage, "storage");
    } catch {
      zip.addFile("storage/.keep", Buffer.from(""));
    }
    zip.addFile(
      "manifest.json",
      Buffer.from(
        JSON.stringify(
          {
            createdAt: new Date().toISOString(),
            app: "Tawthiq",
            version: process.env.npm_package_version ?? "1.0.0",
            database: "postgresql",
          },
          null,
          2,
        ),
        "utf8",
      ),
    );
    await writeFile(zipPath, zip.toBuffer());

    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = scryptSync(env.BACKUP_PASSPHRASE, salt, 32);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const plaintext = await readFile(zipPath);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([Buffer.from("EVSBK1"), salt, iv, tag, ciphertext]);

    const directory = path.resolve(process.cwd(), env.BACKUP_DIR);
    await mkdir(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const target = path.join(directory, `evs-${stamp}.evsbak`);
    await writeFile(target, payload);
    console.log(`[backup] wrote ${target} (${(payload.length / 1024 / 1024).toFixed(1)} MB)`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[backup] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
